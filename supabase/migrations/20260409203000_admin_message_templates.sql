-- US-ADM-10: comunicação opcional ao usuário (templates) + logs

create table if not exists public.admin_message_templates (
  code text primary key,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.admin_message_templates enable row level security;
-- leitura via Edge Function (service_role). Sem policies.

insert into public.admin_message_templates (code, title, body, is_active, sort_order)
values
  ('clearer_photo', 'Dica do FitRank', 'Envie uma foto mais clara/iluminada e com o movimento visível.', true, 10),
  ('show_movement', 'Dica do FitRank', 'Tente enquadrar melhor o movimento (ex.: execução do exercício ou equipamento).', true, 20),
  ('avoid_screenshots', 'Dica do FitRank', 'Evite prints/fotos de tela. Envie uma foto real do treino.', true, 30),
  ('avoid_internet', 'Dica do FitRank', 'Não use imagens da internet. Envie uma foto original do seu treino.', true, 40)
on conflict (code) do update
set
  title = excluded.title,
  body = excluded.body,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete cascade,
  checkin_id uuid references public.checkins (id) on delete set null,
  sent_by uuid references auth.users (id),
  template_code text references public.admin_message_templates (code),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_messages enable row level security;

create index if not exists admin_messages_user_idx
  on public.admin_messages (user_id, created_at desc);

