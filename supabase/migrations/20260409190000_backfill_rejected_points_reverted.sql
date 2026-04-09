-- US-ADM-08: backfill para check-ins já rejeitados antes da reversão existir
-- Objetivo: para qualquer check-in com photo_review_status='rejected' e points_reverted_at IS NULL,
-- aplicar a reversão 1x (idempotente) e registrar auditoria.

do $$
declare
  c record;
  u record;
  v_points_before int;
  v_points_after int;
  v_delta int;
begin
  -- Processa check-ins rejeitados sem reversão registrada
  for c in
    select
      ch.id,
      ch.user_id,
      ch.tenant_id,
      ch.checkin_local_date,
      ch.points_awarded,
      ch.photo_reviewed_by,
      ch.photo_reviewed_at,
      ch.photo_rejection_reason_code,
      ch.photo_rejection_note,
      ch.photo_is_suspected
    from public.checkins ch
    where ch.photo_review_status = 'rejected'
      and ch.points_reverted_at is null
    order by ch.created_at asc
  loop
    v_delta := -coalesce(c.points_awarded, 0);

    -- Reverter pontos em desafios do mês do check-in
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes dp
    set pontos_desafio = greatest(0, dp.pontos_desafio - coalesce(c.points_awarded, 0))
    from public.desafios des
    where des.id = dp.desafio_id
      and dp.user_id = c.user_id
      and des.tenant_id = c.tenant_id
      and date_trunc('month', des.mes_referencia::timestamp) = date_trunc('month', c.checkin_local_date::timestamp);
    perform set_config('fitrank.internal_desafio_points', '0', true);

    -- trava profile para aplicar o delta com consistência
    select p.pontos
    into v_points_before
    from public.profiles p
    where p.id = c.user_id
    for update;

    v_points_after := greatest(0, coalesce(v_points_before, 0) + v_delta);

    perform set_config('fitrank.internal_profile_update', '1', true);
    update public.profiles
    set
      pontos = v_points_after,
      updated_at = now()
    where id = c.user_id;
    perform set_config('fitrank.internal_profile_update', '0', true);

    update public.checkins
    set
      points_reverted_at = now(),
      points_reverted_by = c.photo_reviewed_by,
      points_reverted_amount = abs(v_delta)
    where id = c.id
      and points_reverted_at is null;

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
      points_after
    ) values (
      c.id,
      c.tenant_id,
      c.user_id,
      'rejected_points_reverted_backfill',
      c.photo_reviewed_by,
      coalesce(c.photo_reviewed_at, now()),
      c.photo_rejection_reason_code,
      c.photo_rejection_note,
      coalesce(c.photo_is_suspected, false),
      v_delta,
      v_points_before,
      v_points_after
    );
  end loop;

  -- Recalcula streak/last_checkin_date para usuários afetados
  for u in
    select distinct ch.user_id
    from public.checkins ch
    where ch.photo_review_status = 'rejected'
      and ch.points_reverted_at is not null
      and ch.points_reverted_by is not null
  loop
    perform public.recompute_profile_streak(u.user_id);
  end loop;
end;
$$;

