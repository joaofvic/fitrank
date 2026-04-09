-- US-ADM-07 (complemento): notificação in-app + centralizar motivos no DB

-- 1) Catálogo de motivos padronizados
create table if not exists public.photo_rejection_reasons (
  code text primary key,
  label text not null,
  requires_note boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.photo_rejection_reasons enable row level security;

-- leitura apenas via Edge Function (service_role). Mantemos sem policies.

insert into public.photo_rejection_reasons (code, label, requires_note, is_active, sort_order)
values
  ('illegible_dark', 'Foto ilegível/escura', false, true, 10),
  ('not_proof', 'Não comprova atividade', false, true, 20),
  ('duplicate_reused', 'Foto duplicada/reutilizada', false, true, 30),
  ('inappropriate', 'Conteúdo impróprio', false, true, 40),
  ('screenshot', 'Foto de tela/print', false, true, 50),
  ('workout_mismatch', 'Tipo de treino não condizente', false, true, 60),
  ('other', 'Outro (exige observação)', true, true, 999)
on conflict (code) do update
set
  label = excluded.label,
  requires_note = excluded.requires_note,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

-- 2) Notificações in-app
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.notifications enable row level security;

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Usuário pode ler as próprias notificações
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- Usuário pode marcar como lida (somente update de read_at e só nas próprias)
drop policy if exists notifications_update_read_at_own on public.notifications;
create policy notifications_update_read_at_own
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

