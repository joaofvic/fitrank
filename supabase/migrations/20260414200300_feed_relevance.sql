-- =============================================================
-- Epic 4 — Algoritmo de Relevância
-- =============================================================

-- 1. RPC: feed rankeado por relevância
--
-- Score = recência (40%) + engajamento (25%) + proximidade (20%)
--       + diversidade de autor (10%) + hashtag match (5%)
--
-- Candidatos: últimas 72h, amigos + self, aprovados, feed_visible
-- Retorna mesmas colunas de get_friend_feed + relevance_score

create or replace function public.get_relevant_feed(
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
  mentioned_usernames text[],
  relevance_score double precision
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_max_engagement double precision;
begin
  -- Pré-calcular normalização de engajamento
  select greatest(max(
    (coalesce(l.cnt, 0) * 2 + coalesce(cm.cnt, 0) * 3)::double precision
  ), 1.0)
  into v_max_engagement
  from public.checkins c
  left join lateral (select count(*) as cnt from public.likes lk where lk.checkin_id = c.id) l on true
  left join lateral (select count(*) as cnt from public.comments cm2 where cm2.checkin_id = c.id) cm on true
  where c.tenant_id = v_tenant
    and c.photo_review_status = 'approved'
    and c.feed_visible = true
    and c.created_at >= now() - interval '72 hours'
    and (c.user_id = v_caller or public.are_friends(v_caller, c.user_id));

  return query
  with candidates as (
    select
      c.id as cid,
      c.user_id as cuid,
      coalesce(p.display_name, p.nome, 'Usuário') as dname,
      p.avatar_url as aurl,
      c.checkin_local_date,
      c.tipo_treino,
      c.foto_url,
      c.points_awarded,
      c.photo_review_status,
      c.created_at,
      coalesce(l_agg.cnt, 0) as lc,
      coalesce(cm_agg.cnt, 0) as cc,
      exists (select 1 from public.likes lk where lk.checkin_id = c.id and lk.user_id = v_caller) as hl,
      c.feed_caption,
      c.allow_comments,
      c.hide_likes_count,
      coalesce(m_agg.usernames, '{}') as mu,
      0.4 * exp(-extract(epoch from (now() - c.created_at)) / 86400.0) as s_recency,
      0.25 * ((coalesce(l_agg.cnt, 0) * 2 + coalesce(cm_agg.cnt, 0) * 3)::double precision / v_max_engagement) as s_engagement,
      0.2 * (case when c.user_id = v_caller then 0.8 else 1.0 end) as s_proximity,
      0.0 as s_diversity_placeholder,
      0.05 * (case when exists (
        select 1 from public.checkin_hashtags ch1
        join public.checkin_hashtags ch2 on ch1.hashtag_id = ch2.hashtag_id
        join public.checkins ck on ck.id = ch2.checkin_id and ck.user_id = v_caller
        where ch1.checkin_id = c.id
      ) then 1.0 else 0.0 end) as s_hashtag
    from public.checkins c
    join public.profiles p on p.id = c.user_id
    left join lateral (select count(*) as cnt from public.likes lk2 where lk2.checkin_id = c.id) l_agg on true
    left join lateral (select count(*) as cnt from public.comments cm3 where cm3.checkin_id = c.id) cm_agg on true
    left join lateral (
      select array_agg(mp.username) as usernames
      from public.mentions mn
      join public.profiles mp on mp.id = mn.mentioned_user_id
      where mn.checkin_id = c.id and mp.username is not null
    ) m_agg on true
    where c.tenant_id = v_tenant
      and c.photo_review_status = 'approved'
      and c.feed_visible = true
      and c.created_at >= now() - interval '72 hours'
      and (c.user_id = v_caller or public.are_friends(v_caller, c.user_id))
  ),
  ranked as (
    select *,
      row_number() over (partition by cuid order by (s_recency + s_engagement + s_proximity + s_hashtag) desc) as author_rank
    from candidates
  )
  select
    r.cid,
    r.cuid,
    r.dname,
    r.aurl,
    r.checkin_local_date,
    r.tipo_treino,
    r.foto_url,
    r.points_awarded,
    r.photo_review_status,
    r.created_at,
    r.lc,
    r.cc,
    r.hl,
    r.feed_caption,
    r.allow_comments,
    r.hide_likes_count,
    r.mu,
    (r.s_recency + r.s_engagement + r.s_proximity + r.s_hashtag
     + 0.1 * (1.0 / r.author_rank::double precision)
    ) as relevance_score
  from ranked r
  order by relevance_score desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_relevant_feed(int, int) to authenticated;

-- 2. Tabela post_impressions (sinais implícitos para V2)
create table if not exists public.post_impressions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  checkin_id       uuid not null references public.checkins(id) on delete cascade,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  view_duration_ms int not null default 0,
  created_at       timestamptz not null default now()
);

create index idx_post_impressions_user on public.post_impressions(user_id, created_at desc);
create index idx_post_impressions_checkin on public.post_impressions(checkin_id);

alter table public.post_impressions enable row level security;

create policy post_impressions_insert on public.post_impressions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  );

create policy post_impressions_select_own on public.post_impressions
  for select to authenticated
  using (user_id = auth.uid());
