import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';
import { createCaktoClient, CaktoClient } from '../_shared/cakto-client.ts';

// ============================================================
// Schemas
// ============================================================

const createPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price_amount: z.number().int().min(100),
  currency: z.string().length(3).default('brl'),
  interval: z.enum(['month', 'year']),
  interval_count: z.number().int().min(1).max(12).default(1),
  features: z.array(z.string()).default([]),
  limits: z.record(z.unknown()).default({}),
  sort_order: z.number().int().default(0),
  metadata: z.record(z.unknown()).default({}),
  cakto_product_id: z.string().min(1, 'cakto_product_id obrigatório')
});

const updatePlanSchema = z.object({
  plan_id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  features: z.array(z.string()).optional(),
  limits: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
  price_amount: z.number().int().min(100).optional(),
  currency: z.string().length(3).optional(),
  interval: z.enum(['month', 'year']).optional(),
  interval_count: z.number().int().min(1).max(12).optional()
});

const listSubscriptionsSchema = z.object({
  status: z.string().optional(),
  tenant_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const subscriptionActionSchema = z.object({
  subscription_id: z.string().uuid()
});

const cancelSubscriptionSchema = z.object({
  subscription_id: z.string().uuid(),
  immediate: z.boolean().default(false)
});

// ============================================================
// Helpers
// ============================================================

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

type AdminClient = ReturnType<typeof createClient>;

async function insertPlatformAudit(
  admin: AdminClient,
  row: {
    actor_id: string;
    action: string;
    target_type: 'plan' | 'subscription' | 'none';
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

function mapInterval(interval: string, intervalCount: number): { intervalType: 'month' | 'year'; interval: number } {
  if (interval === 'year') {
    return { intervalType: 'year', interval: intervalCount };
  }
  return { intervalType: 'month', interval: intervalCount };
}

// ============================================================
// Main handler
// ============================================================

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

  const { data: profile } = await userClient
    .from('profiles')
    .select('is_platform_master')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_platform_master) {
    return jsonResponse({ error: 'Acesso negado' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let cakto: CaktoClient;
  try {
    cakto = createCaktoClient();
  } catch (e) {
    console.error('admin-billing: Cakto não configurado', e);
    return jsonResponse({ error: 'Provedor de pagamento não configurado' }, 500);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // ========== PLANOS ==========

    if (action === 'list-plans' && req.method === 'GET') {
      return await listPlans(admin);
    }

    if (action === 'create-plan' && req.method === 'POST') {
      return await createPlan(admin, cakto, req, user.id);
    }

    if (action === 'update-plan' && req.method === 'PATCH') {
      return await updatePlan(admin, cakto, req, user.id);
    }

    if (action === 'archive-plan' && req.method === 'DELETE') {
      return await archivePlan(admin, cakto, req, user.id);
    }

    // ========== ASSINATURAS ==========

    if (action === 'list-subscriptions' && req.method === 'GET') {
      return await listSubscriptions(admin, url);
    }

    if (action === 'cancel-subscription' && req.method === 'POST') {
      return await cancelSubscription(admin, req, user.id);
    }

    if (action === 'refund-subscription' && req.method === 'POST') {
      return await refundSubscription(admin, cakto, req, user.id);
    }

    // ========== MÉTRICAS ==========

    if (action === 'metrics' && req.method === 'GET') {
      return await getMetrics(admin);
    }

    return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error(`admin-billing [${action}]:`, message);
    return jsonResponse({ error: message }, 500);
  }
});

// ============================================================
// Planos
// ============================================================

async function listPlans(admin: AdminClient) {
  const { data, error } = await admin.rpc('admin_list_subscription_plans');
  if (error) throw error;
  return jsonResponse({ plans: data ?? [] }, 200);
}

async function createPlan(
  admin: AdminClient,
  cakto: CaktoClient,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const { intervalType, interval } = mapInterval(input.interval, input.interval_count);

  const offer = await cakto.createOffer({
    name: input.name,
    price: CaktoClient.centsToReais(input.price_amount),
    product: input.cakto_product_id,
    type: 'subscription',
    status: 'active',
    intervalType,
    interval
  });

  const checkoutUrl = CaktoClient.checkoutUrl(offer.id);

  const { data: plan, error } = await admin
    .from('subscription_plans')
    .insert({
      cakto_product_id: input.cakto_product_id,
      cakto_offer_id: offer.id,
      cakto_checkout_url: checkoutUrl,
      name: input.name,
      description: input.description ?? null,
      price_amount: input.price_amount,
      currency: input.currency,
      interval: input.interval,
      interval_count: input.interval_count,
      features: input.features,
      limits: input.limits,
      sort_order: input.sort_order,
      metadata: input.metadata
    })
    .select('*')
    .single();

  if (error) throw error;

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.plan_created',
    target_type: 'plan',
    target_id: plan.id,
    tenant_id: null,
    payload: { name: input.name, price_amount: input.price_amount, cakto_offer_id: offer.id }
  });

  return jsonResponse({ plan }, 201);
}

async function updatePlan(
  admin: AdminClient,
  cakto: CaktoClient,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const { plan_id, price_amount, currency, interval, interval_count, ...fields } = parsed.data;

  const { data: existing, error: fetchErr } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('id', plan_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) return jsonResponse({ error: 'Plano não encontrado' }, 404);

  const dbUpdate: Record<string, unknown> = {};
  if (fields.name !== undefined) dbUpdate.name = fields.name;
  if (fields.description !== undefined) dbUpdate.description = fields.description;
  if (fields.features !== undefined) dbUpdate.features = fields.features;
  if (fields.limits !== undefined) dbUpdate.limits = fields.limits;
  if (fields.is_active !== undefined) dbUpdate.is_active = fields.is_active;
  if (fields.sort_order !== undefined) dbUpdate.sort_order = fields.sort_order;
  if (fields.metadata !== undefined) dbUpdate.metadata = fields.metadata;

  const needsNewOffer = price_amount !== undefined || interval !== undefined || interval_count !== undefined;

  if (needsNewOffer && existing.cakto_offer_id) {
    await cakto.disableOffer(existing.cakto_offer_id);

    const { intervalType: iType, interval: iVal } = mapInterval(
      interval ?? existing.interval,
      interval_count ?? existing.interval_count
    );

    const newOffer = await cakto.createOffer({
      name: fields.name ?? existing.name,
      price: CaktoClient.centsToReais(price_amount ?? existing.price_amount),
      product: existing.cakto_product_id,
      type: 'subscription',
      status: 'active',
      intervalType: iType,
      interval: iVal
    });

    dbUpdate.cakto_offer_id = newOffer.id;
    dbUpdate.cakto_checkout_url = CaktoClient.checkoutUrl(newOffer.id);
    dbUpdate.price_amount = price_amount ?? existing.price_amount;
    dbUpdate.currency = currency ?? existing.currency;
    dbUpdate.interval = interval ?? existing.interval;
    dbUpdate.interval_count = interval_count ?? existing.interval_count;
  } else if (existing.cakto_offer_id) {
    const offerUpdate: Record<string, unknown> = {};
    if (fields.name !== undefined) offerUpdate.name = fields.name;
    if (fields.is_active === false) offerUpdate.status = 'disabled';
    else if (fields.is_active === true) offerUpdate.status = 'active';

    if (Object.keys(offerUpdate).length > 0) {
      await cakto.updateOffer(existing.cakto_offer_id, offerUpdate as Parameters<typeof cakto.updateOffer>[1]);
    }
  }

  if (Object.keys(dbUpdate).length === 0) {
    return jsonResponse({ plan: existing }, 200);
  }

  const { data: updated, error: updateErr } = await admin
    .from('subscription_plans')
    .update(dbUpdate)
    .eq('id', plan_id)
    .select('*')
    .single();

  if (updateErr) throw updateErr;

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.plan_updated',
    target_type: 'plan',
    target_id: plan_id,
    tenant_id: null,
    payload: { changes: Object.keys(dbUpdate), new_offer: needsNewOffer }
  });

  return jsonResponse({ plan: updated }, 200);
}

