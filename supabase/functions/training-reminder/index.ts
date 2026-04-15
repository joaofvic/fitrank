import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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

// ── Streak-based messages ─────────────────────────────────────

interface ReminderMessage {
  title: string;
  body: string;
}

function buildMessage(streak: number): ReminderMessage {
  if (streak > 7) {
    return {
      title: '🔥 Mantenha o ritmo!',
      body: `Você está on fire com ${streak} dias seguidos! Não pare agora.`,
    };
  }
  if (streak > 0) {
    return {
      title: '💪 Hora de treinar!',
      body: `Não perca seu streak de ${streak} dia${streak > 1 ? 's' : ''}! Registre seu treino.`,
    };
  }
  return {
    title: '🏋️ Bora treinar?',
    body: 'Comece uma nova sequência hoje! Registre seu treino.',
  };
}

// ── Time window helpers (UTC) ─────────────────────────────────

function formatTime(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ── Handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const triggerSecret = Deno.env.get('PUSH_TRIGGER_SECRET');

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server config incomplete' }, 500);
  }

  const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!auth || (auth !== serviceKey && auth !== triggerSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const windowStart = formatTime(nowMinutes - 30);
  const windowEnd = formatTime(nowMinutes);
  const wraps = nowMinutes < 30;

  const { data: eligible, error: rpcErr } = await admin.rpc(
    'get_training_reminder_eligible',
    {
      p_window_start: windowStart,
      p_window_end: windowEnd,
      p_wraps_midnight: wraps,
    },
  );

  if (rpcErr) {
    console.error('RPC error', rpcErr);
    return json({ error: 'Query failed', detail: rpcErr.message }, 500);
  }

  if (!eligible?.length) {
    return json({ sent: 0, message: 'No eligible users' });
  }

  let sent = 0;
  let failed = 0;

  for (const user of eligible) {
    const msg = buildMessage(user.streak ?? 0);

    const { error: insErr } = await admin.from('notifications').insert({
      user_id: user.user_id,
      tenant_id: user.tenant_id,
      type: 'training_reminder',
      title: msg.title,
      body: msg.body,
      data: {},
    });

    if (insErr) {
      console.error('Notification insert failed', user.user_id, insErr);
      failed++;
    } else {
      sent++;
    }
  }

  console.log(`training-reminder: ${sent} sent, ${failed} failed, ${eligible.length} eligible`);
  return json({ sent, failed, eligible: eligible.length });
});
