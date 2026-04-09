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
  search: z.string().min(1).max(200).optional(),
  sort: z.enum(['oldest', 'newest', 'risk']).default('oldest'),
  include_stats: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

const reviewSchema = z.object({
  checkin_id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'reapprove']),
  rejection_reason_code: z.string().min(1).max(64).optional(),
  rejection_note: z.string().min(1).max(500).optional(),
  is_suspected: z.coerce.boolean().optional()
});

const batchReviewSchema = z.object({
  checkin_ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['approve', 'reject']),
  rejection_reason_code: z.string().min(1).max(64).optional(),
  rejection_note: z.string().min(1).max(500).optional(),
  is_suspected: z.coerce.boolean().optional()
});

function validateRejectPayload(action: 'approve' | 'reject', payload: { rejection_reason_code?: string; rejection_note?: string }) {
  if (action !== 'reject') return null;
  const code = payload.rejection_reason_code?.trim();
  if (!code) return 'Motivo obrigatório para rejeitar.';
  if (code === 'other') {
    const note = payload.rejection_note?.trim();
    if (!note) return 'Observação obrigatória quando motivo = Outro.';
  }
  return null;
}

const userContextQuerySchema = z.object({
  mode: z.literal('user-context'),
  user_id: z.string().uuid(),
  tenant_id: z.string().uuid().optional()
});

const rejectionReasonsQuerySchema = z.object({
  mode: z.literal('rejection-reasons')
});

