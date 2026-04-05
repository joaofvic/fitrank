-- Epic 1.2a: helper current_tenant_id, colunas PRD em profiles, triggers sensíveis, handle_new_user

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

comment on function public.current_tenant_id() is 'Tenant UUID do JWT (via profiles); uso em RLS.';

grant execute on function public.current_tenant_id() to authenticated;

alter table public.profiles
  add column if not exists nome text,
  add column if not exists academia text,
  add column if not exists pontos integer not null default 0,
  add column if not exists streak integer not null default 0,
  add column if not exists is_pro boolean not null default false,
  add column if not exists last_checkin_date date,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('fitrank.internal_profile_update', true) = '1' then
      new.updated_at := now();
      return new;
    end if;

    if new.is_platform_master is distinct from old.is_platform_master then
      raise exception 'Troca de is_platform_master não permitida via API';
    end if;
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'Troca de tenant_id não permitida via API';
    end if;
    if new.id is distinct from old.id then
      raise exception 'Troca de id não permitida';
    end if;
    if new.pontos is distinct from old.pontos then
      raise exception 'Atualização de pontos apenas via regras do servidor';
    end if;
    if new.streak is distinct from old.streak then
      raise exception 'Atualização de streak apenas via regras do servidor';
    end if;
    if new.is_pro is distinct from old.is_pro then
      raise exception 'Atualização de is_pro apenas via regras do servidor';
    end if;
    if new.last_checkin_date is distinct from old.last_checkin_date then
      raise exception 'Atualização de last_checkin_date apenas via regras do servidor';
    end if;
    if new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'Atualização de stripe_customer_id apenas via regras do servidor';
    end if;
    if new.stripe_subscription_id is distinct from old.stripe_subscription_id then
      raise exception 'Atualização de stripe_subscription_id apenas via regras do servidor';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_slug text;
  v_display text;
  v_academia text;
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

  v_display := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_academia := nullif(trim(coalesce(new.raw_user_meta_data ->> 'academia', '')), '');

  insert into public.profiles (
    id,
    tenant_id,
    display_name,
    nome,
    academia
  )
  values (
    new.id,
    v_tenant_id,
    v_display,
    coalesce(v_display, split_part(new.email, '@', 1)),
    v_academia
  );

  return new;
end;
$$;
