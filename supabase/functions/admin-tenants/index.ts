import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    return jsonResponse({ error: 'invalid_token' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin, error: adminErr } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminErr || !isAdmin) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  if (req.method === 'GET') {
    const { data, error } = await admin.from('tenants').select('*').order('created_at', { ascending: false });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ tenants: data });
  }

  if (req.method === 'PATCH') {
    let body: { id?: string; status?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }
    if (!body.id || !body.status) {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    if (!['active', 'suspended'].includes(body.status)) {
      return jsonResponse({ error: 'invalid_status' }, 400);
    }
    const { data, error } = await admin.from('tenants').update({ status: body.status }).eq('id', body.id).select().single();
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ tenant: data });
  }

  return jsonResponse({ error: 'method_not_allowed' }, 405);
});
