-- US-ADM-11: motivos mais comuns de rejeição por usuário (últimos 30 dias)

create or replace function public.admin_user_top_rejection_reasons(p_user_id uuid)
returns table (
  reason_code text,
  count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.photo_rejection_reason_code as reason_code,
    count(*)::int as count
  from public.checkins c
  where c.user_id = p_user_id
    and c.photo_review_status = 'rejected'
    and c.created_at >= (now() - interval '30 days')
    and c.photo_rejection_reason_code is not null
  group by c.photo_rejection_reason_code
  order by count(*) desc, c.photo_rejection_reason_code asc
  limit 10;
$$;

grant execute on function public.admin_user_top_rejection_reasons(uuid) to authenticated;

