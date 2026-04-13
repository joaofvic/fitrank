-- Impedir inscrição em desafios pagos sem pagamento confirmado.
-- A Edge Function (service_role) seta a flag fitrank.challenge_enroll_bypass = '1'
-- para permitir inscrições vindas do webhook após pagamento.
-- Inserts diretos via client (authenticated) são bloqueados se entry_fee > 0.

create or replace function public.check_challenge_entry_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_fee integer;
  v_bypass text;
begin
  select entry_fee into v_entry_fee
  from public.desafios
  where id = new.desafio_id;

  if v_entry_fee is null or v_entry_fee <= 0 then
    return new;
  end if;

  v_bypass := coalesce(current_setting('fitrank.challenge_enroll_bypass', true), '0');
  if v_bypass = '1' then
    return new;
  end if;

  raise exception 'Inscrição requer pagamento da taxa de R$ %', 
    to_char(v_entry_fee / 100.0, 'FM999G999D00')
    using errcode = 'P0001';
end;
$$;

create trigger trg_check_challenge_entry_fee
  before insert on public.desafio_participantes
  for each row
  execute function public.check_challenge_entry_fee();

-- RPC para uso exclusivo de Edge Functions (service_role) após pagamento confirmado
create or replace function public.internal_enroll_paid_challenge(
  p_desafio_id uuid,
  p_user_id uuid,
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('fitrank.challenge_enroll_bypass', '1', true);

  insert into public.desafio_participantes (desafio_id, user_id, tenant_id)
  values (p_desafio_id, p_user_id, p_tenant_id)
  on conflict do nothing;

  perform set_config('fitrank.challenge_enroll_bypass', '0', true);
exception when others then
  perform set_config('fitrank.challenge_enroll_bypass', '0', true);
  raise;
end;
$$;

revoke execute on function public.internal_enroll_paid_challenge(uuid, uuid, uuid) from public;
revoke execute on function public.internal_enroll_paid_challenge(uuid, uuid, uuid) from authenticated;
