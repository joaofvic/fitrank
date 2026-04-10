-- US-ADM-16: motivo «other» (Outro) permanece sempre ativo — não pode ser desativado via RPC.

update public.photo_rejection_reasons
set is_active = true
where code = 'other';

create or replace function public.admin_photo_rejection_reasons_save(
  p_code text,
  p_label text,
  p_requires_note boolean,
  p_is_active boolean,
  p_sort_order int
)
returns public.photo_rejection_reasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_is_active boolean;
  row public.photo_rejection_reasons;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_code !~ '^[a-z][a-z0-9_]{0,62}$' or length(v_code) > 64 then
    raise exception 'Código inválido: comece com letra; use minúsculas, números e underscore (máx. 64).';
  end if;

  if length(trim(coalesce(p_label, ''))) < 1 then
    raise exception 'Rótulo obrigatório.';
  end if;

  v_is_active := coalesce(p_is_active, true);
  if v_code = 'other' then
    v_is_active := true;
  end if;

  insert into public.photo_rejection_reasons (code, label, requires_note, is_active, sort_order)
  values (v_code, trim(p_label), coalesce(p_requires_note, false), v_is_active, coalesce(p_sort_order, 0))
  on conflict (code) do update
  set
    label = excluded.label,
    requires_note = excluded.requires_note,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order
  returning * into row;

  insert into public.platform_admin_audit_log (
    actor_id, action, target_type, target_id, tenant_id, payload
  ) values (
    auth.uid(),
    'moderation.reasons.save',
    'none',
    null,
    null,
    jsonb_build_object('code', row.code, 'label', row.label, 'is_active', row.is_active)
  );

  return row;
end;
$$;

comment on function public.admin_photo_rejection_reasons_save(text, text, boolean, boolean, int) is
  'US-ADM-16: salva motivo; código other permanece sempre is_active = true.';
