-- =============================================================
-- Epic 3 — Ligas / Divisões (Bronze a Diamante)
-- =============================================================

-- 1. Catálogo de ligas
create table if not exists public.leagues (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  min_xp     int not null default 0,
  icon_color text not null default '#CD7F32',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.leagues enable row level security;

create policy leagues_select on public.leagues
  for select to authenticated
  using (true);

-- 2. Seed com 5 ligas
insert into public.leagues (slug, name, min_xp, icon_color, sort_order) values
  ('bronze',   'Bronze',   0,     '#CD7F32', 10),
  ('silver',   'Prata',    1000,  '#C0C0C0', 20),
  ('gold',     'Ouro',     5000,  '#FFD700', 30),
  ('platinum', 'Platina',  15000, '#E5E4E2', 40),
  ('diamond',  'Diamante', 50000, '#B9F2FF', 50)
on conflict (slug) do nothing;

-- 3. Coluna league no perfil
alter table public.profiles add column if not exists league text not null default 'bronze';

-- 4. Função: recalcular liga com base no XP
create or replace function public.recalculate_league(p_user_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_xp int;
  v_new_league text;
  v_old_league text;
  v_tenant uuid;
begin
  select xp, league, tenant_id
  into v_xp, v_old_league, v_tenant
  from public.profiles where id = p_user_id;

  select slug into v_new_league
  from public.leagues
  where min_xp <= coalesce(v_xp, 0)
  order by min_xp desc
  limit 1;

  v_new_league := coalesce(v_new_league, 'bronze');

  if v_new_league is distinct from v_old_league then
    update public.profiles
    set league = v_new_league, updated_at = now()
    where id = p_user_id;

    -- Notifica promoção de liga
    if (select sort_order from public.leagues where slug = v_new_league)
       > coalesce((select sort_order from public.leagues where slug = v_old_league), 0)
    then
      insert into public.notifications (user_id, tenant_id, type, title, body, data)
      values (
        p_user_id, v_tenant,
        'league_promoted',
        'Promoção de Liga!',
        (select name from public.leagues where slug = v_new_league),
        jsonb_build_object(
          'old_league', v_old_league,
          'new_league', v_new_league,
          'league_name', (select name from public.leagues where slug = v_new_league)
        )
      );
    end if;
  end if;

  return v_new_league;
end;
$$;

grant execute on function public.recalculate_league(uuid) to authenticated;

-- 5. Atualizar apply_checkin_to_profile para chamar recalculate_league
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

  -- Streak recovery check-ins não ganham XP
  if new.tipo_treino = 'Streak Recovery' then
    v_xp_gain := 0;
  else
    v_xp_gain := 10 + least(v_streak * 2, 100);
  end if;

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

  -- Recalcula liga após incremento de XP
  perform public.recalculate_league(new.user_id);

  return new;
end;
$$;

-- 6. RPC: ranking filtrado por liga do caller
create or replace function public.get_league_leaderboard(
  p_start date,
  p_end date,
  p_period text default null
)
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  streak integer,
  is_pro boolean,
  academia text,
  avatar_url text,
  xp integer,
  league text
)
language sql stable security definer
set search_path = public
as $$
  with caller_league as (
    select league from public.profiles where id = auth.uid()
  ),
  checkin_agg as (
    select
      c.user_id,
      coalesce(sum(
        case when c.photo_review_status is distinct from 'rejected'
             then c.points_awarded else 0 end
      ), 0)::integer as pts
    from public.checkins c
    where c.tenant_id = public.current_tenant_id()
      and c.checkin_local_date >= p_start
      and c.checkin_local_date <= p_end
    group by c.user_id
  ),
  ledger_agg as (
    select
      l.user_id,
      coalesce(sum(l.delta), 0)::integer as pts
    from public.points_ledger l
    where l.tenant_id = public.current_tenant_id()
      and l.effective_date >= p_start
      and l.effective_date <= p_end
      and (p_period is null or l.period_scope is null or l.period_scope = p_period)
    group by l.user_id
  )
  select
    p.id,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
    (coalesce(ca.pts, 0) + coalesce(la.pts, 0))::integer as pontos,
    p.streak,
    p.is_pro,
    coalesce(nullif(trim(p.academia), ''), '') as academia,
    p.avatar_url::text,
    coalesce(p.xp, 0) as xp,
    p.league
  from public.profiles p
  cross join caller_league cl
  left join checkin_agg ca on ca.user_id = p.id
  left join ledger_agg la on la.user_id = p.id
  where p.tenant_id = public.current_tenant_id()
    and p.league = cl.league
  order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc;
$$;

grant execute on function public.get_league_leaderboard(date, date, text) to authenticated;

-- 7. Atualizar leaderboard geral para incluir league
drop function if exists public.get_tenant_leaderboard_period(date, date, text);

create or replace function public.get_tenant_leaderboard_period(
  p_start date,
  p_end date,
  p_period text default null
)
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  streak integer,
  is_pro boolean,
  academia text,
  avatar_url text,
  xp integer,
  league text
)
language sql stable security definer
set search_path = public
as $$
  with checkin_agg as (
    select
      c.user_id,
      coalesce(sum(
        case when c.photo_review_status is distinct from 'rejected'
             then c.points_awarded else 0 end
      ), 0)::integer as pts
    from public.checkins c
    where c.tenant_id = public.current_tenant_id()
      and c.checkin_local_date >= p_start
      and c.checkin_local_date <= p_end
    group by c.user_id
  ),
  ledger_agg as (
    select
      l.user_id,
      coalesce(sum(l.delta), 0)::integer as pts
    from public.points_ledger l
    where l.tenant_id = public.current_tenant_id()
      and l.effective_date >= p_start
      and l.effective_date <= p_end
      and (p_period is null or l.period_scope is null or l.period_scope = p_period)
    group by l.user_id
  )
  select
    p.id,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
    (coalesce(ca.pts, 0) + coalesce(la.pts, 0))::integer as pontos,
    p.streak,
    p.is_pro,
    coalesce(nullif(trim(p.academia), ''), '') as academia,
    p.avatar_url::text,
    coalesce(p.xp, 0) as xp,
    p.league
  from public.profiles p
  left join checkin_agg ca on ca.user_id = p.id
  left join ledger_agg la on la.user_id = p.id
  where p.tenant_id = public.current_tenant_id()
  order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc;
$$;

grant execute on function public.get_tenant_leaderboard_period(date, date, text) to authenticated;

-- 8. Backfill: recalcular liga de todos os usuários existentes
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.recalculate_league(r.id);
  end loop;
end;
$$;
