-- ============================================================
-- Push Dispatch: trigger AFTER INSERT ON notifications
-- Calls send-push Edge Function via pg_net
-- Requires: pg_net extension, vault secrets (supabase_url,
--           supabase_anon_key, push_trigger_secret)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Trigger function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  _url   text;
  _anon  text;
  _secret text;
BEGIN
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _anon
    FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1;
  SELECT decrypted_secret INTO _secret
    FROM vault.decrypted_secrets WHERE name = 'push_trigger_secret' LIMIT 1;

  IF _url IS NULL OR _anon IS NULL OR _secret IS NULL THEN
    RAISE WARNING 'push dispatch: vault secrets not configured (supabase_url, supabase_anon_key, push_trigger_secret)';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _secret,
      'apikey',        _anon
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'type',    NEW.type,
      'title',   NEW.title,
      'body',    COALESCE(NEW.body, ''),
      'data',    NEW.data
    )
  );

  RETURN NEW;
END;
$$;

-- ── Trigger ─────────────────────────────────────────────────

CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();
