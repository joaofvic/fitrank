-- FitRank: multi-tenant core, PRD-aligned tables, RLS, check-in RPC
-- Timezone for "dia do check-in": America/Sao_Paulo

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Platform admins (master); apenas operações service_role ou Edge Functions
-- ---------------------------------------------------------------------------
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 com auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  display_name text NOT NULL DEFAULT '',
  whatsapp text,
  academia text NOT NULL DEFAULT '',
  pontos integer NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  streak integer NOT NULL DEFAULT 0 CHECK (streak >= 0),
  last_checkin_date date,
  is_pro boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'tenant_admin', 'master')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_tenant_pontos_idx ON public.profiles (tenant_id, pontos DESC);
CREATE INDEX profiles_tenant_id_idx ON public.profiles (tenant_id);

-- ---------------------------------------------------------------------------
-- Check-ins (1 por dia por tipo de treino por usuário no tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  workout_date date NOT NULL,
  tipo_treino text NOT NULL DEFAULT 'Treino Geral',
  foto_url text,
  points_earned integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, workout_date, tipo_treino)
);

CREATE INDEX checkins_user_idx ON public.checkins (user_id, workout_date DESC);
CREATE INDEX checkins_tenant_date_idx ON public.checkins (tenant_id, workout_date DESC);

-- ---------------------------------------------------------------------------
-- Desafios + participação (ranking próprio por desafio)
-- ---------------------------------------------------------------------------
CREATE TABLE public.desafios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reward_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE public.desafio_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desafio_id uuid NOT NULL REFERENCES public.desafios (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  pontos_no_desafio integer NOT NULL DEFAULT 0 CHECK (pontos_no_desafio >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (desafio_id, user_id)
);

CREATE INDEX desafio_participantes_rank_idx
  ON public.desafio_participantes (desafio_id, pontos_no_desafio DESC);

-- ---------------------------------------------------------------------------
-- Pagamentos / eventos financeiros (Pix, PRO, boost, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  tipo text NOT NULL,
  valor numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  external_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pagamentos_tenant_created_idx ON public.pagamentos (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Assinaturas Stripe (house) — atualizado via webhook
-- ---------------------------------------------------------------------------
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  status text NOT NULL DEFAULT 'inactive',
  price_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR tenant_id IS NOT NULL)
);

CREATE INDEX subscriptions_user_idx ON public.subscriptions (user_id);
CREATE INDEX subscriptions_stripe_customer_idx ON public.subscriptions (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- BYOK: segredos do tenant (cifrados pela aplicação nas Edge Functions)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_byok_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'brevo')),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  UNIQUE (tenant_id, provider)
);

