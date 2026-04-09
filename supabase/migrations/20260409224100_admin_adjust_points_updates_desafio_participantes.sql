-- US-ADM-12: ajustes manuais também refletem em desafios (mês da data efetiva)

create or replace function public.admin_adjust_points(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_reference text,
  p_actor uuid,
  p_effective_date date default current_date,
  p_category text default 'manual'
)
returns public.points_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before int;
  v_after int;
  v_tenant uuid;
  v_row public.points_ledger;
  r record;
  v_eff date;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'delta inválido';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason obrigatória';
  end if;

  v_eff := coalesce(p_effective_date, current_date);

  select p.tenant_id, p.pontos
  into v_tenant, v_before
  from public.profiles p
  where p.id = p_user_id
  for update;

  v_before := coalesce(v_before, 0);
  v_after := greatest(0, v_before + p_delta);

  -- Atualiza total do perfil
  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    begin
      perform set_config('fitrank.internal_profile_update', '1', true);
      update public.profiles
      set pontos = v_after, updated_at = now()
      where id = p_user_id;
      perform set_config('fitrank.internal_profile_update', '0', true);
    exception
      when others then
        perform set_config('fitrank.internal_profile_update', '0', true);
        raise;
    end;
  end if;

  -- Se o usuário participa de desafios no mês da data efetiva, ajusta também pontos_desafio
  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = p_user_id
      and des.tenant_id = v_tenant
      and date_trunc('month', des.mes_referencia::timestamp) = date_trunc('month', v_eff::timestamp)
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = greatest(0, pontos_desafio + p_delta)
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;

  insert into public.points_ledger (
    tenant_id,
    user_id,
    delta,
    category,
    reason,
    reference,
    effective_date,
    created_by,
    points_before,
    points_after
  ) values (
    v_tenant,
    p_user_id,
    p_delta,
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'manual'),
    trim(p_reason),
    nullif(trim(coalesce(p_reference, '')), ''),
    v_eff,
    p_actor,
    v_before,
    v_after
  )
  returning * into v_row;

  return v_row;
end;
$$;

