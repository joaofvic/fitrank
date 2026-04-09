import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS'
};

const listQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  tenant_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

const detailQuerySchema = z.object({
  mode: z.literal('detail'),
  user_id: z.string().uuid()
});

const resetFlagsSchema = z.object({
  action: z.literal('reset-flags'),
  user_id: z.string().uuid(),
  reset_photo_suspected: z.coerce.boolean().default(false),
  reset_under_review: z.coerce.boolean().default(false)
});

const setUnderReviewSchema = z.object({
  action: z.literal('set-under-review'),
  user_id: z.string().uuid(),
  under_review: z.coerce.boolean(),
  reason: z.string().min(1).max(500).optional()
});

const banUserSchema = z.object({
  action: z.literal('ban-user'),
  user_id: z.string().uuid(),
  reason: z.string().min(1).max(500)
});

const unbanUserSchema = z.object({
  action: z.literal('unban-user'),
  user_id: z.string().uuid(),
  reason: z.string().min(1).max(500).optional()
});

const adjustPointsSchema = z.object({
  action: z.literal('adjust-points'),
  user_id: z.string().uuid(),
  delta: z.coerce.number().int().min(-100_000).max(100_000).refine((v) => v !== 0, 'delta não pode ser 0'),
  reason: z.string().min(1).max(500),
  reference: z.string().max(500).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().min(1).max(50).optional()
});

