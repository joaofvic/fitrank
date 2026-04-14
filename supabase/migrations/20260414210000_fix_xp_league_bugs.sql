-- Fix 1: get_user_public_profile não retornava league
-- Fix 2: check_and_award_badges não recalculava league após XP de badges

-- ── Fix 1: Adicionar league ao get_user_public_profile ──────────────

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
  v_friendship_id uuid;
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
    p.xp,
    p.league,
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

  SELECT f.id, f.status
  INTO v_friendship_id, v_friendship_status
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
    'xp', COALESCE(v_profile.xp, 0),
    'league', COALESCE(v_profile.league, 'bronze'),
    'is_pro', COALESCE(v_profile.is_pro, false),
    'academia', v_profile.academia,
    'approved_checkins_count', v_approved_count,
    'recent_checkins', v_recent,
    'friendship_status', v_friendship_status,
    'friendship_id', v_friendship_id
  );
END;
$$;

-- ── Fix 2: check_and_award_badges chama recalculate_league após XP ──

CREATE OR REPLACE FUNCTION public.check_and_award_badges(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak int;
  v_pontos int;
  v_checkin_count int;
  v_friend_count int;
  v_tenant uuid;
  v_newly_awarded text[] := '{}';
  v_badge record;
  v_val int;
  v_badge_xp int := 0;
BEGIN
  SELECT streak, pontos, tenant_id
  INTO v_streak, v_pontos, v_tenant
  FROM public.profiles WHERE id = p_user_id;

  SELECT count(*) INTO v_checkin_count
  FROM public.checkins
  WHERE user_id = p_user_id
    AND photo_review_status IS DISTINCT FROM 'rejected';

  SELECT count(*) INTO v_friend_count
  FROM public.friendships
  WHERE status = 'accepted'
    AND (requester_id = p_user_id OR addressee_id = p_user_id);

  FOR v_badge IN
    SELECT b.id, b.slug, b.name, b.category, b.threshold
    FROM public.badges b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_badges ub
      WHERE ub.user_id = p_user_id AND ub.badge_id = b.id
    )
    ORDER BY b.sort_order
  LOOP
    v_val := CASE v_badge.category
      WHEN 'streak'   THEN v_streak
      WHEN 'checkins' THEN v_checkin_count
      WHEN 'points'   THEN v_pontos
      WHEN 'social'   THEN v_friend_count
      ELSE 0
    END;

    IF v_val >= v_badge.threshold THEN
      INSERT INTO public.user_badges (user_id, badge_id)
      VALUES (p_user_id, v_badge.id)
      ON CONFLICT DO NOTHING;

      v_newly_awarded := array_append(v_newly_awarded, v_badge.slug);
      v_badge_xp := v_badge_xp + 50;

      INSERT INTO public.notifications (user_id, tenant_id, type, title, body, data)
      VALUES (
        p_user_id,
        v_tenant,
        'badge_unlocked',
        'Conquista desbloqueada!',
        v_badge.name,
        jsonb_build_object('badge_slug', v_badge.slug, 'badge_name', v_badge.name)
      );
    END IF;
  END LOOP;

  IF v_badge_xp > 0 THEN
    UPDATE public.profiles
    SET xp = xp + v_badge_xp, updated_at = now()
    WHERE id = p_user_id;

    PERFORM public.recalculate_league(p_user_id);
  END IF;

  RETURN v_newly_awarded;
END;
$$;
