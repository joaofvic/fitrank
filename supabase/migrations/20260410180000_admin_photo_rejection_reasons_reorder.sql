-- US-ADM-16: persistir ordem dos motivos de rejeição em lote (drag-and-drop no admin).

create or replace function public.admin_photo_rejection_reasons_reorder(p_codes text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  n int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_codes is null or coalesce(array_length(p_codes, 1), 0) = 0 then
    return;
  end if;

  n := array_length(p_codes, 1);
  for i in 1..n loop
    update public.photo_rejection_reasons
    set sort_order = i - 1
    where code = p_codes[i];
  end loop;

  insert into public.platform_admin_audit_log (
    actor_id, action, target_type, target_id, tenant_id, payload
  ) values (
    auth.uid(),
    'moderation.reasons.reorder',
    'none',
    null,
    null,
    jsonb_build_object('codes', p_codes)
  );
end;
$$;

grant execute on function public.admin_photo_rejection_reasons_reorder(text[]) to authenticated;

comment on function public.admin_photo_rejection_reasons_reorder is
  'US-ADM-16: redefine sort_order (0..n-1) conforme a ordem dos códigos no array.';
