import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  tenant_id: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tipo: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
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

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: 'Query inválida', details: parsed.error.flatten() }, 400);
  }

  const { status, tenant_id, from, to, tipo, limit, offset } = parsed.data;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    let q = admin
      .from('checkins')
      .select(
        `
          id,
          tenant_id,
          user_id,
          checkin_local_date,
          tipo_treino,
          points_awarded,
          foto_url,
          created_at,
          photo_review_status,
          photo_reviewed_at,
          photo_reviewed_by,
          photo_rejection_reason_code,
          photo_rejection_note,
          profiles:profiles!checkins_user_profile_fkey ( id, display_name, nome, academia ),
          tenants:tenants!checkins_tenant_id_fkey ( id, slug, name )
        `
      )
      .not('foto_url', 'is', null)
      .eq('photo_review_status', status);

    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    if (from) q = q.gte('checkin_local_date', from);
    if (to) q = q.lte('checkin_local_date', to);
    if (tipo) q = q.ilike('tipo_treino', `%${tipo}%`);

    q = q.order('created_at', { ascending: true }).range(offset, offset + limit - 1);

    const { data, error } = await q;
    if (error) throw error;

    return jsonResponse({ items: data ?? [], limit, offset }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('admin-moderation:', message);
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

