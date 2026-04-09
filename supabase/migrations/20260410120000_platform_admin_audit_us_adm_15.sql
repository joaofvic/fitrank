-- US-ADM-15: log imutável de ações administrativas (platform master)

create table if not exists public.platform_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text not null check (target_type in ('user', 'checkin', 'tenant', 'none')),
  target_id uuid,
  tenant_id uuid references public.tenants (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.platform_admin_audit_log is
  'Auditoria central (US-ADM-15). Somente service_role grava; leitura via RPC para platform master.';

create index if not exists platform_admin_audit_log_created_idx
  on public.platform_admin_audit_log (created_at desc);

create index if not exists platform_admin_audit_log_actor_idx
  on public.platform_admin_audit_log (actor_id, created_at desc);

create index if not exists platform_admin_audit_log_tenant_idx
  on public.platform_admin_audit_log (tenant_id, created_at desc);

create index if not exists platform_admin_audit_log_target_idx
  on public.platform_admin_audit_log (target_type, target_id, created_at desc);

alter table public.platform_admin_audit_log enable row level security;

revoke insert, update, delete on public.platform_admin_audit_log from authenticated;
revoke insert, update, delete on public.platform_admin_audit_log from anon;

-- Leitura apenas via função security definer (abaixo). Sem policy de SELECT direto.

create or replace function public.admin_platform_audit_list(
  p_actor_id uuid default null,
  p_tenant_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  actor_id uuid,
  actor_display_name text,
  action text,
  target_type text,
  target_id uuid,
  tenant_id uuid,
  tenant_slug text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.actor_id,
    ap.display_name as actor_display_name,
    l.action,
    l.target_type,
    l.target_id,
    l.tenant_id,
    tn.slug as tenant_slug,
    l.payload,
    l.created_at
  from public.platform_admin_audit_log l
  left join public.profiles ap on ap.id = l.actor_id
  left join public.tenants tn on tn.id = l.tenant_id
  where (p_actor_id is null or l.actor_id = p_actor_id)
    and (p_tenant_id is null or l.tenant_id = p_tenant_id)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

comment on function public.admin_platform_audit_list is
  'Lista auditoria US-ADM-15 com filtros (admin, tenant, período). Apenas platform master.';

grant execute on function public.admin_platform_audit_list(
  uuid, uuid, timestamptz, timestamptz, int, int
) to authenticated;
