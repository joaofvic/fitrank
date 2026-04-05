import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { decryptSecret } from '../_shared/crypto.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const bodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
  tenantId: z.string().uuid().optional()
});

async function sendBrevo(apiKey: string, senderEmail: string, senderName: string, to: string, subject: string, html: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`brevo_${res.status}: ${t}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const internalKey = Deno.env.get('EMAIL_INTERNAL_KEY');
  const headerKey = req.headers.get('x-email-internal-key');
  if (!internalKey || headerKey !== internalKey) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: 'invalid_body', details: String(e) }, 400);
  }

  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'FitRank';
  let apiKey = Deno.env.get('BREVO_API_KEY');

  if (parsed.tenantId) {
    const masterKey = Deno.env.get('BYOK_MASTER_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!masterKey) {
      return jsonResponse({ error: 'byok_not_configured' }, 503);
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: row } = await admin
      .from('tenant_byok_secrets')
      .select('ciphertext, iv')
      .eq('tenant_id', parsed.tenantId)
      .eq('provider', 'brevo')
      .maybeSingle();
    if (row?.ciphertext && row?.iv) {
      apiKey = await decryptSecret(row.ciphertext, row.iv, masterKey);
    }
  }

  if (!apiKey || !senderEmail) {
    return jsonResponse({ error: 'brevo_not_configured' }, 503);
  }

  try {
    await sendBrevo(apiKey, senderEmail, senderName, parsed.to, parsed.subject, parsed.htmlContent);
  } catch (e) {
    console.error('[send-email] brevo_error', { message: (e as Error).message });
    return jsonResponse({ error: 'send_failed' }, 502);
  }

  return jsonResponse({ ok: true });
});
