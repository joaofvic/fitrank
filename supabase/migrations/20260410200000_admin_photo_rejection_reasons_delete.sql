-- US-ADM-16: exclusão de motivo (apenas se não houver check-ins referenciando; «other» bloqueado).

create or replace function public.admin_photo_rejection_reasons_delete(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  deleted int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_code = '' then
    raise exception 'Código obrigatório.';
  end if;

  if v_code = 'other' then
    raise exception 'O motivo «Outro» (other) não pode ser excluído.';
  end if;

  if exists (
    select 1 from public.checkins c
    where c.photo_rejection_reason_code = v_code
    limit 1
  ) then
    raise exception
      'Não é possível excluir: existem check-ins com este motivo. Desative o motivo (Ativo) em vez de excluir.';
  end if;

  delete from public.photo_rejection_reasons
  where code = v_code;

  get diagnostics deleted = row_count;
  if deleted = 0 then
    raise exception 'Motivo não encontrado.';
  end if;

  insert into public.platform_admin_audit_log (
    actor_id, action, target_type, target_id, tenant_id, payload
  ) values (
    auth.uid(),
    'moderation.reasons.delete',
    'none',
    null,
    null,
    jsonb_build_object('code', v_code)
  );
end;
$$;

grant execute on function public.admin_photo_rejection_reasons_delete(text) to authenticated;

comment on function public.admin_photo_rejection_reasons_delete is
  'US-ADM-16: remove motivo do catálogo se nenhum check-in referenciar o código; other é intocável.';
