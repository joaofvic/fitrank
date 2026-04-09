-- US-ADM-05: SLA/prioridade da fila de moderação (ordenar por risco/tempo) + métricas

create or replace function public.admin_moderation_queue(
  p_status text default 'pending',
  p_tenant_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_tipo text default null,
  p_limit int default 30,
  p_offset int default 0,
  p_sort text default 'oldest' -- oldest | newest | risk
)
returns table (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  checkin_local_date date,
  tipo_treino text,
  points_awarded integer,
  foto_url text,
  created_at timestamptz,
  photo_review_status text,
  photo_reviewed_at timestamptz,
  photo_reviewed_by uuid,
  photo_rejection_reason_code text,
  photo_rejection_note text,
  user_rejections_30d integer,
  profile_display_name text,
  profile_nome text,
  profile_academia text,
  tenant_slug text,
  tenant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with rejections_30d as (
    select
      c.user_id,
      count(*)::int as cnt
    from public.checkins c
    where c.photo_review_status = 'rejected'
      and c.created_at >= (now() - interval '30 days')
    group by c.user_id
  )
  select
    c.id,
    c.tenant_id,
    c.user_id,
    c.checkin_local_date,
    c.tipo_treino,
    c.points_awarded,
    c.foto_url,
    c.created_at,
    c.photo_review_status,
    c.photo_reviewed_at,
    c.photo_reviewed_by,
    c.photo_rejection_reason_code,
    c.photo_rejection_note,
    coalesce(r.cnt, 0)::int as user_rejections_30d,
    p.display_name as profile_display_name,
    p.nome as profile_nome,
    p.academia as profile_academia,
    t.slug as tenant_slug,
    t.name as tenant_name
  from public.checkins c
  inner join public.profiles p on p.id = c.user_id
  inner join public.tenants t on t.id = c.tenant_id
  left join rejections_30d r on r.user_id = c.user_id
  where c.foto_url is not null
    and c.photo_review_status = p_status
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and (p_from is null or c.checkin_local_date >= p_from)
    and (p_to is null or c.checkin_local_date <= p_to)
    and (p_tipo is null or c.tipo_treino ilike ('%' || p_tipo || '%'))
  order by
    case when p_sort = 'risk' then coalesce(r.cnt, 0) end desc nulls last,
    case when p_sort = 'newest' then c.created_at end desc nulls last,
    case when p_sort = 'oldest' then c.created_at end asc nulls last,
    c.id asc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, least(p_offset, 10000));
$$;

grant execute on function public.admin_moderation_queue(text, uuid, date, date, text, int, int, text) to authenticated;

create or replace function public.admin_moderation_pending_stats(
  p_tenant_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_tipo text default null
)
returns table (
  pending_total int,
  pending_over_24h int
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select c.created_at
    from public.checkins c
    where c.foto_url is not null
      and c.photo_review_status = 'pending'
      and (p_tenant_id is null or c.tenant_id = p_tenant_id)
      and (p_from is null or c.checkin_local_date >= p_from)
      and (p_to is null or c.checkin_local_date <= p_to)
      and (p_tipo is null or c.tipo_treino ilike ('%' || p_tipo || '%'))
  )
  select
    count(*)::int as pending_total,
    count(*) filter (where created_at <= (now() - interval '24 hours'))::int as pending_over_24h
  from base;
$$;

grant execute on function public.admin_moderation_pending_stats(uuid, date, date, text) to authenticated;

