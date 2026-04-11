-- Atualiza RPC get_friend_feed para:
-- 1. Filtrar check-ins com feed_visible = true
-- 2. Retornar feed_caption para exibicao no card do feed

DROP FUNCTION IF EXISTS public.get_friend_feed(int, int);

CREATE FUNCTION public.get_friend_feed(
  p_limit int default 10,
  p_offset int default 0
)
RETURNS TABLE (
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
  has_liked boolean,
  feed_caption text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
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
      SELECT 1 FROM public.likes lk
      WHERE lk.checkin_id = c.id AND lk.user_id = auth.uid()
    ),
    c.feed_caption
  FROM public.checkins c
  JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.likes WHERE checkin_id = c.id
  ) l_agg ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.comments WHERE checkin_id = c.id
  ) cm_agg ON true
  WHERE c.tenant_id = public.current_tenant_id()
    AND c.photo_review_status = 'approved'
    AND c.feed_visible = true
    AND (
      c.user_id = auth.uid()
      OR public.are_friends(auth.uid(), c.user_id)
    )
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
