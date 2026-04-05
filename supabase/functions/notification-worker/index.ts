import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const workerSecret = Deno.env.get('NOTIFICATION_WORKER_SECRET');
  const header = req.headers.get('x-worker-secret');
  if (!workerSecret || header !== workerSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: batch, error } = await admin
    .from('notification_queue')
    .select('id, tenant_id, user_id, template_key, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error('[notification-worker] fetch_failed', error);
    return jsonResponse({ error: 'fetch_failed' }, 500);
  }

  const emailKey = Deno.env.get('EMAIL_INTERNAL_KEY');
  const baseUrl = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '');
  const fnUrl = `${baseUrl}/functions/v1/send-email`;

  let processed = 0;
  for (const row of batch ?? []) {
    const email = (row.payload as { email?: string })?.email;
    if (!email) {
      await admin
        .from('notification_queue')
        .update({ status: 'failed', last_error: 'missing_email_in_payload', processed_at: new Date().toISOString() })
        .eq('id', row.id);
      continue;
    }

    const subject =
      row.template_key === 'checkin_reminder'
        ? 'Lembrete FitRank — hora de treinar'
        : 'Mensagem FitRank';
    const html =
      row.template_key === 'checkin_reminder'
        ? '<p>Que tal registrar seu treino hoje no FitRank?</p>'
        : `<p>${row.template_key}</p>`;

    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(emailKey ? { 'x-email-internal-key': emailKey } : {})
        },
        body: JSON.stringify({
          to: email,
          subject,
          htmlContent: html,
          tenantId: row.tenant_id
        })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      await admin
        .from('notification_queue')
        .update({ status: 'sent', processed_at: new Date().toISOString(), attempts: 1 })
        .eq('id', row.id);
      processed += 1;
    } catch (e) {
      console.error('[notification-worker] send_failed', { id: row.id, message: (e as Error).message });
      await admin
        .from('notification_queue')
        .update({
          status: 'failed',
          last_error: (e as Error).message,
          attempts: 1,
          processed_at: new Date().toISOString()
        })
        .eq('id', row.id);
    }
  }

  return jsonResponse({ processed, total: batch?.length ?? 0 });
});
