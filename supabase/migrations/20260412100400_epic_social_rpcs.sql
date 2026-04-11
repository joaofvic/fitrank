-- Epic Social: RPCs para feed paginado e busca de usuários para amizade

-- Feed paginado com contagem de likes, comments e flag has_liked
create or replace function public.get_friend_feed(
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  checkin_id uuid,
  user_id uuid,
  display_name text,
  checkin_local_date date,
  tipo_treino text,
  foto_url text,
  points_awarded int,
  photo_review_status text,
  created_at timestamptz,
  likes_count bigint,
  comments_count bigint,
  has_liked boolean
)
language sql stable security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    p.display_name,
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
    )
  from public.checkins c
  join public.profiles p on p.id = c.user_id
  left join lateral (
    select count(*) as cnt from public.likes where checkin_id = c.id
  ) l_agg on true
  left join lateral (
    select count(*) as cnt from public.comments where checkin_id = c.id
  ) cm_agg on true
  where c.tenant_id = public.current_tenant_id()
    and c.photo_review_status = 'approved'
    and (
      c.user_id = auth.uid()
      or public.are_friends(auth.uid(), c.user_id)
    )
  order by c.created_at desc
  limit p_limit offset p_offset;
$$;

-- Busca de usuários no mesmo tenant para enviar solicitação de amizade
create or replace function public.search_users_for_friendship(p_query text)
returns table (
  user_id uuid,
  display_name text,
  friendship_status text
)
language sql stable security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    f.status
  from public.profiles p
  left join public.friendships f on (
    f.tenant_id = public.current_tenant_id()
    and least(f.requester_id, f.addressee_id) = least(auth.uid(), p.id)
    and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p.id)
  )
  where p.tenant_id = public.current_tenant_id()
    and p.id <> auth.uid()
    and (
      p.display_name ilike '%' || p_query || '%'
      or p.nome ilike '%' || p_query || '%'
    )
  order by p.display_name
  limit 20;
$$;
