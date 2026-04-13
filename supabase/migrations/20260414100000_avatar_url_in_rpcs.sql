-- Adiciona avatar_url nas RPCs de ranking (leaderboard, desafio, busca de usuários)
-- para que o frontend possa exibir a foto de perfil em todos os locais.

-- 1. Leaderboard do tenant por período
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
  avatar_url text
)
language sql
stable
security definer
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
    p.avatar_url::text
  from public.profiles p
  left join checkin_agg ca on ca.user_id = p.id
  left join ledger_agg la on la.user_id = p.id
  where p.tenant_id = public.current_tenant_id()
  order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc;
$$;

grant execute on function public.get_tenant_leaderboard_period(date, date, text) to authenticated;

-- 2. Ranking de desafio
drop function if exists public.get_desafio_ranking(uuid);

create or replace function public.get_desafio_ranking(p_desafio_id uuid)
returns table (
  user_id uuid,
  nome_exibicao text,
  pontos_desafio integer,
  is_me boolean,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dp.user_id,
    coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.nome), ''), 'Atleta')::text,
    dp.pontos_desafio,
    (dp.user_id = auth.uid()),
    pr.avatar_url::text
  from public.desafio_participantes dp
  inner join public.desafios d on d.id = dp.desafio_id
  inner join public.profiles pr on pr.id = dp.user_id
  where dp.desafio_id = p_desafio_id
    and d.tenant_id = public.current_tenant_id()
    and pr.tenant_id = public.current_tenant_id()
  order by dp.pontos_desafio desc, dp.user_id asc;
$$;

grant execute on function public.get_desafio_ranking(uuid) to authenticated;

-- 3. Busca de usuários para amizade
drop function if exists public.search_users_for_friendship(text);

create or replace function public.search_users_for_friendship(p_query text)
returns table (
  user_id uuid,
  display_name text,
  friendship_status text,
  avatar_url text
)
language sql stable security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    f.status,
    p.avatar_url::text
  from public.profiles p
  left join public.friendships f on (
    f.tenant_id = public.current_tenant_id()
    and least(f.requester_id, f.addressee_id) = least(auth.uid(), p.id)
    and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p.id)
  )
  where p.tenant_id = public.current_tenant_id()
    and p.id <> auth.uid()
    and (
      p.display_name ilike '%' || p_query || '%'
      or p.nome ilike '%' || p_query || '%'
    )
  order by p.display_name
  limit 20;
$$;

grant execute on function public.search_users_for_friendship(text) to authenticated;
