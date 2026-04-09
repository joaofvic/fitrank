-- Epic 1.2b: checkins, triggers de pontos/streak, RLS

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkin_local_date date not null,
  tipo_treino text not null,
  foto_url text,
  points_awarded integer not null default 10,
  created_at timestamptz not null default now()
);

create unique index checkins_one_user_day_sport
  on public.checkins (
    user_id,
    tenant_id,
    checkin_local_date,
    lower(trim(tipo_treino))
  );

create index checkins_tenant_date_idx
  on public.checkins (tenant_id, checkin_local_date desc);

create index checkins_user_idx on public.checkins (user_id);

create or replace function public.checkins_enforce_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_banned boolean;
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'Check-in só pode ser criado pelo próprio usuário';
  end if;
  select p.tenant_id, coalesce(p.is_banned, false) into v_tenant, v_banned
  from public.profiles p
  where p.id = auth.uid();
  if v_banned then
    raise exception 'Conta suspensa. Você não pode registrar treinos no momento.';
  end if;
  if v_tenant is null or v_tenant <> new.tenant_id then
    raise exception 'Check-in em tenant inválido';
  end if;
  return new;
end;
$$;

create trigger checkins_enforce_tenant_trg
  before insert on public.checkins
  for each row
  execute function public.checkins_enforce_tenant();

create or replace function public.apply_checkin_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
  v_streak int;
  v_pontos int;
  v_yesterday date;
begin
  select p.last_checkin_date, p.streak, p.pontos
  into v_last, v_streak, v_pontos
  from public.profiles p
  where p.id = new.user_id
  for update;

  v_yesterday := new.checkin_local_date - 1;

  if v_last is null then
    v_streak := 1;
  elsif v_last = new.checkin_local_date then
    v_streak := coalesce(v_streak, 0);
  elsif v_last = v_yesterday then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  begin
    perform set_config('fitrank.internal_profile_update', '1', true);
    update public.profiles
    set
      pontos = coalesce(v_pontos, 0) + new.points_awarded,
      streak = v_streak,
      last_checkin_date = new.checkin_local_date,
      updated_at = now()
    where id = new.user_id;
    perform set_config('fitrank.internal_profile_update', '0', true);
  exception
    when others then
      perform set_config('fitrank.internal_profile_update', '0', true);
      raise;
  end;

  return new;
end;
$$;

create trigger checkins_apply_profile_trg
  after insert on public.checkins
  for each row
  execute function public.apply_checkin_to_profile();

alter table public.checkins enable row level security;

create policy checkins_select_tenant
  on public.checkins
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy checkins_insert_self
  on public.checkins
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
  );

create policy checkins_delete_own
  on public.checkins
  for delete
  to authenticated
  using (user_id = auth.uid() and tenant_id = public.current_tenant_id());
