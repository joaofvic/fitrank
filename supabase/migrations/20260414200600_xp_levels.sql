-- =============================================================
-- Epic 2 — Níveis / XP com Progressão Visual
-- =============================================================

-- 1. Coluna XP no perfil
alter table public.profiles add column if not exists xp int not null default 0;

-- 2. Função: calcula nível a partir do XP (curva quadrática)
--    Nível 1 = 100 XP, Nível 2 = 400 XP, Nível 10 = 10000 XP
create or replace function public.calculate_level(p_xp int)
returns int
language sql immutable
as $$
  select greatest(0, floor(sqrt(p_xp::numeric / 100))::int);
$$;

-- 3. Função: XP necessário para atingir determinado nível
create or replace function public.xp_for_level(p_level int)
returns int
language sql immutable
as $$
  select (p_level * p_level * 100);
$$;

-- 4. Função: informações completas de nível de um usuário
create or replace function public.profile_level_info(p_user_id uuid)
returns table (
  current_xp   int,
  level        int,
  xp_current_level int,
  xp_next_level    int,
  xp_progress_pct  numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    p.xp as current_xp,
    public.calculate_level(p.xp) as level,
    public.xp_for_level(public.calculate_level(p.xp)) as xp_current_level,
    public.xp_for_level(public.calculate_level(p.xp) + 1) as xp_next_level,
    case
      when public.xp_for_level(public.calculate_level(p.xp) + 1) - public.xp_for_level(public.calculate_level(p.xp)) = 0
        then 100.0
      else round(
        (p.xp - public.xp_for_level(public.calculate_level(p.xp)))::numeric
        / (public.xp_for_level(public.calculate_level(p.xp) + 1) - public.xp_for_level(public.calculate_level(p.xp)))::numeric
        * 100, 1
      )
    end as xp_progress_pct
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.calculate_level(int) to authenticated;
grant execute on function public.xp_for_level(int) to authenticated;
grant execute on function public.profile_level_info(uuid) to authenticated;

-- 5. Modificar apply_checkin_to_profile para conceder XP
--    Base: +10 XP + streak_bonus (+2 por dia de streak)
create or replace function public.apply_checkin_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
  v_streak int;
  v_pontos int;
  v_xp int;
  v_yesterday date;
  v_xp_gain int;
begin
  select p.last_checkin_date, p.streak, p.pontos, p.xp
  into v_last, v_streak, v_pontos, v_xp
  from public.profiles p
  where p.id = new.user_id
  for update;

  v_yesterday := new.checkin_local_date - 1;

  if v_last is null then
    v_streak := 1;
  elsif v_last = new.checkin_local_date then
    v_streak := coalesce(v_streak, 0);
  elsif v_last = v_yesterday then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  -- XP: base 10 + streak bonus (2 * streak atual, cap 100)
  v_xp_gain := 10 + least(v_streak * 2, 100);

  begin
    perform set_config('fitrank.internal_profile_update', '1', true);
    update public.profiles
    set
      pontos = coalesce(v_pontos, 0) + new.points_awarded,
      streak = v_streak,
      last_checkin_date = new.checkin_local_date,
      xp = coalesce(v_xp, 0) + v_xp_gain,
      updated_at = now()
    where id = new.user_id;
    perform set_config('fitrank.internal_profile_update', '0', true);
  exception
    when others then
      perform set_config('fitrank.internal_profile_update', '0', true);
      raise;
  end;

  return new;
end;
$$;

-- 6. Modificar check_and_award_badges para conceder +50 XP por badge desbloqueado
create or replace function public.check_and_award_badges(p_user_id uuid)
returns text[]
language plpgsql security definer
set search_path = public
as $$
declare
  v_streak int;
  v_pontos int;
  v_checkin_count int;
  v_friend_count int;
  v_tenant uuid;
  v_newly_awarded text[] := '{}';
  v_badge record;
  v_val int;
  v_badge_xp int := 0;
begin
  select streak, pontos, tenant_id
  into v_streak, v_pontos, v_tenant
  from public.profiles where id = p_user_id;

  select count(*) into v_checkin_count
  from public.checkins
  where user_id = p_user_id
    and photo_review_status is distinct from 'rejected';

  select count(*) into v_friend_count
  from public.friendships
  where status = 'accepted'
    and (requester_id = p_user_id or addressee_id = p_user_id);

  for v_badge in
    select b.id, b.slug, b.name, b.category, b.threshold
    from public.badges b
    where not exists (
      select 1 from public.user_badges ub
      where ub.user_id = p_user_id and ub.badge_id = b.id
    )
    order by b.sort_order
  loop
    v_val := case v_badge.category
      when 'streak'   then v_streak
      when 'checkins' then v_checkin_count
      when 'points'   then v_pontos
      when 'social'   then v_friend_count
      else 0
    end;

    if v_val >= v_badge.threshold then
      insert into public.user_badges (user_id, badge_id)
      values (p_user_id, v_badge.id)
      on conflict do nothing;

      v_newly_awarded := array_append(v_newly_awarded, v_badge.slug);
      v_badge_xp := v_badge_xp + 50;

      insert into public.notifications (user_id, tenant_id, type, title, body, data)
      values (
        p_user_id,
        v_tenant,
        'badge_unlocked',
        'Conquista desbloqueada!',
        v_badge.name,
        jsonb_build_object('badge_slug', v_badge.slug, 'badge_name', v_badge.name)
      );
    end if;
  end loop;

  -- Concede XP acumulado dos badges desbloqueados
  if v_badge_xp > 0 then
    update public.profiles
    set xp = xp + v_badge_xp, updated_at = now()
    where id = p_user_id;
  end if;

  return v_newly_awarded;
end;
$$;

-- 7. Atualizar get_user_public_profile para incluir xp
CREATE OR REPLACE FUNCTION public.get_user_public_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_profile record;
  v_approved_count bigint;
  v_recent jsonb;
  v_friendship_status text;
  v_friendship_id uuid;
BEGIN
  IF v_caller IS NULL OR v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;

  SELECT
    p.id,
    COALESCE(p.display_name, p.nome, 'Usuário') AS display_name,
    p.avatar_url,
    p.username,
    p.created_at,
    p.streak,
    p.pontos,
    p.xp,
    p.is_pro,
    p.academia
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id
    AND p.tenant_id = v_tenant;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuário não encontrado');
  END IF;

  SELECT count(*)
  INTO v_approved_count
  FROM public.checkins
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant
    AND photo_review_status = 'approved';

  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      c.id,
      c.user_id,
      c.checkin_local_date AS date,
      c.tipo_treino,
      c.points_awarded,
      c.foto_url,
      c.created_at,
      c.feed_caption,
      c.allow_comments,
      c.hide_likes_count,
      COALESCE((SELECT count(*) FROM public.likes l WHERE l.checkin_id = c.id), 0) AS likes_count,
      COALESCE((SELECT count(*) FROM public.comments co WHERE co.checkin_id = c.id), 0) AS comments_count,
      EXISTS(SELECT 1 FROM public.likes l2 WHERE l2.checkin_id = c.id AND l2.user_id = v_caller) AS has_liked
    FROM public.checkins c
    WHERE c.user_id = p_user_id
      AND c.tenant_id = v_tenant
      AND c.photo_review_status = 'approved'
    ORDER BY c.checkin_local_date DESC, c.created_at DESC
    LIMIT 20
  ) sub;

  SELECT f.id, f.status
  INTO v_friendship_id, v_friendship_status
  FROM public.friendships f
  WHERE f.tenant_id = v_tenant
    AND least(f.requester_id, f.addressee_id) = least(v_caller, p_user_id)
    AND greatest(f.requester_id, f.addressee_id) = greatest(v_caller, p_user_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'user_id', v_profile.id,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'username', v_profile.username,
    'created_at', v_profile.created_at,
    'streak', COALESCE(v_profile.streak, 0),
    'pontos', COALESCE(v_profile.pontos, 0),
    'xp', COALESCE(v_profile.xp, 0),
    'is_pro', COALESCE(v_profile.is_pro, false),
    'academia', v_profile.academia,
    'approved_checkins_count', v_approved_count,
    'recent_checkins', v_recent,
    'friendship_status', v_friendship_status,
    'friendship_id', v_friendship_id
  );
END;
$$;
