-- US-ADM-08: reversão de pontos automática e auditável (idempotente) + regra explícita de streak

alter table public.checkins
  add column if not exists points_reverted_at timestamptz,
  add column if not exists points_reverted_by uuid references auth.users (id),
  add column if not exists points_reverted_amount integer;

create table if not exists public.checkin_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null, -- rejected_points_reverted | (futuro) approved | reapproved | ...
  decided_by uuid references auth.users (id),
  decided_at timestamptz not null default now(),
  reason_code text,
  note text,
  is_suspected boolean not null default false,
  points_delta integer not null,
  points_before integer,
  points_after integer,
  streak_before integer,
  streak_after integer,
  last_checkin_date_before date,
  last_checkin_date_after date
);

create index if not exists checkin_moderation_audit_checkin_idx
  on public.checkin_moderation_audit (checkin_id, decided_at desc);

create index if not exists checkin_moderation_audit_user_idx
  on public.checkin_moderation_audit (user_id, decided_at desc);

-- Função: recalcula streak + last_checkin_date com base em dias com check-in NÃO rejeitado
create or replace function public.recompute_profile_streak(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
  v_streak int := 0;
  v_cursor date;
  v_has boolean;
begin
  select max(c.checkin_local_date)
  into v_last
  from public.checkins c
  where c.user_id = p_user_id
    and c.photo_review_status is distinct from 'rejected';

  if v_last is null then
    v_streak := 0;
  else
    v_cursor := v_last;
    loop
      select exists (
        select 1
        from public.checkins c
        where c.user_id = p_user_id
          and c.checkin_local_date = v_cursor
          and c.photo_review_status is distinct from 'rejected'
      )
      into v_has;

      exit when not v_has;
      v_streak := v_streak + 1;
      v_cursor := v_cursor - 1;
    end loop;
  end if;

  begin
    perform set_config('fitrank.internal_profile_update', '1', true);
    update public.profiles
    set
      streak = v_streak,
      last_checkin_date = v_last,
      updated_at = now()
    where id = p_user_id;
    perform set_config('fitrank.internal_profile_update', '0', true);
  exception
    when others then
      perform set_config('fitrank.internal_profile_update', '0', true);
      raise;
  end;
end;
$$;

-- Trigger: ao marcar check-in como rejected, reverter pontos 1x e auditar
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
begin
  -- Só atua na transição para rejected, e apenas 1 vez (idempotência)
  if new.photo_review_status is distinct from 'rejected' then
    return new;
  end if;
  if old.photo_review_status is not distinct from 'rejected' then
    return new;
  end if;
  if new.points_reverted_at is not null then
    return new;
  end if;

  -- trava o profile para calcular before/after com consistência
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

  -- recomputa streak e last_checkin_date (regra explícita)
  perform public.recompute_profile_streak(new.user_id);

  select p.pontos, p.streak, p.last_checkin_date
  into v_points_after, v_streak_after, v_last_after
  from public.profiles p
  where p.id = new.user_id;

  -- marca no próprio check-in que foi revertido (sem loop infinito: este trigger é AFTER UPDATE)
  update public.checkins
  set
    points_reverted_at = now(),
    points_reverted_by = new.photo_reviewed_by,
    points_reverted_amount = abs(v_delta)
  where id = new.id
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

drop trigger if exists checkins_on_rejected_revert_points_trg on public.checkins;
create trigger checkins_on_rejected_revert_points_trg
  after update of photo_review_status on public.checkins
  for each row
  execute function public.on_checkin_rejected_revert_points();

