-- ============================================================
-- Training Reminder: RPC + pg_cron job
-- Runs every 30 min, finds users who haven't trained today
-- and sends a push notification via notifications INSERT
-- (which triggers notify_push_on_insert → send-push).
-- ============================================================

-- ── RPC: get eligible users for training reminder ───────────

CREATE OR REPLACE FUNCTION public.get_training_reminder_eligible(
  p_window_start time,
  p_window_end   time,
  p_wraps_midnight boolean DEFAULT false
)
RETURNS TABLE (
  user_id   uuid,
  tenant_id uuid,
  streak    integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT ON (p.id)
    p.id        AS user_id,
    p.tenant_id AS tenant_id,
    p.streak    AS streak
  FROM profiles p
  JOIN push_preferences pp ON pp.user_id = p.id
  WHERE pp.enabled = true
    AND pp.training_reminder = true
    AND (p.last_checkin_date IS NULL OR p.last_checkin_date < CURRENT_DATE)
    AND (
      CASE WHEN p_wraps_midnight THEN
        pp.reminder_time >= p_window_start OR pp.reminder_time < p_window_end
      ELSE
        pp.reminder_time >= p_window_start AND pp.reminder_time < p_window_end
      END
    )
    AND EXISTS (
      SELECT 1 FROM push_tokens pt WHERE pt.user_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = p.id
        AND n.type = 'training_reminder'
        AND n.created_at >= CURRENT_DATE::timestamptz
    );
$$;

-- ── pg_cron: schedule every 30 minutes ──────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;

-- The cron job calls the training-reminder Edge Function via pg_net
SELECT cron.schedule(
  'training-reminder-dispatch',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
               || '/functions/v1/training-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_trigger_secret' LIMIT 1),
      'apikey',        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);
