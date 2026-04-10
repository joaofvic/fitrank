-- Retry de check-in rejeitado: RPC para reenvio de foto + ajuste do trigger de reaprovação.

-- 1. RPC retry_rejected_checkin ---------------------------------------------------
create or replace function public.retry_rejected_checkin(
  p_checkin_id uuid,
  p_new_foto_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkin record;
begin
  select * into v_checkin
  from public.checkins
  where id = p_checkin_id
  for update;

  if v_checkin is null then
    raise exception 'Check-in não encontrado';
  end if;
  if v_checkin.user_id != auth.uid() then
    raise exception 'Sem permissão para reenviar este check-in';
  end if;
  if v_checkin.photo_review_status != 'rejected' then
    raise exception 'Apenas check-ins rejeitados podem ser reenviados';
  end if;
  if p_new_foto_url is null or length(trim(p_new_foto_url)) = 0 then
    raise exception 'URL da nova foto é obrigatória';
  end if;

  update public.checkins set
    foto_url = p_new_foto_url,
    photo_review_status = 'pending',
    photo_reviewed_at = null,
    photo_reviewed_by = null,
    photo_rejection_reason_code = null,
    photo_rejection_note = null,
    photo_is_suspected = false,
    points_reapplied_at = null,
    points_reapplied_by = null,
    points_reapplied_amount = null
  where id = p_checkin_id;

  insert into public.checkin_moderation_audit (
    checkin_id, tenant_id, user_id, action, decided_by, decided_at,
    reason_code, note, is_suspected,
    points_delta, points_before, points_after
  ) values (
    v_checkin.id,
    v_checkin.tenant_id,
    v_checkin.user_id,
    'photo_retry',
    v_checkin.user_id,
    now(),
    null, null, false,
    0, null, null
  );
end;
$$;

grant execute on function public.retry_rejected_checkin(uuid, text) to authenticated;

-- 2. Ajuste em on_checkin_reapproved_reapply_points --------------------------------
-- Trocar a guard "old = rejected" por "old != approved" para suportar pending->approved
-- após retry. As guards de points_reverted_at e points_reapplied_at garantem idempotência.
create or replace function public.on_checkin_reapproved_reapply_points()
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
  if new.photo_review_status is distinct from 'approved' then
    return new;
  end if;
  -- Permite pending->approved (retry) e rejected->approved (aprovação direta)
  if old.photo_review_status is not distinct from 'approved' then
    return new;
  end if;
  if new.points_reapplied_at is not null then
    return new;
  end if;
  if new.points_reverted_at is null then
    return new;
  end if;

  v_delta := coalesce(new.points_awarded, 0);

  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = new.user_id
      and des.tenant_id = new.tenant_id
      and new.checkin_local_date >= coalesce(des.data_inicio, des.mes_referencia)
      and new.checkin_local_date <= coalesce(
        des.data_fim,
        (des.mes_referencia + interval '1 month' - interval '1 day')::date
      )
      and (des.tipo_treino = '{}' or new.tipo_treino = any(des.tipo_treino))
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = pontos_desafio + v_delta
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;

  select p.pontos, p.streak, p.last_checkin_date
  into v_points_before, v_streak_before, v_last_before
  from public.profiles p
  where p.id = new.user_id
  for update;

  v_points_after := coalesce(v_points_before, 0) + v_delta;

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

  update public.checkins
  set
    points_reapplied_at = now(),
    points_reapplied_by = new.photo_reviewed_by,
    points_reapplied_amount = v_delta
  where id = new.id
    and points_reapplied_at is null;

  insert into public.checkin_moderation_audit (
    checkin_id, tenant_id, user_id, action, decided_by, decided_at,
    reason_code, note, is_suspected,
    points_delta, points_before, points_after,
    streak_before, streak_after,
    last_checkin_date_before, last_checkin_date_after
  ) values (
    new.id, new.tenant_id, new.user_id,
    'reapproved_points_reapplied',
    new.photo_reviewed_by,
    coalesce(new.photo_reviewed_at, now()),
    null, null, false,
    v_delta, v_points_before, v_points_after,
    v_streak_before, v_streak_after,
    v_last_before, v_last_after
  );

  return new;
end;
$$;
