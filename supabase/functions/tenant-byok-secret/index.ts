import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { encryptSecret } from '../_shared/crypto.ts';

const bodySchema = z.object({
  provider: z.enum(['stripe', 'brevo']),
  secret: z.string().min(8)
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const masterKey = Deno.env.get('BYOK_MASTER_KEY');
  if (!masterKey) {
    return jsonResponse({ error: 'byok_master_not_configured' }, 503);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const jwt = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'invalid_session' }, 401);
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: 'invalid_body', details: String(e) }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', userData.user.id)
    .single();

  if (!profile?.tenant_id) {
    return jsonResponse({ error: 'profile_not_found' }, 400);
  }

  const { data: isMaster } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  const canSet = profile.role === 'tenant_admin' || isMaster;
  if (!canSet) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const { ciphertext, iv } = await encryptSecret(parsed.secret, masterKey);

  const { error: upErr } = await admin.from('tenant_byok_secrets').upsert(
    {
      tenant_id: profile.tenant_id,
      provider: parsed.provider,
      ciphertext,
      iv,
      updated_by: userData.user.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'tenant_id,provider' }
  );

  if (upErr) {
    console.error('[tenant-byok-secret] upsert_failed', upErr);
    return jsonResponse({ error: 'save_failed' }, 500);
  }

  const ip = req.headers.get('x-forwarded-for') ?? undefined;
  await admin.from('api_key_audit_log').insert({
    tenant_id: profile.tenant_id,
    provider: parsed.provider,
    action: 'set',
    actor_user_id: userData.user.id,
    actor_ip: ip
  });

  return jsonResponse({ ok: true });
});
