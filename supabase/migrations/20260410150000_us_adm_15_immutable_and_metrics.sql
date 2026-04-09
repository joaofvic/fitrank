-- US-ADM-15: append-only no log central + métricas para alertas operacionais.

-- -----------------------------------------------------------------------------
-- Impede UPDATE/DELETE (inclusive via service_role / SQL direto), mantendo append-only.
-- -----------------------------------------------------------------------------
create or replace function public.platform_admin_audit_log_block_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_admin_audit_log é append-only (US-ADM-15). UPDATE e DELETE não são permitidos.'
    using errcode = '42501';
end;
$$;

drop trigger if exists platform_admin_audit_log_block_mutate on public.platform_admin_audit_log;

create trigger platform_admin_audit_log_block_mutate
  before update or delete on public.platform_admin_audit_log
  for each row
  execute function public.platform_admin_audit_log_block_mutate();

comment on function public.platform_admin_audit_log_block_mutate is
  'Bloqueia mutação da tabela de auditoria (US-ADM-15).';

-- -----------------------------------------------------------------------------
-- Métricas no mesmo recorte de filtros: rejeições vs janela anterior + pico por admin.
-- -----------------------------------------------------------------------------
create or replace function public.admin_platform_audit_metrics(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null,
  p_actor_id uuid default null
)
returns table (
  rejections_count bigint,
  rejections_prev_window bigint,
  total_in_window bigint,
  top_actor_id uuid,
  top_actor_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dur interval;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    rejections_count := 0;
    rejections_prev_window := 0;
    total_in_window := 0;
    top_actor_id := null;
    top_actor_count := 0;
    return next;
    return;
  end if;

  v_dur := p_to - p_from;
  v_prev_to := p_from;
  v_prev_from := p_from - v_dur;

  select count(*)::bigint into rejections_count
  from public.platform_admin_audit_log l
  where l.created_at >= p_from
    and l.created_at <= p_to
    and l.action in ('moderation.reject', 'moderation.batch_reject')
    and (p_tenant_id is null or l.tenant_id = p_tenant_id)
    and (p_actor_id is null or l.actor_id = p_actor_id);

  select count(*)::bigint into rejections_prev_window
  from public.platform_admin_audit_log l
  where l.created_at >= v_prev_from
    and l.created_at < v_prev_to
    and l.action in ('moderation.reject', 'moderation.batch_reject')
    and (p_tenant_id is null or l.tenant_id = p_tenant_id)
    and (p_actor_id is null or l.actor_id = p_actor_id);

  select count(*)::bigint into total_in_window
  from public.platform_admin_audit_log l
  where l.created_at >= p_from
    and l.created_at <= p_to
    and (p_tenant_id is null or l.tenant_id = p_tenant_id)
    and (p_actor_id is null or l.actor_id = p_actor_id);

  top_actor_id := null;
  top_actor_count := 0;
  select s.actor_id, s.c
  into top_actor_id, top_actor_count
  from (
    select l2.actor_id, count(*)::bigint as c
    from public.platform_admin_audit_log l2
    where l2.created_at >= p_from
      and l2.created_at <= p_to
      and (p_tenant_id is null or l2.tenant_id = p_tenant_id)
      and (p_actor_id is null or l2.actor_id = p_actor_id)
    group by l2.actor_id
    order by c desc
    limit 1
  ) s;

  return next;
end;
$$;

comment on function public.admin_platform_audit_metrics(timestamptz, timestamptz, uuid, uuid) is
  'Métricas US-ADM-15: rejeições na janela vs janela anterior (mesma duração), total de eventos, admin com mais ações.';

grant execute on function public.admin_platform_audit_metrics(timestamptz, timestamptz, uuid, uuid) to authenticated;
