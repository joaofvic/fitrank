-- Epic Social: tabela de amizades com isolamento multi-tenant

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_unique_pair
    unique (tenant_id, requester_id, addressee_id)
);

-- Impede duplicatas independente de quem enviou (A->B ou B->A)
create unique index friendships_unique_pair_symmetric
  on public.friendships (
    tenant_id,
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index friendships_requester_idx on public.friendships (requester_id, tenant_id);
create index friendships_addressee_idx on public.friendships (addressee_id, tenant_id);
create index friendships_status_idx on public.friendships (tenant_id, status);

-- Trigger para atualizar updated_at
create or replace function public.friendships_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger friendships_updated_at_trg
  before update on public.friendships
  for each row
  execute function public.friendships_set_updated_at();

-- Trigger para forçar tenant_id do requester
create or replace function public.friendships_enforce_tenant()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_tenant uuid;
  v_addr_tenant uuid;
begin
  select p.tenant_id into v_tenant
  from public.profiles p where p.id = auth.uid();

  if v_tenant is null or v_tenant <> new.tenant_id then
    raise exception 'Friendship em tenant inválido';
  end if;

  select p.tenant_id into v_addr_tenant
  from public.profiles p where p.id = new.addressee_id;

  if v_addr_tenant is null or v_addr_tenant <> new.tenant_id then
    raise exception 'Usuário destinatário não pertence ao mesmo tenant';
  end if;

  return new;
end;
$$;

create trigger friendships_enforce_tenant_trg
  before insert on public.friendships
  for each row
  execute function public.friendships_enforce_tenant();

-- RLS
alter table public.friendships enable row level security;

create policy friendships_select
  on public.friendships for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (requester_id = auth.uid() or addressee_id = auth.uid())
  );

create policy friendships_insert
  on public.friendships for insert to authenticated
  with check (
    requester_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and status = 'pending'
  );

create policy friendships_update
  on public.friendships for update to authenticated
  using (
    addressee_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and status = 'pending'
  )
  with check (
    status in ('accepted', 'declined')
  );

create policy friendships_delete
  on public.friendships for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (requester_id = auth.uid() or addressee_id = auth.uid())
  );
