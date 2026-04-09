-- US-ADM-09: reaprovar (rejeitado -> aprovado) deve reaplicar pontos (idempotente) + auditoria

alter table public.checkins
  add column if not exists points_reapplied_at timestamptz,
  add column if not exists points_reapplied_by uuid references auth.users (id),
  add column if not exists points_reapplied_amount integer;

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
  -- Só atua na transição rejected -> approved, e apenas 1 vez
  if new.photo_review_status is distinct from 'approved' then
    return new;
  end if;
  if old.photo_review_status is distinct from 'rejected' then
    return new;
  end if;
  if new.points_reapplied_at is not null then
    return new;
  end if;
  -- só reaplica se houve reversão antes (senão poderia duplicar pontos)
  if new.points_reverted_at is null then
    return new;
  end if;

  v_delta := coalesce(new.points_awarded, 0);

  -- Reaplicar pontos em desafios do mês do check-in
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
    set pontos_desafio = pontos_desafio + v_delta
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;

  -- trava profile e aplica pontos
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

  -- regra explícita de streak
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
    'reapproved_points_reapplied',
    new.photo_reviewed_by,
    coalesce(new.photo_reviewed_at, now()),
    null,
    null,
    false,
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

drop trigger if exists checkins_on_reapproved_reapply_points_trg on public.checkins;
create trigger checkins_on_reapproved_reapply_points_trg
  after update of photo_review_status on public.checkins
  for each row
  execute function public.on_checkin_reapproved_reapply_points();

