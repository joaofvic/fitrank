-- =============================================================
-- Epic 5 — Sistema de Stories
-- =============================================================

-- 1. Bucket de storage (gerenciado via dashboard/API, documentado aqui)
-- insert into storage.buckets (id, name, public)
-- values ('stories', 'stories', true)
-- on conflict do nothing;

-- 2. Tabela stories
create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  media_url   text not null,
  media_type  text not null check (media_type in ('photo', 'video')),
  duration_ms int default 5000 check (duration_ms > 0 and duration_ms <= 15000),
  caption     text check (char_length(caption) <= 100),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);

create index idx_stories_tenant_expires on public.stories(tenant_id, expires_at desc);
create index idx_stories_user on public.stories(user_id, created_at desc);

alter table public.stories enable row level security;

create policy stories_select on public.stories
  for select to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and expires_at > now()
  );

create policy stories_insert on public.stories
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  );

create policy stories_delete on public.stories
  for delete to authenticated
  using (user_id = auth.uid());

-- 3. Tabela story_views
create table if not exists public.story_views (
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index idx_story_views_viewer on public.story_views(viewer_id);

alter table public.story_views enable row level security;

create policy story_views_select on public.story_views
  for select to authenticated
  using (
    viewer_id = auth.uid()
    or story_id in (select id from public.stories where user_id = auth.uid())
  );

create policy story_views_insert on public.story_views
  for insert to authenticated
  with check (viewer_id = auth.uid());

-- 4. RPC: get_stories_ring — avatares com flag has_unseen
create or replace function public.get_stories_ring(p_limit int default 20)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  story_count  int,
  has_unseen   boolean,
  latest_at    timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with active_stories as (
    select s.user_id, s.id as story_id, s.created_at
    from public.stories s
    where s.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
      and s.expires_at > now()
      and (s.user_id = auth.uid() or public.are_friends(auth.uid(), s.user_id))
  ),
  grouped as (
    select
      a.user_id,
      count(*)::int as story_count,
      max(a.created_at) as latest_at,
      bool_or(
        not exists (
          select 1 from public.story_views sv
          where sv.story_id = a.story_id and sv.viewer_id = auth.uid()
        )
      ) as has_unseen
    from active_stories a
    group by a.user_id
  )
  select
    g.user_id,
    coalesce(p.display_name, p.nome, 'Usuário') as display_name,
    p.avatar_url,
    g.story_count,
    g.has_unseen,
    g.latest_at
  from grouped g
  join public.profiles p on p.id = g.user_id
  order by
    (g.user_id = auth.uid()) desc,
    g.has_unseen desc,
    g.latest_at desc
  limit p_limit;
$$;

grant execute on function public.get_stories_ring(int) to authenticated;

-- 5. RPC: get_user_stories — stories individuais de um usuário
create or replace function public.get_user_stories(p_user_id uuid)
returns table (
  id          uuid,
  media_url   text,
  media_type  text,
  duration_ms int,
  caption     text,
  created_at  timestamptz,
  expires_at  timestamptz,
  is_viewed   boolean,
  view_count  bigint
)
language sql stable security definer
set search_path = public
as $$
  select
    s.id,
    s.media_url,
    s.media_type,
    s.duration_ms,
    s.caption,
    s.created_at,
    s.expires_at,
    exists (
      select 1 from public.story_views sv
      where sv.story_id = s.id and sv.viewer_id = auth.uid()
    ) as is_viewed,
    (select count(*) from public.story_views sv where sv.story_id = s.id) as view_count
  from public.stories s
  where s.user_id = p_user_id
    and s.tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and s.expires_at > now()
  order by s.created_at asc;
$$;

grant execute on function public.get_user_stories(uuid) to authenticated;

-- 6. Cleanup de stories expirados
create or replace function public.cleanup_expired_stories()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    delete from public.stories
    where expires_at <= now()
    returning id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

grant execute on function public.cleanup_expired_stories() to service_role;

-- 7. RPC: listar quem visualizou um story (apenas o dono pode ver)
create or replace function public.get_story_viewers(p_story_id uuid)
returns table (
  viewer_id uuid,
  display_name text,
  avatar_url text,
  username text,
  viewed_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select
    sv.viewer_id,
    coalesce(p.display_name, p.nome, 'Usuário') as display_name,
    p.avatar_url,
    p.username,
    sv.viewed_at
  from public.story_views sv
  join public.profiles p on p.id = sv.viewer_id
  join public.stories s on s.id = sv.story_id
  where sv.story_id = p_story_id
    and s.user_id = auth.uid()
  order by sv.viewed_at desc;
$$;

grant execute on function public.get_story_viewers(uuid) to authenticated;
