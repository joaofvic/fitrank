-- Migration: Advanced Fitness Features - Schema Foundation
-- Epics 1, 3, 4, 5, 6 - Tabelas, RPCs, índices, bucket e RLS
-- Aplicada manualmente via MCP; este arquivo versiona o schema existente no banco.

-- ============================================================
-- 1. Estender tabela checkins (duration + notes)
-- ============================================================
ALTER TABLE IF EXISTS checkins ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE IF EXISTS checkins ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- 2. Tabela body_measurements
-- ============================================================
CREATE TABLE IF NOT EXISTS body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  chest_cm numeric(5,1),
  waist_cm numeric(5,1),
  hip_cm numeric(5,1),
  bicep_cm numeric(5,1),
  thigh_cm numeric(5,1),
  calf_cm numeric(5,1),
  notes text,
  checkin_id uuid REFERENCES checkins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date
  ON body_measurements(user_id, measured_at DESC);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'body_measurements' AND policyname = 'Users read own measurements') THEN
    CREATE POLICY "Users read own measurements" ON body_measurements FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'body_measurements' AND policyname = 'Users insert own measurements') THEN
    CREATE POLICY "Users insert own measurements" ON body_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'body_measurements' AND policyname = 'Users update own measurements') THEN
    CREATE POLICY "Users update own measurements" ON body_measurements FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'body_measurements' AND policyname = 'Users delete own measurements') THEN
    CREATE POLICY "Users delete own measurements" ON body_measurements FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'body_measurements' AND policyname = 'Platform admins read all measurements') THEN
    CREATE POLICY "Platform admins read all measurements" ON body_measurements FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_master = true));
  END IF;
END $$;

-- ============================================================
-- 3. Tabela progress_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_type text NOT NULL DEFAULT 'front',
  taken_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date
  ON progress_photos(user_id, taken_at DESC);

ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progress_photos' AND policyname = 'Users read own progress photos') THEN
    CREATE POLICY "Users read own progress photos" ON progress_photos FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progress_photos' AND policyname = 'Users insert own progress photos') THEN
    CREATE POLICY "Users insert own progress photos" ON progress_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progress_photos' AND policyname = 'Users update own progress photos') THEN
    CREATE POLICY "Users update own progress photos" ON progress_photos FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progress_photos' AND policyname = 'Users delete own progress photos') THEN
    CREATE POLICY "Users delete own progress photos" ON progress_photos FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'progress_photos' AND policyname = 'Platform admins read all progress photos') THEN
    CREATE POLICY "Platform admins read all progress photos" ON progress_photos FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_master = true));
  END IF;
END $$;

