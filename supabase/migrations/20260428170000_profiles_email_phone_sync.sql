-- Epic A: Modelo de dados e sincronização com Auth (email/telefone)
-- - Armazena email/telefone em public.profiles para suportar login por múltiplos identificadores
-- - Sincroniza a partir de auth.users (fonte de verdade de email/phone)
-- - Protege campos via profiles_prevent_privilege_escalation (apenas servidor)

-- ============================================================
-- 1) Colunas + normalização
-- ============================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists phone_normalized text;

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      case
        when p_phone is null then null
        when trim(p_phone) = '' then null
        when left(trim(p_phone), 1) = '+'
          then '+' || regexp_replace(substr(trim(p_phone), 2), '[^0-9]', '', 'g')
        else regexp_replace(trim(p_phone), '[^0-9]', '', 'g')
      end
    ),
    ''
  );
$$;

comment on function public.normalize_phone(text) is
  'Normaliza telefone removendo caracteres não numéricos (preserva + inicial).';

-- Unicidade global (case-insensitive) para email e telefone normalizado
create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

create unique index if not exists profiles_phone_normalized_unique
  on public.profiles (phone_normalized)
  where phone_normalized is not null;

-- ============================================================
-- 2) Guard: bloquear updates de email/phone via cliente
--    (mantém regras já existentes + adiciona email/phone)
-- ============================================================

create or replace function public.profiles_prevent_privilege_escalation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('fitrank.internal_profile_update', true) = '1' then
      new.updated_at := now(); return new;
    end if;
    if new.is_platform_master is distinct from old.is_platform_master then raise exception 'Troca de is_platform_master proibida'; end if;
    if new.tenant_id is distinct from old.tenant_id then raise exception 'Troca de tenant_id proibida'; end if;
    if new.id is distinct from old.id then raise exception 'Troca de id proibida'; end if;
    if new.pontos is distinct from old.pontos then raise exception 'pontos: apenas servidor'; end if;
    if new.streak is distinct from old.streak then raise exception 'streak: apenas servidor'; end if;
    if new.is_pro is distinct from old.is_pro then raise exception 'is_pro: apenas servidor'; end if;
    if new.last_checkin_date is distinct from old.last_checkin_date then raise exception 'last_checkin_date: apenas servidor'; end if;
    if new.mp_payer_email is distinct from old.mp_payer_email then raise exception 'mp_payer_email: apenas servidor'; end if;
    if new.mp_payment_id is distinct from old.mp_payment_id then raise exception 'mp_payment_id: apenas servidor'; end if;
    if new.onboarding_completed_at is distinct from old.onboarding_completed_at then raise exception 'onboarding_completed_at: apenas servidor'; end if;

    if new.email is distinct from old.email then raise exception 'email: apenas servidor'; end if;
    if new.phone is distinct from old.phone then raise exception 'phone: apenas servidor'; end if;
    if new.phone_normalized is distinct from old.phone_normalized then raise exception 'phone_normalized: apenas servidor'; end if;
  end if;
  new.updated_at := now(); return new;
end; $$;

-- ============================================================
-- 3) Signup: preencher email/phone em profiles no momento do cadastro
-- ============================================================

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
  v_phone_norm text;
begin
  v_slug := nullif(trim(lower(coalesce(new.raw_user_meta_data ->> 'tenant_slug', ''))), '');

  if v_slug is not null then
    select t.id into v_tenant_id
    from public.tenants t
    where t.slug = v_slug and t.status = 'active'
    limit 1;
  end if;

  if v_tenant_id is null then
    select t.id into v_tenant_id
    from public.tenants t
    where t.slug = 'default'
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'Tenant padrão não encontrado; contate o suporte';
  end if;

  v_display := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_academia := nullif(trim(coalesce(new.raw_user_meta_data ->> 'academia', '')), '');
  v_phone_norm := public.normalize_phone(new.phone);

  insert into public.profiles (
    id,
    tenant_id,
    display_name,
    nome,
    academia,
    email,
    phone,
    phone_normalized
  )
  values (
    new.id,
    v_tenant_id,
    v_display,
    coalesce(v_display, split_part(new.email, '@', 1)),
    v_academia,
    nullif(lower(trim(new.email)), ''),
    nullif(trim(new.phone), ''),
    v_phone_norm
  );

  return new;
end;
$$;

-- ============================================================
-- 4) Sync: auth.users UPDATE → public.profiles
-- ============================================================

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_phone text;
  v_phone_norm text;
begin
  v_email := nullif(lower(trim(new.email)), '');
  v_phone := nullif(trim(new.phone), '');
  v_phone_norm := public.normalize_phone(new.phone);

  perform set_config('fitrank.internal_profile_update', '1', true);
  update public.profiles
  set
    email = v_email,
    phone = v_phone,
    phone_normalized = v_phone_norm
  where id = new.id;
  perform set_config('fitrank.internal_profile_update', '', true);

  return new;
exception when others then
  perform set_config('fitrank.internal_profile_update', '', true);
  raise;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, phone on auth.users
  for each row
  execute function public.handle_auth_user_updated();

comment on function public.handle_auth_user_updated() is
  'Sincroniza email/telefone de auth.users para public.profiles.';

-- ============================================================
-- 5) Backfill: preencher profiles.email/phone para usuários existentes
-- ============================================================

do $$
begin
  perform set_config('fitrank.internal_profile_update', '1', true);

  update public.profiles p
  set
    email = nullif(lower(trim(u.email)), ''),
    phone = nullif(trim(u.phone), ''),
    phone_normalized = public.normalize_phone(u.phone)
  from auth.users u
  where u.id = p.id
    and (
      p.email is null
      or p.phone is null
      or p.phone_normalized is null
    );

  perform set_config('fitrank.internal_profile_update', '', true);
end;
$$;

