-- Autocomplete de platform masters (auditoria): mesmo papel que admin-users?mode=platform-masters,
-- via PostgREST — evita 401 do gateway das Edge Functions.

create or replace function public.admin_platform_masters_search(p_q text default '')
returns table (
  id uuid,
  display_name text,
  nome text,
  email text,
  label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_q, ''));
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
    p.id,
    p.display_name,
    p.nome,
    u.email::text,
    case
      when coalesce(u.email, '') <> '' then
        trim(
          coalesce(
            nullif(trim(coalesce(p.display_name, '')), ''),
            nullif(trim(coalesce(p.nome, '')), ''),
            'Admin'
          )
        ) || ' (' || u.email || ')'
      else
        trim(
          coalesce(
            nullif(trim(coalesce(p.display_name, '')), ''),
            nullif(trim(coalesce(p.nome, '')), ''),
            'Admin'
          )
        )
    end::text as label
  from public.profiles p
  inner join auth.users u on u.id = p.id
  where p.is_platform_master = true
    and (
      v_q = ''
      or (v_q ~ '^[0-9a-fA-F-]{36}$' and p.id = v_q::uuid)
      or p.display_name ilike '%' || v_q || '%'
      or p.nome ilike '%' || v_q || '%'
      or u.email ilike '%' || v_q || '%'
    )
  order by p.created_at desc
  limit 50;
end;
$$;

comment on function public.admin_platform_masters_search(text) is
  'Lista/busca platform masters (id, nome, e-mail, label) para filtros admin; apenas platform master.';

grant execute on function public.admin_platform_masters_search(text) to authenticated;
