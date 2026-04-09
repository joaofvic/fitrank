-- Fix: permitir nova reversão quando item reprovado novamente após reaprovação
-- Cenário:
-- 1) rejected -> approved (points_reapplied_at preenchido, points_reverted_at permanece)
-- 2) approved -> rejected novamente deve subtrair de novo
-- Antes: o trigger de reversão era bloqueado por points_reverted_at já existir.

create or replace function public.on_checkin_rejected_revert_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points_before int;
  v_points_after int;
  v_streak_before int;
  v_streak_after int;
  v_last_before date;
  v_last_after date;
  v_delta int;
  r record;
begin
  if new.photo_review_status is distinct from 'rejected' then
    return new;
  end if;
  if old.photo_review_status is not distinct from 'rejected' then
    return new;
  end if;

  -- Idempotência por "ciclo":
  -- - primeiro reject: points_reverted_at é nulo -> reverte
  -- - reapprove: points_reapplied_at fica não nulo
  -- - reject novamente: points_reverted_at já existe, mas points_reapplied_at também (logo precisa reverter de novo)
  -- Regra: só NÃO reverte quando points_reverted_at existe e points_reapplied_at é nulo (já revertido e nunca reaplicado).
  if new.points_reverted_at is not null and new.points_reapplied_at is null then
    return new;
  end if;

  -- Reverter pontos em desafios do mês do check-in
  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = new.user_id
      and des.tenant_id = new.tenant_id
      and date_trunc('month', des.mes_referencia::timestamp) = date_trunc('month', new.checkin_local_date::timestamp)
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = greatest(0, pontos_desafio - new.points_awarded)
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;

  select p.pontos, p.streak, p.last_checkin_date
  into v_points_before, v_streak_before, v_last_before
  from public.profiles p
  where p.id = new.user_id
  for update;

  v_delta := -coalesce(new.points_awarded, 0);
  v_points_after := greatest(0, coalesce(v_points_before, 0) + v_delta);

  begin
    perform set_config('fitrank.internal_profile_update', '1', true);
    update public.profiles
    set
      pontos = v_points_after,
      updated_at = now()
    where id = new.user_id;
    perform set_config('fitrank.internal_profile_update', '0', true);
  exception
    when others then
      perform set_config('fitrank.internal_profile_update', '0', true);
      raise;
  end;

  perform public.recompute_profile_streak(new.user_id);

  select p.pontos, p.streak, p.last_checkin_date
  into v_points_after, v_streak_after, v_last_after
  from public.profiles p
  where p.id = new.user_id;

  -- Atualiza marcador de reversão e "reseta" flag de reaplicação, pois estamos iniciando novo ciclo
  update public.checkins
  set
    points_reverted_at = now(),
    points_reverted_by = new.photo_reviewed_by,
    points_reverted_amount = abs(v_delta),
    points_reapplied_at = null,
    points_reapplied_by = null,
    points_reapplied_amount = null
  where id = new.id;

  insert into public.checkin_moderation_audit (
    checkin_id,
    tenant_id,
    user_id,
    action,
    decided_by,
    decided_at,
    reason_code,
    note,
    is_suspected,
    points_delta,
    points_before,
    points_after,
    streak_before,
    streak_after,
    last_checkin_date_before,
    last_checkin_date_after
  ) values (
    new.id,
    new.tenant_id,
    new.user_id,
    'rejected_points_reverted',
    new.photo_reviewed_by,
    coalesce(new.photo_reviewed_at, now()),
    new.photo_rejection_reason_code,
    new.photo_rejection_note,
    coalesce(new.photo_is_suspected, false),
    v_delta,
    v_points_before,
    v_points_after,
    v_streak_before,
    v_streak_after,
    v_last_before,
    v_last_after
  );

  return new;
end;
$$;

