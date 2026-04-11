-- Epic Social: tabela de curtidas com PK composta e RLS

create table public.likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, checkin_id)
);

create index likes_checkin_idx on public.likes (checkin_id);
create index likes_tenant_idx on public.likes (tenant_id);

alter table public.likes enable row level security;

create policy likes_select
  on public.likes for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Só pode curtir check-ins próprios ou de amigos aceitos
create policy likes_insert
  on public.likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.checkins c
      where c.id = checkin_id
        and c.tenant_id = public.current_tenant_id()
        and c.photo_review_status = 'approved'
        and (
          c.user_id = auth.uid()
          or public.are_friends(auth.uid(), c.user_id)
        )
    )
  );

create policy likes_delete
  on public.likes for delete to authenticated
  using (
    user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
  );
