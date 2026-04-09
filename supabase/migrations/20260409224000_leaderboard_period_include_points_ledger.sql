-- US-ADM-12: incluir ajustes do points_ledger no ranking por período

create or replace function public.get_tenant_leaderboard_period(p_start date, p_end date)
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
  with base as (
    select
      p.id,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
      coalesce(sum(case when c.photo_review_status is distinct from 'rejected' then c.points_awarded else 0 end), 0)::integer as pontos_checkins,
      coalesce(sum(l.delta), 0)::integer as pontos_ledger,
      p.streak,
      p.is_pro,
      coalesce(nullif(trim(p.academia), ''), '') as academia
    from public.profiles p
    left join public.checkins c
      on c.user_id = p.id
     and c.tenant_id = p.tenant_id
     and c.checkin_local_date >= p_start
     and c.checkin_local_date <= p_end
    left join public.points_ledger l
      on l.user_id = p.id
     and l.tenant_id = p.tenant_id
     and l.effective_date >= p_start
     and l.effective_date <= p_end
    where p.tenant_id = public.current_tenant_id()
    group by p.id, p.display_name, p.nome, p.streak, p.is_pro, p.academia
  )
  select
    id,
    nome_exibicao,
    (pontos_checkins + pontos_ledger)::integer as pontos,
    streak,
    is_pro,
    academia
  from base
  order by (pontos_checkins + pontos_ledger) desc, id asc;
$$;

grant execute on function public.get_tenant_leaderboard_period(date, date) to authenticated;