-- ---------------------------------------------------------------------------
-- Auditoria de alteração de chaves (preenchido via service_role nas functions)
-- ---------------------------------------------------------------------------
CREATE TABLE public.api_key_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  provider text NOT NULL,
  action text NOT NULL CHECK (action IN ('set', 'rotate', 'delete')),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Fila simples de notificações (Brevo / lembretes)
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  template_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX notification_queue_pending_idx ON public.notification_queue (status, created_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Helpers RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins a WHERE a.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.profiles_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Novo usuário: perfil + tenant (metadata tenant_slug ou fallback demo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_id uuid;
  t_slug text;
BEGIN
  t_slug := COALESCE(NEW.raw_user_meta_data ->> 'tenant_slug', 'demo');
  SELECT id INTO t_id
  FROM public.tenants
  WHERE slug = t_slug AND status = 'active'
  LIMIT 1;

  IF t_id IS NULL THEN
    SELECT id INTO t_id FROM public.tenants WHERE slug = 'demo' LIMIT 1;
  END IF;

  IF t_id IS NULL THEN
    RAISE EXCEPTION 'No active tenant available for signup';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, display_name)
  VALUES (
    NEW.id,
    t_id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1),
      'Atleta'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Check-in seguro: pontos/streak só aqui (US-1.3.2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fitrank_create_checkin(p_tipo_treino text, p_foto_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_last date;
  v_streak int;
  v_pontos int;
  v_new_streak int;
  v_cid uuid;
  v_desafio_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_tipo_treino IS NULL OR length(trim(p_tipo_treino)) = 0 THEN
    RAISE EXCEPTION 'invalid_tipo_treino';
  END IF;

  SELECT tenant_id, last_checkin_date, streak, pontos
  INTO v_tenant, v_last, v_streak, v_pontos
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.checkins c
    WHERE c.user_id = v_uid AND c.tenant_id = v_tenant
      AND c.workout_date = v_today AND c.tipo_treino = p_tipo_treino
  ) THEN
    RAISE EXCEPTION 'already_checked_in_today_for_sport'
      USING ERRCODE = '23505';
  END IF;

  IF v_last IS NULL OR v_last < v_today - 1 THEN
    v_new_streak := 1;
  ELSIF v_last = v_today - 1 THEN
    v_new_streak := v_streak + 1;
  ELSIF v_last = v_today THEN
    v_new_streak := GREATEST(v_streak, 1);
  ELSE
    v_new_streak := 1;
  END IF;

  INSERT INTO public.checkins (user_id, tenant_id, workout_date, tipo_treino, foto_url, points_earned)
  VALUES (v_uid, v_tenant, v_today, p_tipo_treino, p_foto_url, 10)
  RETURNING id INTO v_cid;

  UPDATE public.profiles
  SET
    pontos = v_pontos + 10,
    streak = v_new_streak,
    last_checkin_date = v_today,
    updated_at = now()
  WHERE id = v_uid;

  SELECT d.id INTO v_desafio_id
  FROM public.desafios d
  WHERE d.tenant_id = v_tenant
    AND d.ativo = true
    AND v_today BETWEEN d.starts_on AND d.ends_on
  ORDER BY d.starts_on DESC
  LIMIT 1;

  IF v_desafio_id IS NOT NULL THEN
    INSERT INTO public.desafio_participantes (desafio_id, user_id, tenant_id, pontos_no_desafio)
    VALUES (v_desafio_id, v_uid, v_tenant, 10)
    ON CONFLICT (desafio_id, user_id)
    DO UPDATE SET pontos_no_desafio = public.desafio_participantes.pontos_no_desafio + 10;
  END IF;

  RETURN jsonb_build_object(
    'id', v_cid,
    'pontos', v_pontos + 10,
    'streak', v_new_streak,
    'workout_date', v_today
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fitrank_create_checkin(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fitrank_join_desafio(p_desafio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.desafios d
    WHERE d.id = p_desafio_id AND d.tenant_id = v_tenant AND d.ativo = true
  ) THEN
    RAISE EXCEPTION 'desafio_not_found';
  END IF;

  INSERT INTO public.desafio_participantes (desafio_id, user_id, tenant_id, pontos_no_desafio)
  VALUES (p_desafio_id, v_uid, v_tenant, 0)
  ON CONFLICT (desafio_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fitrank_join_desafio(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: tenant demo + desafio mensal exemplo (ajuste datas conforme deploy)
-- ---------------------------------------------------------------------------
INSERT INTO public.tenants (slug, name, status)
VALUES ('demo', 'Academia Demo', 'active')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  tid uuid;
  v_start date;
  v_end date;
BEGIN
  SELECT id INTO tid FROM public.tenants WHERE slug = 'demo' LIMIT 1;
  IF tid IS NULL THEN
    RETURN;
  END IF;
  v_start := date_trunc('month', (timezone('America/Sao_Paulo', now()))::date)::date;
  v_end := (date_trunc('month', (timezone('America/Sao_Paulo', now()))::date) + interval '1 month - 1 day')::date;
  IF NOT EXISTS (
    SELECT 1 FROM public.desafios d
    WHERE d.tenant_id = tid AND d.nome = '30 dias de foco' AND d.starts_on = v_start
  ) THEN
    INSERT INTO public.desafios (tenant_id, nome, ativo, starts_on, ends_on, reward_label)
    VALUES (tid, '30 dias de foco', true, v_start, v_end, 'Badge mensal');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_byok_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Tenants: mesmo tenant ou admin plataforma
CREATE POLICY tenants_select ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_platform_admin());

-- platform_admins: sem leitura para usuários comuns (só service_role bypass)
CREATE POLICY platform_admins_deny_all ON public.platform_admins
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Profiles: leitura no mesmo tenant
CREATE POLICY profiles_select_tenant ON public.profiles
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Atualização: apenas própria linha; colunas sensíveis bloqueadas por privilégio de coluna
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, whatsapp, academia) ON public.profiles TO authenticated;

-- Check-ins: leitura no tenant; sem INSERT direto (usa RPC)
CREATE POLICY checkins_select_tenant ON public.checkins
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Desafios
CREATE POLICY desafios_select_tenant ON public.desafios
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Participantes: ver ranking do tenant
CREATE POLICY desafio_part_select ON public.desafio_participantes
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Pagamentos: usuário vê os seus no tenant; tenant_admin poderia ser estendido depois
CREATE POLICY pagamentos_select_own ON public.pagamentos
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (user_id IS NULL OR user_id = auth.uid()));

-- Subscriptions: próprio usuário
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR tenant_id = public.current_tenant_id()
    OR stripe_customer_id IN (
      SELECT p.stripe_customer_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.stripe_customer_id IS NOT NULL
    )
  );

-- Segredos / auditoria / fila: negado no client (service_role nas functions)
CREATE POLICY tenant_byok_deny ON public.tenant_byok_secrets
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY api_audit_deny ON public.api_key_audit_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY notif_queue_deny ON public.notification_queue
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.desafio_participantes;

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.checkins REPLICA IDENTITY FULL;
ALTER TABLE public.desafio_participantes REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Grants (cliente autenticado + anon mínimo)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.tenants TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, whatsapp, academia) ON public.profiles TO authenticated;
GRANT SELECT ON public.checkins TO authenticated;
GRANT SELECT ON public.desafios TO authenticated;
GRANT SELECT ON public.desafio_participantes TO authenticated;
GRANT SELECT ON public.pagamentos TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
