-- Atualizar RPCs para incluir avatar_url nos retornos

-- 1. get_friend_feed: adicionar avatar_url
DROP FUNCTION IF EXISTS public.get_friend_feed(int, int);

CREATE FUNCTION public.get_friend_feed(
  p_limit int default 10,
  p_offset int default 0
)
RETURNS TABLE (
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
  hide_likes_count boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.user_id,
    COALESCE(p.display_name, p.nome, 'Usuário'),
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
      SELECT 1 FROM public.likes lk
      WHERE lk.checkin_id = c.id AND lk.user_id = auth.uid()
    ),
    c.feed_caption,
    c.allow_comments,
    c.hide_likes_count
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

-- 2. get_user_public_profile: incluir avatar_url no perfil e nos checkins
CREATE OR REPLACE FUNCTION public.get_user_public_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_profile record;
  v_approved_count bigint;
  v_recent jsonb;
  v_friendship_status text;
BEGIN
  IF v_caller IS NULL OR v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;

  SELECT
    p.id,
    COALESCE(p.display_name, p.nome, 'Usuário') AS display_name,
    p.avatar_url,
    p.username,
    p.created_at,
    p.streak,
    p.pontos,
    p.is_pro,
    p.academia
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id
    AND p.tenant_id = v_tenant;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuário não encontrado');
  END IF;

  SELECT count(*)
  INTO v_approved_count
  FROM public.checkins
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant
    AND photo_review_status = 'approved';

  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      c.id,
      c.user_id,
      c.checkin_local_date AS date,
      c.tipo_treino,
      c.points_awarded,
      c.foto_url,
      c.created_at,
      c.feed_caption,
      c.allow_comments,
      c.hide_likes_count,
      COALESCE((SELECT count(*) FROM public.likes l WHERE l.checkin_id = c.id), 0) AS likes_count,
      COALESCE((SELECT count(*) FROM public.comments co WHERE co.checkin_id = c.id), 0) AS comments_count,
      EXISTS(SELECT 1 FROM public.likes l2 WHERE l2.checkin_id = c.id AND l2.user_id = v_caller) AS has_liked
    FROM public.checkins c
    WHERE c.user_id = p_user_id
      AND c.tenant_id = v_tenant
      AND c.photo_review_status = 'approved'
    ORDER BY c.checkin_local_date DESC, c.created_at DESC
    LIMIT 20
  ) sub;

  SELECT f.status
  INTO v_friendship_status
  FROM public.friendships f
  WHERE f.tenant_id = v_tenant
    AND least(f.requester_id, f.addressee_id) = least(v_caller, p_user_id)
    AND greatest(f.requester_id, f.addressee_id) = greatest(v_caller, p_user_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'user_id', v_profile.id,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'username', v_profile.username,
    'created_at', v_profile.created_at,
    'streak', COALESCE(v_profile.streak, 0),
    'pontos', COALESCE(v_profile.pontos, 0),
    'is_pro', COALESCE(v_profile.is_pro, false),
    'academia', v_profile.academia,
    'approved_checkins_count', v_approved_count,
    'recent_checkins', v_recent,
    'friendship_status', v_friendship_status
  );
END;
$$;
