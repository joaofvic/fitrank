-- Epic 1: Ranking enxuto (Top N + minha posição)
-- Adiciona RPCs específicas para reduzir payload no frontend mantendo a colocação do usuário.

-- 1) Top N do tenant (com rank consistente)
drop function if exists public.get_tenant_leaderboard_top_period(date, date, text, integer);

create or replace function public.get_tenant_leaderboard_top_period(
  p_start date,
  p_end date,
  p_period text default null,
  p_limit integer default 10
)
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  is_pro boolean,
  academia text,
  avatar_url text,
  xp integer,
  league text,
  rank integer
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
  ),
  base as (
    select
      p.id,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
      (coalesce(ca.pts, 0) + coalesce(la.pts, 0))::integer as pontos,
      p.is_pro,
      coalesce(nullif(trim(p.academia), ''), '') as academia,
      p.avatar_url::text as avatar_url,
      coalesce(p.xp, 0)::integer as xp,
      p.league,
      row_number() over (
        order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc
      )::integer as rank
    from public.profiles p
    left join checkin_agg ca on ca.user_id = p.id
    left join ledger_agg la on la.user_id = p.id
    where p.tenant_id = public.current_tenant_id()
  )
  select *
  from base
  where rank <= greatest(1, coalesce(p_limit, 10))
  order by rank asc;
$$;

revoke execute on function public.get_tenant_leaderboard_top_period(date, date, text, integer) from public;
grant execute on function public.get_tenant_leaderboard_top_period(date, date, text, integer) to authenticated;

-- 2) Minha posição no tenant (com rank)
drop function if exists public.get_my_tenant_rank_period(date, date, text);

create or replace function public.get_my_tenant_rank_period(
  p_start date,
  p_end date,
  p_period text default null
)
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  is_pro boolean,
  academia text,
  avatar_url text,
  xp integer,
  league text,
  rank integer
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
  ),
  base as (
    select
      p.id,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
      (coalesce(ca.pts, 0) + coalesce(la.pts, 0))::integer as pontos,
      p.is_pro,
      coalesce(nullif(trim(p.academia), ''), '') as academia,
      p.avatar_url::text as avatar_url,
      coalesce(p.xp, 0)::integer as xp,
      p.league,
      row_number() over (
        order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc
      )::integer as rank
    from public.profiles p
    left join checkin_agg ca on ca.user_id = p.id
    left join ledger_agg la on la.user_id = p.id
    where p.tenant_id = public.current_tenant_id()
  )
  select *
  from base
  where id = auth.uid();
$$;

revoke execute on function public.get_my_tenant_rank_period(date, date, text) from public;
grant execute on function public.get_my_tenant_rank_period(date, date, text) to authenticated;

-- 3) Top N da liga do caller
drop function if exists public.get_league_leaderboard_top(date, date, text, integer);

create or replace function public.get_league_leaderboard_top(
  p_start date,
  p_end date,
  p_period text default null,
  p_limit integer default 10
)
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  is_pro boolean,
  academia text,
  avatar_url text,
  xp integer,
  league text,
  rank integer
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
  ),
  base as (
    select
      p.id,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
      (coalesce(ca.pts, 0) + coalesce(la.pts, 0))::integer as pontos,
      p.is_pro,
      coalesce(nullif(trim(p.academia), ''), '') as academia,
      p.avatar_url::text as avatar_url,
      coalesce(p.xp, 0)::integer as xp,
      p.league,
      row_number() over (
        order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc
      )::integer as rank
    from public.profiles p
    cross join caller_league cl
    left join checkin_agg ca on ca.user_id = p.id
    left join ledger_agg la on la.user_id = p.id
    where p.tenant_id = public.current_tenant_id()
      and p.league = cl.league
  )
  select *
  from base
  where rank <= greatest(1, coalesce(p_limit, 10))
  order by rank asc;
$$;

revoke execute on function public.get_league_leaderboard_top(date, date, text, integer) from public;
grant execute on function public.get_league_leaderboard_top(date, date, text, integer) to authenticated;

-- 4) Minha posição na liga do caller
drop function if exists public.get_my_league_rank_period(date, date, text);

create or replace function public.get_my_league_rank_period(
  p_start date,
  p_end date,
  p_period text default null
)
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  is_pro boolean,
  academia text,
  avatar_url text,
  xp integer,
  league text,
  rank integer
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
  ),
  base as (
    select
      p.id,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
      (coalesce(ca.pts, 0) + coalesce(la.pts, 0))::integer as pontos,
      p.is_pro,
      coalesce(nullif(trim(p.academia), ''), '') as academia,
      p.avatar_url::text as avatar_url,
      coalesce(p.xp, 0)::integer as xp,
      p.league,
      row_number() over (
        order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc
      )::integer as rank
    from public.profiles p
    cross join caller_league cl
    left join checkin_agg ca on ca.user_id = p.id
    left join ledger_agg la on la.user_id = p.id
    where p.tenant_id = public.current_tenant_id()
      and p.league = cl.league
  )
  select *
  from base
  where id = auth.uid();
$$;

revoke execute on function public.get_my_league_rank_period(date, date, text) from public;
grant execute on function public.get_my_league_rank_period(date, date, text) to authenticated;