-- Bucket progress-photos (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users read own progress photos storage') THEN
    CREATE POLICY "Users read own progress photos storage" ON storage.objects FOR SELECT
      USING (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users delete own progress photos storage') THEN
    CREATE POLICY "Users delete own progress photos storage" ON storage.objects FOR DELETE
      USING (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- ============================================================
-- 4. Tabelas workout_plans + workout_plan_days
-- ============================================================
CREATE TABLE IF NOT EXISTS workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  goal text NOT NULL,
  frequency_per_week int NOT NULL DEFAULT 4,
  duration_weeks int NOT NULL DEFAULT 4,
  difficulty text DEFAULT 'intermediate',
  ai_generated boolean DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user ON workout_plans(user_id, status);

ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plans' AND policyname = 'Users see own plans') THEN
    CREATE POLICY "Users see own plans" ON workout_plans FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plans' AND policyname = 'Users insert own plans') THEN
    CREATE POLICY "Users insert own plans" ON workout_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plans' AND policyname = 'Users update own plans') THEN
    CREATE POLICY "Users update own plans" ON workout_plans FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plans' AND policyname = 'Users delete own plans') THEN
    CREATE POLICY "Users delete own plans" ON workout_plans FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plans' AND policyname = 'Service role full access plans') THEN
    CREATE POLICY "Service role full access plans" ON workout_plans FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workout_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_number int NOT NULL,
  title text NOT NULL,
  muscle_groups text[] NOT NULL,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_plan_days_plan ON workout_plan_days(plan_id, day_number);

ALTER TABLE workout_plan_days ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plan_days' AND policyname = 'Users see own plan days') THEN
    CREATE POLICY "Users see own plan days" ON workout_plan_days FOR SELECT
      USING (EXISTS (SELECT 1 FROM workout_plans p WHERE p.id = workout_plan_days.plan_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plan_days' AND policyname = 'Users insert own plan days') THEN
    CREATE POLICY "Users insert own plan days" ON workout_plan_days FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM workout_plans p WHERE p.id = workout_plan_days.plan_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plan_days' AND policyname = 'Users delete own plan days') THEN
    CREATE POLICY "Users delete own plan days" ON workout_plan_days FOR DELETE
      USING (EXISTS (SELECT 1 FROM workout_plans p WHERE p.id = workout_plan_days.plan_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_plan_days' AND policyname = 'Service role full access plan days') THEN
    CREATE POLICY "Service role full access plan days" ON workout_plan_days FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================
-- 5. RPCs
-- ============================================================

-- Heatmap de consistência (Epic 3)
CREATE OR REPLACE FUNCTION public.get_checkin_heatmap(p_user_id uuid, p_year integer)
RETURNS TABLE(date date, count integer)
LANGUAGE sql STABLE AS $$
  SELECT
    c.checkin_local_date AS date,
    count(*)::integer AS count
  FROM checkins c
  WHERE c.user_id = p_user_id
    AND c.checkin_local_date >= make_date(p_year, 1, 1)
    AND c.checkin_local_date <= make_date(p_year, 12, 31)
    AND c.photo_review_status IS DISTINCT FROM 'rejected'
  GROUP BY c.checkin_local_date
  ORDER BY c.checkin_local_date;
$$;

-- Histórico de medidas corporais (Epic 4)
CREATE OR REPLACE FUNCTION public.get_body_measurements_history(p_user_id uuid, p_limit integer DEFAULT 50)
RETURNS SETOF body_measurements
LANGUAGE sql STABLE AS $$
  SELECT *
  FROM body_measurements
  WHERE user_id = p_user_id
  ORDER BY measured_at DESC
  LIMIT p_limit;
$$;

-- Fotos de progresso (Epic 4)
CREATE OR REPLACE FUNCTION public.get_progress_photos(p_user_id uuid)
RETURNS TABLE(id uuid, photo_url text, photo_type text, taken_at date, notes text, created_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT pp.id, pp.photo_url, pp.photo_type, pp.taken_at, pp.notes, pp.created_at
  FROM progress_photos pp
  WHERE pp.user_id = p_user_id
  ORDER BY pp.taken_at DESC, pp.photo_type;
$$;

-- Estatísticas de treino (Epic 5)
CREATE OR REPLACE FUNCTION public.get_user_workout_stats(p_user_id uuid, p_days integer DEFAULT 90)
RETURNS json
LANGUAGE plpgsql STABLE AS $$
DECLARE
  result json;
  since_date date := CURRENT_DATE - p_days;
BEGIN
  SELECT json_build_object(
    'daily', (
      SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT checkin_local_date AS date, count(*)::int AS count
        FROM checkins
        WHERE user_id = p_user_id
          AND checkin_local_date >= since_date
          AND photo_review_status != 'rejected'
        GROUP BY checkin_local_date
        ORDER BY checkin_local_date
      ) t
    ),
    'by_type', (
      SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::json)
      FROM (
        SELECT tipo_treino AS type, count(*)::int AS count
        FROM checkins
        WHERE user_id = p_user_id
          AND checkin_local_date >= since_date
          AND photo_review_status != 'rejected'
        GROUP BY tipo_treino
      ) t
    ),
    'totals', (
      SELECT row_to_json(t)
      FROM (
        SELECT
          count(*)::int AS total_checkins,
          count(DISTINCT checkin_local_date)::int AS active_days
        FROM checkins
        WHERE user_id = p_user_id
          AND checkin_local_date >= since_date
          AND photo_review_status != 'rejected'
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- Tendência de peso (Epic 5)
CREATE OR REPLACE FUNCTION public.get_user_weight_trend(p_user_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE(date date, weight_kg numeric)
LANGUAGE sql STABLE AS $$
  SELECT measured_at AS date, weight_kg
  FROM body_measurements
  WHERE user_id = p_user_id
    AND weight_kg IS NOT NULL
    AND measured_at >= CURRENT_DATE - p_days
  ORDER BY measured_at;
$$;

-- Comparativo com amigos (Epic 5)
CREATE OR REPLACE FUNCTION public.get_friend_comparison(p_user_id uuid, p_friend_ids uuid[])
RETURNS json
LANGUAGE plpgsql STABLE AS $$
DECLARE
  result json;
  all_ids uuid[] := array_append(p_friend_ids, p_user_id);
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  INTO result
  FROM (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.avatar_url,
      coalesce(p.pontos, 0) AS pontos,
      coalesce(p.streak, 0) AS streak,
      (
        SELECT count(*)::int
        FROM checkins c
        WHERE c.user_id = p.id
          AND c.checkin_local_date >= CURRENT_DATE - 30
          AND c.photo_review_status != 'rejected'
      ) AS checkins_30d
    FROM profiles p
    WHERE p.id = ANY(all_ids)
    ORDER BY checkins_30d DESC
  ) t;
  RETURN result;
END;
$$;

-- Plano ativo de treino (Epic 6)
CREATE OR REPLACE FUNCTION public.get_active_workout_plan(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE AS $$
DECLARE
  result json;
BEGIN
  SELECT row_to_json(t) INTO result
  FROM (
    SELECT
      wp.id, wp.title, wp.description, wp.goal,
      wp.frequency_per_week, wp.duration_weeks, wp.difficulty,
      wp.status, wp.created_at,
      (
        SELECT coalesce(json_agg(row_to_json(d) ORDER BY d.day_number), '[]'::json)
        FROM workout_plan_days d
        WHERE d.plan_id = wp.id
      ) AS days
    FROM workout_plans wp
    WHERE wp.user_id = p_user_id AND wp.status = 'active'
    ORDER BY wp.created_at DESC
    LIMIT 1
  ) t;
  RETURN result;
END;
$$;
