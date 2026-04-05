-- Epic 1.2c: desafios, participantes, pagamentos + RLS

create table public.desafios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  nome text not null,
  ativo boolean not null default true,
  mes_referencia date not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, mes_referencia)
);

create index desafios_tenant_idx on public.desafios (tenant_id);

create table public.desafio_participantes (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.desafios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  pontos_desafio integer not null default 0,
  created_at timestamptz not null default now(),
  unique (desafio_id, user_id)
);

create index desafio_participantes_desafio_idx
  on public.desafio_participantes (desafio_id, pontos_desafio desc);

create or replace function public.desafio_participantes_lock_points()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.pontos_desafio is distinct from old.pontos_desafio then
      raise exception 'pontos_desafio só podem ser alterados pelo servidor';
    end if;
  end if;
  return new;
end;
$$;

create trigger desafio_participantes_lock_points_trg
  before update on public.desafio_participantes
  for each row
  execute function public.desafio_participantes_lock_points();

alter table public.desafios enable row level security;
alter table public.desafio_participantes enable row level security;

create policy desafios_select_tenant
  on public.desafios
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy desafio_participantes_select_tenant
  on public.desafio_participantes
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy desafio_participantes_insert_self
  on public.desafio_participantes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.desafios d
      where d.id = desafio_id
        and d.tenant_id = public.current_tenant_id()
    )
  );

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  tipo text not null,
  valor numeric(12, 2) not null,
  status text not null,
  id_externo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index pagamentos_user_idx on public.pagamentos (user_id);
create index pagamentos_tenant_idx on public.pagamentos (tenant_id);

alter table public.pagamentos enable row level security;

create policy pagamentos_select_own
  on public.pagamentos
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
  );
