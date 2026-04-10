-- Fix: corrige cross-product entre checkins e points_ledger no ranking.
-- O LEFT JOIN duplo (checkins + ledger) na mesma query causava multiplicação
-- dos valores quando ambas as tabelas tinham registros para o mesmo usuário.
-- Solução: pré-agregar cada tabela em CTEs separadas antes do JOIN.

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
  academia text
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
    coalesce(nullif(trim(p.academia), ''), '') as academia
  from public.profiles p
  left join checkin_agg ca on ca.user_id = p.id
  left join ledger_agg la on la.user_id = p.id
  where p.tenant_id = public.current_tenant_id()
  order by (coalesce(ca.pts, 0) + coalesce(la.pts, 0)) desc, p.id asc;
$$;

grant execute on function public.get_tenant_leaderboard_period(date, date, text) to authenticated;