function looksUuid(v: string) {
  // uuid v4-ish: aceitamos qualquer uuid canônico
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** local@domínio — evita needle só "@" ou "@x" */
function looksLikeEmailSearch(qq: string): boolean {
  const at = qq.indexOf('@');
  return at > 0 && at < qq.length - 1;
}

/**
 * Busca por e-mail via GoTrue Admin API com `filter` (não varre páginas).
 * Retorna IDs + emails; pode retornar múltiplos (emails não são garantidos únicos).
 */
async function authAdminFilterUsersByEmailNeedle(
  supabaseUrl: string,
  serviceKey: string,
  needle: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const url = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  url.searchParams.set('filter', needle);
  url.searchParams.set('per_page', '100');
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('admin-users auth filter failed:', res.status, text);
    return map;
  }

  const json = (await res.json().catch(() => null)) as any;
  const users = Array.isArray(json?.users) ? json.users : Array.isArray(json) ? json : [];
  for (const u of users) {
    const id = u?.id;
    const email = u?.email;
    if (typeof id === 'string' && typeof email === 'string' && email) {
      map.set(id, email);
    }
  }
  return map;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/** US-ADM-15: log central (best-effort; não falha a operação principal). */
async function insertPlatformAudit(
  admin: ReturnType<typeof createClient>,
  row: {
    actor_id: string;
    action: string;
    target_type: 'user' | 'checkin' | 'tenant' | 'none';
    target_id: string | null;
    tenant_id: string | null;
    payload: Record<string, unknown>;
  }
) {
  const { error } = await admin.from('platform_admin_audit_log').insert({
    actor_id: row.actor_id,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    tenant_id: row.tenant_id,
    payload: row.payload
  });
  if (error) console.error('platform_admin_audit_log', error);
}

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

  const url = new URL(req.url);

  try {
    if (req.method === 'PATCH') {
      const raw = await req.json().catch(() => null);
      const parsedReset = resetFlagsSchema.safeParse(raw);
      const parsedReview = setUnderReviewSchema.safeParse(raw);
      const parsedBan = banUserSchema.safeParse(raw);
      const parsedUnban = unbanUserSchema.safeParse(raw);
      const parsedAdjust = adjustPointsSchema.safeParse(raw);

      if (!parsedReset.success && !parsedReview.success && !parsedBan.success && !parsedUnban.success && !parsedAdjust.success) {
        return jsonResponse(
          {
            error: 'Payload inválido',
            details: {
              reset: parsedReset.error.flatten(),
              under_review: parsedReview.error.flatten(),
              ban: parsedBan.error.flatten(),
              unban: parsedUnban.error.flatten(),
              adjust_points: parsedAdjust.error.flatten()
            }
          },
          400
        );
      }

      if (parsedReset.success) {
        const { user_id, reset_photo_suspected, reset_under_review } = parsedReset.data;

        const { data: prof } = await admin.from('profiles').select('tenant_id').eq('id', user_id).maybeSingle();

        if (reset_photo_suspected) {
          await admin
            .from('checkins')
            .update({ photo_is_suspected: false })
            .eq('user_id', user_id)
            .eq('photo_is_suspected', true);
        }
        if (reset_under_review) {
          await admin
            .from('profiles')
            .update({ photo_under_review: false, photo_under_review_at: null, photo_under_review_by: null })
            .eq('id', user_id);
        }

        await admin.from('admin_user_audit').insert({
          user_id,
          tenant_id: prof?.tenant_id ?? null,
          action: 'reset_flags',
          reason: null,
          metadata: { reset_photo_suspected, reset_under_review },
          acted_by: user.id
        });

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'users.reset_flags',
          target_type: 'user',
          target_id: user_id,
          tenant_id: prof?.tenant_id ?? null,
          payload: { reset_photo_suspected, reset_under_review }
        });

        return jsonResponse({ ok: true }, 200);
      }

      if (parsedReview.success) {
        const { user_id, under_review, reason } = parsedReview.data;
        const { data: prof, error: pErr } = await admin
          .from('profiles')
          .select('tenant_id')
          .eq('id', user_id)
          .maybeSingle();
        if (pErr) throw pErr;

        await admin
          .from('profiles')
          .update({
            photo_under_review: under_review,
            photo_under_review_at: under_review ? new Date().toISOString() : null,
            photo_under_review_by: under_review ? user.id : null
          })
          .eq('id', user_id);

        await admin.from('admin_user_audit').insert({
          user_id,
          tenant_id: prof?.tenant_id ?? null,
          action: 'set_under_review',
          reason: reason ?? null,
          metadata: { under_review },
          acted_by: user.id
        });

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'users.set_under_review',
          target_type: 'user',
          target_id: user_id,
          tenant_id: prof?.tenant_id ?? null,
          payload: { under_review, reason: reason ?? null }
        });

        return jsonResponse({ ok: true }, 200);
      }

      if (parsedBan.success) {
        const { user_id, reason } = parsedBan.data;
        const { data: prof, error: pErr } = await admin
          .from('profiles')
          .select('tenant_id')
          .eq('id', user_id)
          .maybeSingle();
        if (pErr) throw pErr;

        await admin
          .from('profiles')
          .update({
            is_banned: true,
            banned_at: new Date().toISOString(),
            banned_by: user.id,
            ban_reason: reason
          })
          .eq('id', user_id);

        await admin.from('admin_user_audit').insert({
          user_id,
          tenant_id: prof?.tenant_id ?? null,
          action: 'ban',
          reason,
          metadata: {},
          acted_by: user.id
        });

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'users.ban',
          target_type: 'user',
          target_id: user_id,
          tenant_id: prof?.tenant_id ?? null,
          payload: { reason }
        });

        return jsonResponse({ ok: true }, 200);
      }

      if (parsedAdjust.success) {
        const { user_id, delta, reason, reference, effective_date, category } = parsedAdjust.data;

        const { data: prof } = await admin.from('profiles').select('tenant_id').eq('id', user_id).maybeSingle();

        const { data: row, error: rpcErr } = await admin.rpc('admin_adjust_points', {
          p_user_id: user_id,
          p_delta: delta,
          p_reason: reason,
          p_reference: reference ?? null,
          p_actor: user.id,
          p_effective_date: effective_date ?? null,
          p_category: category ?? null
        });
        if (rpcErr) throw rpcErr;

        await admin.from('admin_user_audit').insert({
          user_id,
          tenant_id: prof?.tenant_id ?? null,
          action: 'adjust_points',
          reason,
          metadata: {
            delta,
            category: category ?? null,
            effective_date: effective_date ?? null,
            reference: reference ?? null,
            ledger_id: row?.id ?? null
          },
          acted_by: user.id
        });

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'users.adjust_points',
          target_type: 'user',
          target_id: user_id,
          tenant_id: prof?.tenant_id ?? null,
          payload: {
            delta,
            reason,
            ledger_id: row?.id ?? null,
            category: category ?? null,
            effective_date: effective_date ?? null
          }
        });

        return jsonResponse({ ok: true, ledger: row ?? null }, 200);
      }

      // unban
      const { user_id, reason } = parsedUnban.data;
      const { data: prof, error: pErr } = await admin
        .from('profiles')
        .select('tenant_id')
        .eq('id', user_id)
        .maybeSingle();
      if (pErr) throw pErr;

      await admin
        .from('profiles')
        .update({
          is_banned: false,
          banned_at: null,
          banned_by: null,
          ban_reason: null
        })
        .eq('id', user_id);

      await admin.from('admin_user_audit').insert({
        user_id,
        tenant_id: prof?.tenant_id ?? null,
        action: 'unban',
        reason: reason ?? null,
        metadata: {},
        acted_by: user.id
      });

      await insertPlatformAudit(admin, {
        actor_id: user.id,
        action: 'users.unban',
        target_type: 'user',
        target_id: user_id,
        tenant_id: prof?.tenant_id ?? null,
        payload: { reason: reason ?? null }
      });

      return jsonResponse({ ok: true }, 200);
    }

    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Método não permitido' }, 405);
    }

    const raw = Object.fromEntries(url.searchParams.entries());

    if (raw.mode === 'detail') {
      const parsed = detailQuerySchema.safeParse(raw);
      if (!parsed.success) {
        return jsonResponse({ error: 'Query inválida', details: parsed.error.flatten() }, 400);
      }

      const { user_id } = parsed.data;

      const { data: prof, error: pErr } = await admin
        .from('profiles')
        .select(
          'id, tenant_id, display_name, nome, academia, pontos, streak, last_checkin_date, created_at, is_pro, photo_under_review, is_banned, banned_at, banned_by, ban_reason'
        )
        .eq('id', user_id)
        .maybeSingle();
      if (pErr) throw pErr;

      // Buscar email via Auth Admin API (evita depender de schema auth exposto no PostgREST)
      let userEmail: string | null = null;
      try {
        const { data: authUser, error: guErr } = await admin.auth.admin.getUserById(user_id);
        if (guErr) throw guErr;
        userEmail = authUser?.user?.email ?? null;
      } catch {
        userEmail = null;
      }

      const { data: tenantRow, error: tErr } = prof?.tenant_id
        ? await admin.from('tenants').select('id, slug, name, status').eq('id', prof.tenant_id).maybeSingle()
        : { data: null, error: null };
      if (tErr) throw tErr;

      const { data: audit, error: auErr } = await admin
        .from('admin_user_audit')
        .select('id, action, reason, metadata, acted_by, acted_at')
        .eq('user_id', user_id)
        .order('acted_at', { ascending: false })
        .limit(50);
      if (auErr) throw auErr;

      const { data: ledger, error: ledErr } = await admin
        .from('points_ledger')
        .select('id, delta, category, reason, reference, effective_date, created_by, created_at, points_before, points_after')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (ledErr) throw ledErr;

      const actorIds = Array.from(new Set((audit ?? []).map((a) => a.acted_by).filter(Boolean)));
      const actorMap = new Map<string, string>();
      if (actorIds.length > 0) {
        // tenta resolver emails; se falhar, mantém só UUID na UI
        await Promise.all(
          actorIds.map(async (actorId) => {
            try {
              const { data: au, error: e } = await admin.auth.admin.getUserById(actorId);
              if (e) throw e;
              const email = au?.user?.email ?? null;
              if (email) actorMap.set(actorId, email);
            } catch {
              // ignore
            }
          })
        );
      }

      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const makeCount = () =>
        admin
          .from('checkins')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user_id)
          .gte('created_at', since30d);

      const [{ count: total30d, error: c1 }, { count: appr30d, error: c2 }, { count: rej30d, error: c3 }] =
        await Promise.all([
          makeCount(),
          makeCount().eq('photo_review_status', 'approved'),
          makeCount().eq('photo_review_status', 'rejected')
        ]);
      if (c1) throw c1;
      if (c2) throw c2;
      if (c3) throw c3;

      const total = total30d ?? 0;
      const approved = appr30d ?? 0;
      const rejected = rej30d ?? 0;

      const { data: recent, error: rErr } = await admin
        .from('checkins')
        .select(
          'id, tenant_id, created_at, checkin_local_date, tipo_treino, points_awarded, foto_url, photo_review_status, photo_rejection_reason_code, photo_rejection_note'
        )
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (rErr) throw rErr;

      const { data: reasonsCatalog, error: rcErr } = await admin
        .from('photo_rejection_reasons')
        .select('code, label, is_active')
        .eq('is_active', true);
      if (rcErr) throw rcErr;
      const reasonLabelByCode = new Map((reasonsCatalog ?? []).map((r) => [r.code, r.label]));

      const recentWithLabels = (recent ?? []).map((c) => ({
        ...c,
        photo_rejection_reason_label: c.photo_rejection_reason_code
          ? reasonLabelByCode.get(c.photo_rejection_reason_code) ?? null
          : null
      }));

      const { data: topReasons, error: trErr } = await admin.rpc('admin_user_top_rejection_reasons', {
        p_user_id: user_id
      });

      const topWithLabels = (Array.isArray(topReasons) ? topReasons : []).map((r: any) => ({
        ...r,
        reason_label: r?.reason_code ? reasonLabelByCode.get(r.reason_code) ?? null : null
      }));
      // se a RPC não existir ainda, não falha a tela inteira
      if (trErr) {
        return jsonResponse(
          {
            profile: prof ? { ...prof, email: userEmail } : null,
            tenant: tenantRow ?? null,
            stats: {
              total_30d: total,
              approved_30d: approved,
              rejected_30d: rejected,
              approval_rate_30d: total > 0 ? approved / total : 0,
              rejection_rate_30d: total > 0 ? rejected / total : 0
            },
            recent_checkins: recentWithLabels,
            top_rejection_reasons: [],
          points_ledger: ledger ?? [],
            audit: (audit ?? []).map((a) => ({
              ...a,
              actor_email: a.acted_by ? actorMap.get(a.acted_by) ?? null : null
            }))
          },
          200
        );
      }

      return jsonResponse(
        {
          profile: prof ? { ...prof, email: userEmail } : null,
          tenant: tenantRow ?? null,
          stats: {
            total_30d: total,
            approved_30d: approved,
            rejected_30d: rejected,
            approval_rate_30d: total > 0 ? approved / total : 0,
            rejection_rate_30d: total > 0 ? rejected / total : 0
          },
          recent_checkins: recentWithLabels,
          top_rejection_reasons: topWithLabels,
          points_ledger: ledger ?? [],
          audit: (audit ?? []).map((a) => ({
            ...a,
            actor_email: a.acted_by ? actorMap.get(a.acted_by) ?? null : null
          }))
        },
        200
      );
    }

    /** US-ADM-15: autocomplete de admins (platform master) para filtro de auditoria — nome, e-mail ou UUID. */
    if (raw.mode === 'platform-masters') {
      const platformMastersSchema = z.object({
        mode: z.literal('platform-masters'),
        q: z.string().max(200).optional()
      });
      const pmParsed = platformMastersSchema.safeParse(raw);
      if (!pmParsed.success) {
        return jsonResponse({ error: 'Query inválida', details: pmParsed.error.flatten() }, 400);
      }
      const qq = (pmParsed.data.q ?? '').trim();

      let rows: Array<{ id: string; display_name: string | null; nome: string | null }> = [];

      if (qq && looksLikeEmailSearch(qq)) {
        const emailMap = await authAdminFilterUsersByEmailNeedle(supabaseUrl, serviceKey, qq);
        const ids = [...emailMap.keys()].slice(0, 100);
        if (ids.length === 0) {
          rows = [];
        } else {
          const { data, error: pmErr } = await admin
            .from('profiles')
            .select('id, display_name, nome')
            .in('id', ids)
            .eq('is_platform_master', true)
            .limit(50);
          if (pmErr) throw pmErr;
          rows = data ?? [];
        }
      } else {
        let q = admin
          .from('profiles')
          .select('id, display_name, nome')
          .eq('is_platform_master', true)
          .order('created_at', { ascending: false })
          .limit(50);
        if (qq) {
          const parts = [`display_name.ilike.%${qq}%`, `nome.ilike.%${qq}%`];
          if (looksUuid(qq)) parts.unshift(`id.eq.${qq}`);
          q = q.or(parts.join(','));
        }
        const { data, error: pmErr } = await q;
        if (pmErr) throw pmErr;
        rows = data ?? [];
      }

      const platform_masters = await Promise.all(
        (rows ?? []).map(async (r) => {
          let email: string | null = null;
          try {
            const { data: authUser, error: guErr } = await admin.auth.admin.getUserById(r.id);
            if (!guErr) email = authUser?.user?.email ?? null;
          } catch {
            email = null;
          }
          const name = (r.display_name ?? r.nome ?? '').trim() || 'Admin';
          return {
            id: r.id,
            display_name: r.display_name,
            nome: r.nome,
            email,
            label: email ? `${name} (${email})` : name
          };
        })
      );

      return jsonResponse({ platform_masters }, 200);
    }

    const parsed = listQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse({ error: 'Query inválida', details: parsed.error.flatten() }, 400);
    }

    const { q, tenant_id, limit, offset } = parsed.data;

    // Busca básica: por user_id exato (uuid) ou por nome/display_name, ou por tenant
    let query = admin
      .from('profiles')
      .select('id, tenant_id, display_name, nome, academia, pontos, streak, created_at, is_banned, photo_under_review')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (tenant_id) query = query.eq('tenant_id', tenant_id);

    const qq = (q ?? '').trim();
    if (qq) {
      // tenta filtrar por uuid (id) OU nome
      const parts = [`display_name.ilike.%${qq}%`, `nome.ilike.%${qq}%`];
      if (looksUuid(qq)) parts.unshift(`id.eq.${qq}`);
      query = query.or(parts.join(','));
    }

    const baseRes = await query;
    let data = baseRes.data;
    const error = baseRes.error;
    if (error) throw error;

    // Busca por email via Auth Admin (não depende de expor auth no PostgREST)
    let emailMap = new Map<string, string>();
    let missingAuthOnly: Array<{ id: string; email: string }> = [];
    if (qq && looksLikeEmailSearch(qq)) {
      emailMap = await authAdminFilterUsersByEmailNeedle(supabaseUrl, serviceKey, qq);

      if (emailMap.size > 0) {
        const ids = [...emailMap.keys()].slice(0, 100);
        let pq = admin
          .from('profiles')
          .select('id, tenant_id, display_name, nome, academia, pontos, streak, created_at, is_banned, photo_under_review')
          .in('id', ids)
          .order('created_at', { ascending: false })
          .limit(100);
        if (tenant_id) pq = pq.eq('tenant_id', tenant_id);
        const { data: profByEmail, error: peErr } = await pq;
        if (peErr) throw peErr;

        const base = Array.isArray(data) ? data : [];
        const merged = base.concat((profByEmail ?? []).filter((p) => !base.some((b) => b.id === p.id)));
        data = merged;

        const haveProfile = new Set((profByEmail ?? []).map((p) => p.id));
        missingAuthOnly = ids
          .filter((id) => !haveProfile.has(id))
          .map((id) => ({ id, email: emailMap.get(id)! }));
      }
    }

    // anexa tenant slug/name (leve)
    const tenantIds = Array.from(new Set((data ?? []).map((r) => r.tenant_id).filter(Boolean)));
    const { data: tenants, error: tenErr } =
      tenantIds.length > 0
        ? await admin.from('tenants').select('id, slug, name, status').in('id', tenantIds)
        : { data: [], error: null };
    if (tenErr) throw tenErr;
    const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

    const usersFromProfiles = (data ?? []).map((p) => ({
      id: p.id,
      tenant_id: p.tenant_id,
      tenant: tenantMap.get(p.tenant_id) ?? null,
      display_name: p.display_name,
      nome: p.nome,
      email: emailMap.get(p.id) ?? null,
      academia: p.academia,
      pontos: p.pontos,
      streak: p.streak,
      is_banned: p.is_banned ?? false,
      photo_under_review: p.photo_under_review ?? false,
      created_at: p.created_at,
      has_profile: true
    }));

    const usersAuthOnly = missingAuthOnly.map((u) => ({
      id: u.id,
      tenant_id: null,
      tenant: null,
      display_name: null,
      nome: null,
      email: u.email,
      academia: null,
      pontos: null,
      streak: null,
      is_banned: false,
      photo_under_review: false,
      created_at: null,
      has_profile: false
    }));

    return jsonResponse({ users: usersFromProfiles.concat(usersAuthOnly), limit, offset }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('admin-users:', message);
    return jsonResponse({ error: message }, 500);
  }
});

