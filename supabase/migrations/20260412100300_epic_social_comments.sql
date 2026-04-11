-- Epic Social: tabela de comentários com validação de conteúdo e RLS

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index comments_checkin_idx on public.comments (checkin_id, created_at);
create index comments_user_idx on public.comments (user_id);
create index comments_tenant_idx on public.comments (tenant_id);

alter table public.comments enable row level security;

create policy comments_select
  on public.comments for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Só pode comentar em check-ins próprios ou de amigos aceitos
create policy comments_insert
  on public.comments for insert to authenticated
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

create policy comments_delete
  on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
  );
