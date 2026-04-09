import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS'
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
  sort: z.enum(['oldest', 'newest', 'risk']).default('oldest'),
  include_stats: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

const reviewSchema = z.object({
  checkin_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  rejection_reason_code: z.string().min(1).max(64).optional(),
  rejection_note: z.string().min(1).max(500).optional()
});

const batchReviewSchema = z.object({
  checkin_ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['approve', 'reject']),
  rejection_reason_code: z.string().min(1).max(64).optional(),
  rejection_note: z.string().min(1).max(500).optional()
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

  const url = new URL(req.url);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (req.method === 'PATCH') {
      const raw = await req.json().catch(() => null);
      const parsedSingle = reviewSchema.safeParse(raw);
      const parsedBatch = batchReviewSchema.safeParse(raw);

      if (!parsedSingle.success && !parsedBatch.success) {
        return jsonResponse(
          {
            error: 'Payload inválido',
            details: {
              single: parsedSingle.error.flatten(),
              batch: parsedBatch.error.flatten()
            }
          },
          400
        );
      }

      const payload = parsedSingle.success ? parsedSingle.data : parsedBatch.data;
      const { action, rejection_reason_code, rejection_note } = payload;
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      const patch: Record<string, unknown> = {
        photo_review_status: nextStatus,
        photo_reviewed_at: new Date().toISOString(),
        photo_reviewed_by: user.id
      };

      if (nextStatus === 'rejected') {
        patch.photo_rejection_reason_code = rejection_reason_code ?? null;
        patch.photo_rejection_note = rejection_note ?? null;
      } else {
        patch.photo_rejection_reason_code = null;
        patch.photo_rejection_note = null;
      }

      if ('checkin_id' in payload) {
        const { data, error } = await admin
          .from('checkins')
          .update(patch)
          .eq('id', payload.checkin_id)
          // trava otimista: só revisa se ainda está pending
          .eq('photo_review_status', 'pending')
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
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          return jsonResponse({ error: 'Item já foi revisado por outro admin.' }, 409);
        }

        return jsonResponse({ item: data }, 200);
      }

      const ids = payload.checkin_ids;
      const { data, error } = await admin
        .from('checkins')
        .update(patch)
        .in('id', ids)
        .eq('photo_review_status', 'pending')
        .select('id');

      if (error) throw error;

      const updatedIds = (data ?? []).map((r) => r.id);
      if (updatedIds.length !== ids.length) {
        return jsonResponse(
          {
            error: 'Alguns itens já foram revisados por outro admin.',
            updated: updatedIds.length,
            requested: ids.length,
            updated_ids: updatedIds
          },
          409
        );
      }

      return jsonResponse({ updated: updatedIds.length, updated_ids: updatedIds }, 200);
    }

    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Método não permitido' }, 405);
    }

    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse({ error: 'Query inválida', details: parsed.error.flatten() }, 400);
    }

    const { status, tenant_id, from, to, tipo, sort, include_stats, limit, offset } = parsed.data;

    const { data, error } = await admin.rpc('admin_moderation_queue', {
      p_status: status,
      p_tenant_id: tenant_id ?? null,
      p_from: from ?? null,
      p_to: to ?? null,
      p_tipo: tipo ?? null,
      p_limit: limit,
      p_offset: offset,
      p_sort: sort
    });
    if (error) throw error;

    let stats = null;
    if (include_stats === '1') {
      const { data: s, error: sErr } = await admin.rpc('admin_moderation_pending_stats', {
        p_tenant_id: tenant_id ?? null,
        p_from: from ?? null,
        p_to: to ?? null,
        p_tipo: tipo ?? null
      });
      if (sErr) throw sErr;
      stats = Array.isArray(s) && s.length > 0 ? s[0] : { pending_total: 0, pending_over_24h: 0 };
    }

    // Normaliza shape para o front (compatível com o que já renderiza)
    const rows = Array.isArray(data) ? data : [];
    const items = rows.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      user_id: r.user_id,
      checkin_local_date: r.checkin_local_date,
      tipo_treino: r.tipo_treino,
      points_awarded: r.points_awarded,
      foto_url: r.foto_url,
      created_at: r.created_at,
      photo_review_status: r.photo_review_status,
      photo_reviewed_at: r.photo_reviewed_at,
      photo_reviewed_by: r.photo_reviewed_by,
      photo_rejection_reason_code: r.photo_rejection_reason_code,
      photo_rejection_note: r.photo_rejection_note,
      user_rejections_30d: r.user_rejections_30d,
      profiles: {
        display_name: r.profile_display_name,
        nome: r.profile_nome,
        academia: r.profile_academia
      },
      tenants: {
        slug: r.tenant_slug,
        name: r.tenant_name
      }
    }));

    return jsonResponse({ items, stats, limit, offset, sort }, 200);
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

