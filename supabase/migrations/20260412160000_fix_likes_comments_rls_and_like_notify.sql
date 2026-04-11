-- Corrige RLS de likes e comments para permitir interacao com qualquer
-- checkin aprovado do mesmo tenant (nao apenas amigos).
-- Adiciona trigger de notificacao para curtidas.

-- =============================================================
-- 1. FIX: likes_insert -- remover restricao are_friends
-- =============================================================
DROP POLICY IF EXISTS likes_insert ON public.likes;

CREATE POLICY likes_insert ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.checkins c
      WHERE c.id = likes.checkin_id
        AND c.tenant_id = public.current_tenant_id()
        AND c.photo_review_status = 'approved'
    )
  );

-- =============================================================
-- 2. FIX: comments_insert -- remover restricao are_friends
-- =============================================================
DROP POLICY IF EXISTS comments_insert ON public.comments;

CREATE POLICY comments_insert ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.checkins c
      WHERE c.id = comments.checkin_id
        AND c.tenant_id = public.current_tenant_id()
        AND c.photo_review_status = 'approved'
    )
  );

-- =============================================================
-- 3. NEW: Trigger de notificacao para curtidas
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkin_owner_id uuid;
  v_checkin_tenant_id uuid;
  v_foto_url text;
  v_liker_name text;
BEGIN
  SELECT c.user_id, c.tenant_id, c.foto_url
  INTO v_checkin_owner_id, v_checkin_tenant_id, v_foto_url
  FROM public.checkins c
  WHERE c.id = new.checkin_id;

  IF v_checkin_owner_id IS NULL THEN
    RETURN new;
  END IF;

  IF new.user_id = v_checkin_owner_id THEN
    RETURN new;
  END IF;

  SELECT COALESCE(p.display_name, p.nome, 'Alguém')
  INTO v_liker_name
  FROM public.profiles p
  WHERE p.id = new.user_id;

  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, data)
  VALUES (
    v_checkin_owner_id,
    v_checkin_tenant_id,
    'like',
    'Nova curtida',
    'curtiu seu treino.',
    jsonb_build_object(
      'checkin_id', new.checkin_id,
      'liker_id', new.user_id,
      'foto_url', v_foto_url,
      'actor_name', v_liker_name
    )
  );

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS likes_notify_owner_trg ON public.likes;

CREATE TRIGGER likes_notify_owner_trg
  AFTER INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_like();
