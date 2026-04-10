-- Epic Desafios: atualizar todas as funções que usam mes_referencia para usar data_inicio/data_fim.
-- Fallback para mes_referencia garante compatibilidade com dados antigos (sem data_inicio/data_fim).
--
-- Funções afetadas:
--   1. bump_desafio_points_on_checkin   (insert em checkins)
--   2. on_checkin_rejected_revert_points (update checkins -> rejected)
--   3. on_checkin_reapproved_reapply_points (update checkins -> reapproved)
--   4. admin_adjust_points              (ajuste manual de pontos)

-- -----------------------------------------------------------------------------
-- 1. bump_desafio_points_on_checkin: usa status = 'ativo' + range de datas
-- -----------------------------------------------------------------------------
create or replace function public.bump_desafio_points_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = new.user_id
      and des.tenant_id = new.tenant_id
      and des.status = 'ativo'
      and new.checkin_local_date >= coalesce(des.data_inicio, des.mes_referencia)
      and new.checkin_local_date <= coalesce(
        des.data_fim,
        (des.mes_referencia + interval '1 month' - interval '1 day')::date
      )
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = pontos_desafio + new.points_awarded
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. on_checkin_rejected_revert_points: match por range (sem filtro de status)
-- -----------------------------------------------------------------------------
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
  if new.points_reverted_at is not null then
    return new;
  end if;

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

  update public.checkins
  set
    points_reverted_at = now(),
    points_reverted_by = new.photo_reviewed_by,
    points_reverted_amount = abs(v_delta)
  where id = new.id
    and points_reverted_at is null;

  insert into public.checkin_moderation_audit (
    checkin_id, tenant_id, user_id, action, decided_by, decided_at,
    reason_code, note, is_suspected,
    points_delta, points_before, points_after,
    streak_before, streak_after,
    last_checkin_date_before, last_checkin_date_after
  ) values (
    new.id, new.tenant_id, new.user_id,
    'rejected_points_reverted',
    new.photo_reviewed_by,
    coalesce(new.photo_reviewed_at, now()),
    new.photo_rejection_reason_code,
    new.photo_rejection_note,
    coalesce(new.photo_is_suspected, false),
    v_delta, v_points_before, v_points_after,
    v_streak_before, v_streak_after,
    v_last_before, v_last_after
  );

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. on_checkin_reapproved_reapply_points: match por range (sem filtro de status)
-- -----------------------------------------------------------------------------
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
  if old.photo_review_status is distinct from 'rejected' then
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

-- -----------------------------------------------------------------------------
-- 4. admin_adjust_points: match por range de datas (ajuste manual)
-- -----------------------------------------------------------------------------
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

  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = p_user_id
      and des.tenant_id = v_tenant
      and v_eff >= coalesce(des.data_inicio, des.mes_referencia)
      and v_eff <= coalesce(
        des.data_fim,
        (des.mes_referencia + interval '1 month' - interval '1 day')::date
      )
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = greatest(0, pontos_desafio + p_delta)
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;

  insert into public.points_ledger (
    tenant_id, user_id, delta, category, reason, reference,
    effective_date, created_by, points_before, points_after
  ) values (
    v_tenant, p_user_id, p_delta,
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'manual'),
    trim(p_reason),
    nullif(trim(coalesce(p_reference, '')), ''),
    v_eff, p_actor, v_before, v_after
  )
  returning * into v_row;

  return v_row;
end;
$$;
