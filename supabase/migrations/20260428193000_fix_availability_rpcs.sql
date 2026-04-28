-- Fix: RPCs de disponibilidade (signup não tem auth.uid())
-- - check_username_available: corrigir para funcionar quando auth.uid() é NULL
-- - check_email_available / check_phone_available: adiciona RPCs equivalentes para UI (Epic B/C)

create or replace function public.check_username_available(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_u text := lower(trim(p_username));
begin
  if length(v_u) < 3 then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles p
    where lower(p.username) = v_u
      and (v_uid is null or p.id <> v_uid)
  );
end;
$$;

comment on function public.check_username_available(text) is
  'Verifica disponibilidade de username (case-insensitive). Funciona sem sessão (signup).';

create or replace function public.check_email_available(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_e text := nullif(lower(trim(p_email)), '');
begin
  if v_e is null then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles p
    where lower(p.email) = v_e
      and (v_uid is null or p.id <> v_uid)
  );
end;
$$;

comment on function public.check_email_available(text) is
  'Verifica disponibilidade de email (case-insensitive) em public.profiles.';

create or replace function public.check_phone_available(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p text := public.normalize_phone(p_phone);
begin
  if v_p is null then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles p
    where p.phone_normalized = v_p
      and (v_uid is null or p.id <> v_uid)
  );
end;
$$;

comment on function public.check_phone_available(text) is
  'Verifica disponibilidade de telefone (normalizado) em public.profiles.';

grant execute on function public.check_username_available(text) to authenticated;
grant execute on function public.check_email_available(text) to authenticated;
grant execute on function public.check_phone_available(text) to authenticated;

