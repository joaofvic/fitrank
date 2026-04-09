-- Lista todos os tenants para UI admin (filtro auditoria, etc.).
-- Mesmo padrão de auth que admin_platform_audit_list: JWT via PostgREST, sem Edge Function.

create or replace function public.admin_platform_tenants_list()
returns setof public.tenants
language plpgsql
stable
security definer
set search_path = public
as $$
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
  select t.*
  from public.tenants t
  order by t.created_at asc;
end;
$$;

comment on function public.admin_platform_tenants_list is
  'Lista tenants (platform master). Evita depender de Edge Function para dropdowns admin.';

grant execute on function public.admin_platform_tenants_list() to authenticated;