const checkinAuditQuerySchema = z.object({
  mode: z.literal('checkin-audit'),
  checkin_id: z.string().uuid()
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
      const { action, rejection_reason_code, rejection_note, is_suspected } = payload;
      const rejectValidationError = validateRejectPayload(action, { rejection_reason_code, rejection_note });
      if (rejectValidationError) {
        return jsonResponse({ error: rejectValidationError }, 400);
      }

      // Valida motivo contra catálogo (quando rejeita)
      if (action === 'reject') {
        const code = (rejection_reason_code ?? '').trim();
        const { data: reasonRow, error: reasonErr } = await admin
          .from('photo_rejection_reasons')
          .select('code, requires_note')
          .eq('code', code)
          .eq('is_active', true)
          .maybeSingle();
        if (reasonErr) throw reasonErr;
        if (!reasonRow) {
          return jsonResponse({ error: 'Motivo inválido.' }, 400);
        }
        if (reasonRow.requires_note && !(rejection_note ?? '').trim()) {
          return jsonResponse({ error: 'Observação obrigatória para este motivo.' }, 400);
        }
      }
      const nextStatus = action === 'reject' ? 'rejected' : 'approved';
      const patch: Record<string, unknown> = {
        photo_review_status: nextStatus,
        photo_reviewed_at: new Date().toISOString(),
        photo_reviewed_by: user.id
      };

      if (nextStatus === 'rejected') {
        patch.photo_rejection_reason_code = rejection_reason_code ?? null;
        patch.photo_rejection_note = rejection_note ?? null;
        patch.photo_is_suspected = Boolean(is_suspected);
      } else {
        patch.photo_rejection_reason_code = null;
        patch.photo_rejection_note = null;
        patch.photo_is_suspected = false;
      }

      if ('checkin_id' in payload) {
        // Lock otimista:
        // - approve: pending -> approved
        // - reapprove: rejected -> approved
        // - reject: pending/approved -> rejected
        const q = admin.from('checkins').update(patch).eq('id', payload.checkin_id);
        const locked =
          action === 'reapprove'
            ? q.eq('photo_review_status', 'rejected')
            : action === 'reject'
              ? q.in('photo_review_status', ['pending', 'approved'])
              : q.eq('photo_review_status', 'pending');

        const { data, error } = await locked
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

        // US-ADM-07: notificação in-app quando rejeitar (best-effort)
        if (nextStatus === 'rejected') {
          const reasonCode = (rejection_reason_code ?? '').trim();
          const { data: reasonMeta } = await admin
            .from('photo_rejection_reasons')
            .select('label')
            .eq('code', reasonCode)
            .maybeSingle();
          const reasonLabel = reasonMeta?.label ?? reasonCode;
          const note = (rejection_note ?? '').trim();
          const body = note
            ? `Seu check-in foi rejeitado. Motivo: ${reasonLabel}. Observação: ${note}`
            : `Seu check-in foi rejeitado. Motivo: ${reasonLabel}.`;

          await admin.from('notifications').insert({
            user_id: data.user_id,
            tenant_id: data.tenant_id,
            type: 'checkin_photo_rejected',
            title: 'Foto do check-in rejeitada',
            body,
            data: {
              checkin_id: data.id,
              reason_code: reasonCode || null,
              reason_label: reasonLabel || null,
              note: note || null,
              is_suspected: Boolean(is_suspected)
            }
          });
        }

        return jsonResponse({ item: data }, 200);
      }

      const ids = payload.checkin_ids;
      const { data, error } = await admin
        .from('checkins')
        .update(patch)
        .in('id', ids)
        .eq('photo_review_status', 'pending')
        .select('id, user_id, tenant_id');

      if (error) throw error;

      const updatedRows = data ?? [];
      const updatedIds = updatedRows.map((r) => r.id);
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

      // US-ADM-07: notificação in-app no lote (best-effort)
      if (nextStatus === 'rejected') {
        const reasonCode = (rejection_reason_code ?? '').trim();
        const { data: reasonMeta } = await admin
          .from('photo_rejection_reasons')
          .select('label')
          .eq('code', reasonCode)
          .maybeSingle();
        const reasonLabel = reasonMeta?.label ?? reasonCode;
        const note = (rejection_note ?? '').trim();
        const body = note
          ? `Seu check-in foi rejeitado. Motivo: ${reasonLabel}. Observação: ${note}`
          : `Seu check-in foi rejeitado. Motivo: ${reasonLabel}.`;

        const notifRows = updatedRows.map((r) => ({
          user_id: r.user_id,
          tenant_id: r.tenant_id,
          type: 'checkin_photo_rejected',
          title: 'Foto do check-in rejeitada',
          body,
          data: {
            checkin_id: r.id,
            reason_code: reasonCode || null,
            reason_label: reasonLabel || null,
            note: note || null,
            is_suspected: Boolean(is_suspected)
          }
        }));
        if (notifRows.length > 0) {
          await admin.from('notifications').insert(notifRows);
        }
      }

      return jsonResponse({ updated: updatedIds.length, updated_ids: updatedIds }, 200);
    }

    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Método não permitido' }, 405);
    }

    const raw = Object.fromEntries(url.searchParams.entries());

    // US-ADM-07: lista de motivos padronizados (centralizados no DB)
    if (raw.mode === 'rejection-reasons') {
      const parsedReasons = rejectionReasonsQuerySchema.safeParse(raw);
      if (!parsedReasons.success) {
        return jsonResponse({ error: 'Query inválida', details: parsedReasons.error.flatten() }, 400);
      }

      const { data, error } = await admin
        .from('photo_rejection_reasons')
        .select('code, label, requires_note, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      return jsonResponse({ reasons: data ?? [] }, 200);
    }

    // US-ADM-09: histórico de decisões/auditoria por check-in
    if (raw.mode === 'checkin-audit') {
      const parsedAudit = checkinAuditQuerySchema.safeParse(raw);
      if (!parsedAudit.success) {
        return jsonResponse({ error: 'Query inválida', details: parsedAudit.error.flatten() }, 400);
      }
      const { checkin_id } = parsedAudit.data;
      const { data, error } = await admin
        .from('checkin_moderation_audit')
        .select(
          'id, action, decided_by, decided_at, reason_code, note, is_suspected, points_delta, points_before, points_after, streak_before, streak_after'
        )
        .eq('checkin_id', checkin_id)
        .order('decided_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return jsonResponse({ audit: data ?? [] }, 200);
    }

    // US-ADM-06: contexto do usuário (mini-histórico + métricas)
    if (raw.mode === 'user-context') {
      const parsedCtx = userContextQuerySchema.safeParse(raw);
      if (!parsedCtx.success) {
        return jsonResponse({ error: 'Query inválida', details: parsedCtx.error.flatten() }, 400);
      }

      const { user_id, tenant_id } = parsedCtx.data;
      const now = new Date();
      const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: profileRow, error: pErr } = await admin
        .from('profiles')
        .select('id, display_name, nome, academia, tenant_id')
        .eq('id', user_id)
        .maybeSingle();
      if (pErr) throw pErr;

      const base = admin
        .from('checkins')
        .select(
          'id, tenant_id, created_at, checkin_local_date, tipo_treino, points_awarded, foto_url, photo_review_status'
        )
        .eq('user_id', user_id);

      const recentQ = tenant_id ? base.eq('tenant_id', tenant_id) : base;
      const { data: recent, error: rErr } = await recentQ.order('created_at', { ascending: false }).limit(10);
      if (rErr) throw rErr;

      const countBase = admin
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .gte('created_at', since30d);
      const countScoped = tenant_id ? countBase.eq('tenant_id', tenant_id) : countBase;

      const [{ count: total30d, error: c1 }, { count: rej30d, error: c2 }, { count: pend30d, error: c3 }] =
        await Promise.all([
          countScoped,
          (tenant_id ? countBase.eq('tenant_id', tenant_id) : countBase).eq('photo_review_status', 'rejected'),
          (tenant_id ? countBase.eq('tenant_id', tenant_id) : countBase).eq('photo_review_status', 'pending')
        ]);
      if (c1) throw c1;
      if (c2) throw c2;
      if (c3) throw c3;

      const { count: appr30d, error: c4 } = await (tenant_id ? countBase.eq('tenant_id', tenant_id) : countBase).eq(
        'photo_review_status',
        'approved'
      );
      if (c4) throw c4;

      const total = total30d ?? 0;
      const rejected = rej30d ?? 0;
      const rejection_rate_30d = total > 0 ? rejected / total : 0;

      return jsonResponse(
        {
          context: {
            profile: profileRow ?? null,
            stats: {
              total_30d: total,
              approved_30d: appr30d ?? 0,
              rejected_30d: rejected,
              pending_30d: pend30d ?? 0,
              rejection_rate_30d,
              denuncias_30d: null
            },
            recent_checkins: Array.isArray(recent) ? recent : []
          }
        },
        200
      );
    }

    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse({ error: 'Query inválida', details: parsed.error.flatten() }, 400);
    }

    const { status, tenant_id, from, to, tipo, search, sort, include_stats, limit, offset } = parsed.data;

    const { data, error } = await admin.rpc('admin_moderation_queue', {
      p_status: status,
      p_tenant_id: tenant_id ?? null,
      p_from: from ?? null,
      p_to: to ?? null,
      p_tipo: tipo ?? null,
      p_search: search ?? null,
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

