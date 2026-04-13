-- =============================================================
-- Epic 1 — Badges / Conquistas
-- =============================================================

-- 1. Catálogo de badges
create table if not exists public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null,
  icon        text not null default 'trophy',
  category    text not null check (category in ('streak', 'checkins', 'points', 'social', 'special')),
  threshold   int not null default 0,
  is_pro_only boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.badges enable row level security;

create policy badges_select on public.badges
  for select to authenticated
  using (true);

-- 2. Badges desbloqueados por usuário
create table if not exists public.user_badges (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  badge_id    uuid not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index idx_user_badges_user on public.user_badges(user_id);

alter table public.user_badges enable row level security;

create policy user_badges_select on public.user_badges
  for select to authenticated
  using (true);

-- 3. Seed de badges iniciais
insert into public.badges (slug, name, description, icon, category, threshold, sort_order) values
  -- Streak
  ('streak_7',    'Primeira Semana',        '7 dias seguidos de treino',              'flame',   'streak',   7,    10),
  ('streak_30',   'Mestre da Consistência', '30 dias seguidos de treino',             'flame',   'streak',   30,   20),
  ('streak_100',  'Lenda do Streak',        '100 dias seguidos de treino',            'flame',   'streak',   100,  30),
  -- Check-ins
  ('checkins_1',   'Primeiro Treino',       'Completou o primeiro check-in',          'dumbbell','checkins',  1,   10),
  ('checkins_10',  'Dedicado',              '10 check-ins realizados',                'dumbbell','checkins',  10,  15),
  ('checkins_50',  'Guerreiro',             '50 check-ins realizados',                'dumbbell','checkins',  50,  20),
  ('checkins_100', 'Centurião',             '100 check-ins realizados',               'dumbbell','checkins',  100, 30),
  ('checkins_500', 'Espartano',             '500 check-ins realizados',               'dumbbell','checkins',  500, 40),
  -- Pontos
  ('points_1000',  'Mil Pontos',            'Acumulou 1.000 pontos',                  'zap',     'points',   1000, 10),
  ('points_5000',  '5K Club',               'Acumulou 5.000 pontos',                  'zap',     'points',   5000, 20),
  ('points_10000', 'Lenda',                 'Acumulou 10.000 pontos',                 'zap',     'points',   10000,30),
  -- Social
  ('friends_5',    'Sociável',              'Fez 5 amigos na plataforma',             'users',   'social',    5,   10),
  ('friends_10',   'Popular',               'Fez 10 amigos na plataforma',            'users',   'social',    10,  20),
  ('friends_50',   'Influencer',            'Fez 50 amigos na plataforma',            'users',   'social',    50,  30)
on conflict (slug) do nothing;

-- 4. Função: verificar e conceder badges
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

  return v_newly_awarded;
end;
$$;

grant execute on function public.check_and_award_badges(uuid) to authenticated;

-- 5. Trigger: após check-in, verificar badges
create or replace function public.trg_checkin_check_badges()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.check_and_award_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists after_checkin_check_badges on public.checkins;
create trigger after_checkin_check_badges
  after insert on public.checkins
  for each row
  execute function public.trg_checkin_check_badges();

-- 6. Trigger: após amizade aceita, verificar badges sociais
create or replace function public.trg_friendship_check_badges()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' then
    perform public.check_and_award_badges(new.requester_id);
    perform public.check_and_award_badges(new.addressee_id);
  end if;
  return new;
end;
$$;

drop trigger if exists after_friendship_check_badges on public.friendships;
create trigger after_friendship_check_badges
  after update on public.friendships
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function public.trg_friendship_check_badges();

-- 7. RPC: listar badges de um usuário (desbloqueados + catálogo completo)
create or replace function public.get_user_badges(p_user_id uuid)
returns table (
  badge_id    uuid,
  slug        text,
  name        text,
  description text,
  icon        text,
  category    text,
  threshold   int,
  is_pro_only boolean,
  sort_order  int,
  unlocked_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select
    b.id as badge_id,
    b.slug,
    b.name,
    b.description,
    b.icon,
    b.category,
    b.threshold,
    b.is_pro_only,
    b.sort_order,
    ub.unlocked_at
  from public.badges b
  left join public.user_badges ub
    on ub.badge_id = b.id and ub.user_id = p_user_id
  order by b.category, b.sort_order;
$$;

grant execute on function public.get_user_badges(uuid) to authenticated;