async function archivePlan(
  admin: AdminClient,
  cakto: CaktoClient,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = z.object({ plan_id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const { plan_id } = parsed.data;

  const { data: existing, error: fetchErr } = await admin
    .from('subscription_plans')
    .select('id, cakto_product_id, cakto_offer_id, name')
    .eq('id', plan_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) return jsonResponse({ error: 'Plano não encontrado' }, 404);

  if (existing.cakto_offer_id) {
    try {
      await cakto.disableOffer(existing.cakto_offer_id);
    } catch (e) {
      console.error('admin-billing: falha ao desabilitar oferta Cakto', e);
    }
  }

  const { error: updateErr } = await admin
    .from('subscription_plans')
    .update({ is_active: false })
    .eq('id', plan_id);

  if (updateErr) throw updateErr;

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.plan_archived',
    target_type: 'plan',
    target_id: plan_id,
    tenant_id: null,
    payload: { name: existing.name }
  });

  return jsonResponse({ success: true }, 200);
}

// ============================================================
// Assinaturas
// ============================================================

async function listSubscriptions(admin: AdminClient, url: URL) {
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = listSubscriptionsSchema.safeParse(params);
  if (!parsed.success) {
    return jsonResponse({ error: 'Parâmetros inválidos', details: parsed.error.flatten() }, 400);
  }
  const { status, tenant_id, limit, offset } = parsed.data;

  const { data, error } = await admin.rpc('admin_list_subscriptions', {
    p_status: status ?? null,
    p_tenant_id: tenant_id ?? null,
    p_limit: limit,
    p_offset: offset
  });

  if (error) throw error;
  return jsonResponse({ subscriptions: data ?? [] }, 200);
}

