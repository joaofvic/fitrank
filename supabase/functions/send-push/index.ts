import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';
import { sendWebPush, type PushSubscription } from '../_shared/web-push.ts';

// ── CORS ──────────────────────────────────────────────────────

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Type → preference category (US 4.3) ──────────────────────

const TYPE_TO_CATEGORY: Record<string, string> = {
  like: 'social',
  comment: 'social',
  mention: 'social',
  share: 'social',
  friend_request: 'friends',
  friend_accepted: 'friends',
  badge_unlocked: 'achievements',
  league_promoted: 'achievements',
  streak_recovered: 'achievements',
  boost_purchased: 'achievements',
  admin_message: 'admin',
  checkin_photo_rejected: 'admin',
  checkin_rejected: 'admin',
  checkin_approved: 'admin',
  photo_rejected: 'admin',
};

// ── Validation ────────────────────────────────────────────────

const requestSchema = z.object({
  user_id: z.string().uuid(),
  type: z.string(),
  title: z.string().min(1),
  body: z.string().default(''),
  data: z.record(z.unknown()).default({}),
});

// ── Quiet hours check (UTC-based) ────────────────────────────

interface QuietConfig {
  quiet_start: string | null;
  quiet_end: string | null;
}

function isQuietHours(prefs: QuietConfig): boolean {
  if (!prefs.quiet_start || !prefs.quiet_end) return false;

  const now = new Date();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();

  const [sH, sM] = prefs.quiet_start.split(':').map(Number);
  const [eH, eM] = prefs.quiet_end.split(':').map(Number);
  const start = sH * 60 + sM;
  const end = eH * 60 + eM;

  return start <= end
    ? cur >= start && cur < end
    : cur >= start || cur < end; // wraps midnight
}

// ── Handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Config ──────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const triggerSecret = Deno.env.get('PUSH_TRIGGER_SECRET');

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server config incomplete' }, 500);
  }

  // ── Auth: accept either service_role or trigger secret ──────
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!auth || (auth !== serviceKey && auth !== triggerSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────
  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.errors : 'Invalid request body';
    return json({ error: msg }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Fetch tokens ────────────────────────────────────────────
  const { data: tokens, error: tokErr } = await admin
    .from('push_tokens')
    .select('id, token, platform')
    .eq('user_id', payload.user_id);

  if (tokErr) {
    console.error('push_tokens query', tokErr);
    return json({ error: 'Failed to fetch tokens' }, 500);
  }

  if (!tokens?.length) {
    return json({ sent: 0, failed: 0, skipped: ['no_tokens'] });
  }

  // ── Fetch preferences ──────────────────────────────────────
  const { data: prefs } = await admin
    .from('push_preferences')
    .select('*')
    .eq('user_id', payload.user_id)
    .maybeSingle();

  const p = prefs ?? { enabled: true } as Record<string, unknown>;

  if (!p.enabled) {
    return json({ sent: 0, failed: 0, skipped: ['push_disabled'] });
  }

  const category = TYPE_TO_CATEGORY[payload.type];
  if (category && p[category] === false) {
    return json({ sent: 0, failed: 0, skipped: ['category_disabled', category] });
  }

  if (isQuietHours(p as QuietConfig)) {
    return json({ sent: 0, failed: 0, skipped: ['quiet_hours'] });
  }

  // ── VAPID config ────────────────────────────────────────────
  const vapidPub = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@fitrank.app';

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: payload.data,
    type: payload.type,
  });

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  for (const t of tokens) {
    if (t.platform === 'web') {
      if (!vapidPub || !vapidPriv) {
        console.warn('VAPID keys not configured — skipping web push');
        continue;
      }

      let sub: PushSubscription;
      try {
        sub = JSON.parse(t.token);
        if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('malformed');
      } catch {
        console.error('Invalid subscription JSON', t.id);
        staleIds.push(t.id);
        failed++;
        continue;
      }

      const result = await sendWebPush(sub, pushPayload, vapidPub, vapidPriv, vapidSubject);

      if (result.success) {
        sent++;
      } else {
        failed++;
        console.error('Web push error', { id: t.id, status: result.statusCode, err: result.error });
        if (result.statusCode === 404 || result.statusCode === 410) {
          staleIds.push(t.id);
        }
      }
    } else {
      // Android/iOS via FCM — será implementado na Epic 2
      console.warn(`FCM not implemented yet, skipping ${t.platform} token ${t.id}`);
    }
  }

  // ── Cleanup stale tokens ────────────────────────────────────
  if (staleIds.length) {
    const { error: delErr } = await admin.from('push_tokens').delete().in('id', staleIds);
    if (delErr) console.error('Token cleanup failed', delErr);
  }

  return json({ sent, failed, cleaned: staleIds.length });
});
