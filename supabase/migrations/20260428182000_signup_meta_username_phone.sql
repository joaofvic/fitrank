-- Epic B (suporte): Signup com username/telefone via raw_user_meta_data
-- - Signup por email+senha não preenche auth.users.phone; portanto lemos phone/username do metadata
-- - Mantém email/phone/phone_normalized e username preenchidos já na criação do profile

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
  v_username text;
  v_phone_raw text;
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

  v_username := nullif(trim(lower(coalesce(new.raw_user_meta_data ->> 'username', ''))), '');

  -- signup por email não preenche new.phone: usa metadata como fallback
  v_phone_raw := nullif(trim(coalesce(new.phone, new.raw_user_meta_data ->> 'phone', '')), '');
  v_phone_norm := public.normalize_phone(v_phone_raw);

  insert into public.profiles (
    id,
    tenant_id,
    display_name,
    nome,
    academia,
    username,
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
    v_username,
    nullif(lower(trim(new.email)), ''),
    v_phone_raw,
    v_phone_norm
  );

  return new;
end;
$$;