async function cancelSubscription(
  admin: AdminClient,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = cancelSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const { subscription_id, immediate } = parsed.data;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('cakto_order_id, user_id, tenant_id')
    .eq('id', subscription_id)
    .maybeSingle();

  if (!sub) {
    return jsonResponse({ error: 'Assinatura não encontrada' }, 404);
  }

  if (immediate) {
    await admin
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString()
      })
      .eq('id', subscription_id);

    if (sub.user_id) {
      await admin.rpc('internal_update_profile_cakto', {
        p_user_id: sub.user_id,
        p_is_pro: false,
        p_cakto_customer_email: null,
        p_cakto_order_id: sub.cakto_order_id
      });
    }
  } else {
    await admin
      .from('subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', subscription_id);
  }

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: immediate ? 'billing.subscription_canceled_immediate' : 'billing.subscription_canceled_end_of_period',
    target_type: 'subscription',
    target_id: subscription_id,
    tenant_id: sub.tenant_id,
    payload: { user_id: sub.user_id, cakto_order_id: sub.cakto_order_id }
  });

  return jsonResponse({ success: true, immediate }, 200);
}

async function refundSubscription(
  admin: AdminClient,
  cakto: CaktoClient,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = subscriptionActionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const { subscription_id } = parsed.data;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('cakto_order_id, user_id, tenant_id')
    .eq('id', subscription_id)
    .maybeSingle();

  if (!sub?.cakto_order_id) {
    return jsonResponse({ error: 'Assinatura não encontrada ou sem ID Cakto' }, 404);
  }

  const result = await cakto.refundOrder(sub.cakto_order_id);

  await admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString()
    })
    .eq('id', subscription_id);

  if (sub.user_id) {
    await admin.rpc('internal_update_profile_cakto', {
      p_user_id: sub.user_id,
      p_is_pro: false,
      p_cakto_customer_email: null,
      p_cakto_order_id: sub.cakto_order_id
    });
  }

  await admin
    .from('pagamentos')
    .update({ status: 'refunded' })
    .eq('id_externo', sub.cakto_order_id);

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.subscription_refunded',
    target_type: 'subscription',
    target_id: subscription_id,
    tenant_id: sub.tenant_id,
    payload: { user_id: sub.user_id, cakto_order_id: sub.cakto_order_id, cakto_result: result }
  });

  return jsonResponse({ success: true, detail: result.detail }, 200);
}

// ============================================================
// Métricas
// ============================================================

async function getMetrics(admin: AdminClient) {
  const { data, error } = await admin.rpc('admin_billing_metrics');
  if (error) throw error;
  return jsonResponse({ metrics: data }, 200);
}
