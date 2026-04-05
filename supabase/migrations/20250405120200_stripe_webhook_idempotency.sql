CREATE TABLE public.stripe_webhook_events (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_events_deny ON public.stripe_webhook_events
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
