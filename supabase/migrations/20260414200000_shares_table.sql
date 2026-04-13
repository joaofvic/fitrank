-- Tabela de rastreamento de compartilhamentos (analytics)
create table if not exists public.shares (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  platform   text not null check (platform in ('instagram', 'whatsapp', 'other')),
  created_at timestamptz not null default now()
);

create index idx_shares_checkin on public.shares(checkin_id);
create index idx_shares_user on public.shares(user_id, created_at desc);

alter table public.shares enable row level security;

-- Usuário autenticado pode registrar seus próprios shares
create policy shares_insert on public.shares
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  );

-- Usuário vê seus próprios shares
create policy shares_select_own on public.shares
  for select to authenticated
  using (user_id = auth.uid());

-- Admin master vê todos os shares do tenant
create policy shares_select_admin on public.shares
  for select to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_platform_master = true
    )
  );

-- Trigger de notificação: notificar dono do post quando alguém compartilha
create or replace function public.notify_on_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_sharer_name text;
begin
  select user_id into v_owner_id
  from public.checkins
  where id = new.checkin_id;

  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(display_name, 'Alguém') into v_sharer_name
  from public.profiles
  where id = new.user_id;

  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    v_owner_id,
    new.tenant_id,
    'share',
    'Seu treino foi compartilhado!',
    v_sharer_name || ' compartilhou seu treino.',
    jsonb_build_object('checkin_id', new.checkin_id, 'sharer_id', new.user_id, 'platform', new.platform)
  );

  return new;
end;
$$;

create trigger shares_notify_trg
  after insert on public.shares
  for each row execute function public.notify_on_share();
