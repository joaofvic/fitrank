import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const patchSchema = z.object({
  tenant_id: z.string().uuid(),
  status: z.enum(['active', 'suspended'])
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Não autorizado' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Sessão inválida' }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('is_platform_master')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.is_platform_master) {
    return jsonResponse({ error: 'Acesso negado' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin.from('tenants').select('*').order('created_at', {
        ascending: true
      });
      if (error) throw error;
      return jsonResponse({ tenants: data ?? [] }, 200);
    }

    if (req.method === 'PATCH') {
      const raw = await req.json();
      const parsed = patchSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
      }
      const { tenant_id, status } = parsed.data;
      const { data, error } = await admin
        .from('tenants')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', tenant_id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return jsonResponse({ error: 'Tenant não encontrado' }, 404);
      }
      return jsonResponse({ tenant: data }, 200);
    }

    return jsonResponse({ error: 'Método não permitido' }, 405);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('admin-tenants:', message);
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
