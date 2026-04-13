-- =============================================================
-- Epic 3 — Hashtags e Categorias
-- =============================================================

-- 1. Tabela de hashtags (uma por tenant + tag)
create table if not exists public.hashtags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  tag         text not null,
  usage_count int not null default 0,
  created_at  timestamptz not null default now()
);

create unique index idx_hashtags_tenant_tag
  on public.hashtags (tenant_id, lower(tag));

alter table public.hashtags enable row level security;

create policy hashtags_select on public.hashtags
  for select to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

-- 2. Junction: checkin <-> hashtag
create table if not exists public.checkin_hashtags (
  checkin_id  uuid not null references public.checkins(id) on delete cascade,
  hashtag_id  uuid not null references public.hashtags(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (checkin_id, hashtag_id)
);

create index idx_checkin_hashtags_hashtag on public.checkin_hashtags(hashtag_id, created_at desc);

alter table public.checkin_hashtags enable row level security;

create policy checkin_hashtags_select on public.checkin_hashtags
  for select to authenticated
  using (true);

-- 3. Trigger: incrementar/decrementar usage_count
create or replace function public.update_hashtag_usage_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.hashtags set usage_count = usage_count + 1 where id = new.hashtag_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.hashtags set usage_count = greatest(usage_count - 1, 0) where id = old.hashtag_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger checkin_hashtags_usage_trg
  after insert or delete on public.checkin_hashtags
  for each row execute function public.update_hashtag_usage_count();

-- 4. RPC: upsert hashtags de um check-in (SECURITY DEFINER)
create or replace function public.save_checkin_hashtags(
  p_checkin_id uuid,
  p_tags text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_checkin_owner uuid;
  v_tag text;
  v_hashtag_id uuid;
begin
  select user_id, tenant_id into v_checkin_owner, v_tenant
  from public.checkins
  where id = p_checkin_id;

  if v_checkin_owner is null or v_checkin_owner != v_caller then
    raise exception 'Sem permissão';
  end if;

  if p_tags is null or array_length(p_tags, 1) is null then
    return;
  end if;

  foreach v_tag in array p_tags loop
    v_tag := lower(trim(v_tag));
    if length(v_tag) < 1 or length(v_tag) > 50 then
      continue;
    end if;

    insert into public.hashtags (tenant_id, tag)
    values (v_tenant, v_tag)
    on conflict (tenant_id, lower(tag)) do nothing;

    select id into v_hashtag_id
    from public.hashtags
    where tenant_id = v_tenant and lower(tag) = v_tag;

    if v_hashtag_id is not null then
      insert into public.checkin_hashtags (checkin_id, hashtag_id)
      values (p_checkin_id, v_hashtag_id)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.save_checkin_hashtags(uuid, text[]) to authenticated;

-- 5. RPC: feed filtrado por hashtag
create or replace function public.get_hashtag_feed(
  p_tag text,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  checkin_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  checkin_local_date date,
  tipo_treino text,
  foto_url text,
  points_awarded int,
  photo_review_status text,
  created_at timestamptz,
  likes_count bigint,
  comments_count bigint,
  has_liked boolean,
  feed_caption text,
  allow_comments boolean,
  hide_likes_count boolean,
  mentioned_usernames text[]
)
language sql stable security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    coalesce(p.display_name, p.nome, 'Usuário'),
    p.avatar_url,
    c.checkin_local_date,
    c.tipo_treino,
    c.foto_url,
    c.points_awarded,
    c.photo_review_status,
    c.created_at,
    coalesce(l_agg.cnt, 0),
    coalesce(cm_agg.cnt, 0),
    exists (
      select 1 from public.likes lk
      where lk.checkin_id = c.id and lk.user_id = auth.uid()
    ),
    c.feed_caption,
    c.allow_comments,
    c.hide_likes_count,
    coalesce(m_agg.usernames, '{}')
  from public.checkins c
  join public.profiles p on p.id = c.user_id
  join public.checkin_hashtags ch on ch.checkin_id = c.id
  join public.hashtags h on h.id = ch.hashtag_id
    and h.tenant_id = public.current_tenant_id()
    and lower(h.tag) = lower(p_tag)
  left join lateral (
    select count(*) as cnt from public.likes where checkin_id = c.id
  ) l_agg on true
  left join lateral (
    select count(*) as cnt from public.comments where checkin_id = c.id
  ) cm_agg on true
  left join lateral (
    select array_agg(mp.username) as usernames
    from public.mentions m
    join public.profiles mp on mp.id = m.mentioned_user_id
    where m.checkin_id = c.id and mp.username is not null
  ) m_agg on true
  where c.tenant_id = public.current_tenant_id()
    and c.photo_review_status = 'approved'
    and c.feed_visible = true
  order by c.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_hashtag_feed(text, int, int) to authenticated;

-- 6. RPC: trending hashtags (últimos 7 dias)
create or replace function public.get_trending_hashtags(
  p_limit int default 10
)
returns table (
  tag text,
  post_count bigint
)
language sql stable security definer
set search_path = public
as $$
  select
    h.tag,
    count(*) as post_count
  from public.checkin_hashtags ch
  join public.hashtags h on h.id = ch.hashtag_id
    and h.tenant_id = public.current_tenant_id()
  where ch.created_at >= now() - interval '7 days'
  group by h.tag
  order by post_count desc, h.tag
  limit p_limit;
$$;

grant execute on function public.get_trending_hashtags(int) to authenticated;
