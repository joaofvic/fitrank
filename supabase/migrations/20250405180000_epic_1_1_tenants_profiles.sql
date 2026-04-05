-- Epic 1.1: tenancy + perfis (base para multi-tenant)
-- Bootstrap master: após criar sua conta em Auth, execute no SQL Editor:
--   update public.profiles set is_platform_master = true where id = '<seu_user_uuid>';

-- -----------------------------------------------------------------------------
-- Tenants
-- -----------------------------------------------------------------------------
create type public.tenant_status as enum ('active', 'suspended');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status public.tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenants_status_idx on public.tenants (status);

-- Tenant padrão (signup sem slug de academia cai aqui)
insert into public.tenants (slug, name, status)
values ('default', 'FitRank (padrão)', 'active');

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  display_name text,
  is_platform_master boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_tenant_id_idx on public.profiles (tenant_id);

-- Impede escalação de privilégios via UPDATE pelo cliente (campos sensíveis)
create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_platform_master is distinct from old.is_platform_master then
      raise exception 'Troca de is_platform_master não permitida via API';
    end if;
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'Troca de tenant_id não permitida via API';
    end if;
    if new.id is distinct from old.id then
      raise exception 'Troca de id não permitida';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_privilege_guard
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_privilege_escalation();

-- -----------------------------------------------------------------------------
-- Signup: associa usuário ao tenant (slug em raw_user_meta_data ou default)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_slug text;
begin
  v_slug := nullif(
    trim(lower(coalesce(new.raw_user_meta_data ->> 'tenant_slug', ''))),
    ''
  );

  if v_slug is not null then
    select t.id
    into v_tenant_id
    from public.tenants t
    where t.slug = v_slug
      and t.status = 'active'
    limit 1;
  end if;

  if v_tenant_id is null then
    select t.id
    into v_tenant_id
    from public.tenants t
    where t.slug = 'default'
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'Tenant padrão não encontrado; contate o suporte';
  end if;

  insert into public.profiles (id, tenant_id, display_name)
  values (
    new.id,
    v_tenant_id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;

-- Perfis: usuário vê e atualiza apenas a própria linha (campos sensíveis bloqueados pelo trigger)
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Tenants: somente o tenant ao qual o usuário pertence
create policy tenants_select_member
  on public.tenants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = tenants.id
    )
  );

-- Sem INSERT/UPDATE/DELETE em tenants pelo role authenticated (admin usa Edge Function + service_role)
