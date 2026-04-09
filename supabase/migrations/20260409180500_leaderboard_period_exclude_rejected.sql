-- US-ADM-08: ranking por período deve excluir check-ins rejeitados (pontos revertidos)

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
  select
    p.id,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text,
    coalesce(sum(c.points_awarded), 0)::integer,
    p.streak,
    p.is_pro,
    coalesce(nullif(trim(p.academia), ''), '')
  from public.profiles p
  left join public.checkins c
    on c.user_id = p.id
   and c.tenant_id = p.tenant_id
   and c.checkin_local_date >= p_start
   and c.checkin_local_date <= p_end
   and c.photo_review_status is distinct from 'rejected'
  where p.tenant_id = public.current_tenant_id()
  group by p.id, p.display_name, p.nome, p.streak, p.is_pro, p.academia
  order by coalesce(sum(c.points_awarded), 0) desc, p.id asc;
$$;

grant execute on function public.get_tenant_leaderboard_period(date, date) to authenticated;

