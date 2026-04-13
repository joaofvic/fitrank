import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { z } from 'npm:zod@3.24.2';

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
  metadata: z.record(z.unknown()).default({})
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

const changeSubscriptionPlanSchema = z.object({
  subscription_id: z.string().uuid(),
  new_price_id: z.string().min(1)
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

async function insertPlatformAudit(
  admin: ReturnType<typeof createClient>,
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

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!stripeSecretKey || !supabaseUrl || !anonKey || !serviceKey) {
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

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // ========== PLANOS ==========

    if (action === 'list-plans' && req.method === 'GET') {
      return await listPlans(admin);
    }

    if (action === 'create-plan' && req.method === 'POST') {
      return await createPlan(admin, stripe, req, user.id);
    }

    if (action === 'update-plan' && req.method === 'PATCH') {
      return await updatePlan(admin, stripe, req, user.id);
    }

    if (action === 'archive-plan' && req.method === 'DELETE') {
      return await archivePlan(admin, stripe, req, user.id);
    }

    // ========== ASSINATURAS ==========

    if (action === 'list-subscriptions' && req.method === 'GET') {
      return await listSubscriptions(admin, url);
    }

    if (action === 'cancel-subscription' && req.method === 'POST') {
      return await cancelSubscription(admin, stripe, req, user.id);
    }

    if (action === 'pause-subscription' && req.method === 'POST') {
      return await pauseSubscription(admin, stripe, req, user.id);
    }

    if (action === 'resume-subscription' && req.method === 'POST') {
      return await resumeSubscription(admin, stripe, req, user.id);
    }

    if (action === 'change-plan' && req.method === 'PATCH') {
      return await changeSubscriptionPlan(admin, stripe, req, user.id);
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

async function listPlans(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('admin_list_subscription_plans');
  if (error) throw error;
  return jsonResponse({ plans: data ?? [] }, 200);
}

async function createPlan(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const product = await stripe.products.create({
    name: input.name,
    description: input.description || undefined,
    metadata: { source: 'fitrank_admin' }
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: input.price_amount,
    currency: input.currency,
    recurring: {
      interval: input.interval,
      interval_count: input.interval_count
    },
    metadata: { source: 'fitrank_admin' }
  });

  const { data: plan, error } = await admin
    .from('subscription_plans')
    .insert({
      stripe_product_id: product.id,
      stripe_price_id: price.id,
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
    payload: { name: input.name, price_amount: input.price_amount, stripe_product_id: product.id }
  });

  return jsonResponse({ plan }, 201);
}

async function updatePlan(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
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

  if (fields.name !== undefined || fields.metadata !== undefined) {
    const productUpdate: Record<string, unknown> = {};
    if (fields.name !== undefined) productUpdate.name = fields.name;
    if (fields.metadata !== undefined) productUpdate.metadata = fields.metadata;
    await stripe.products.update(existing.stripe_product_id, productUpdate);
  }

  const dbUpdate: Record<string, unknown> = {};
  if (fields.name !== undefined) dbUpdate.name = fields.name;
  if (fields.description !== undefined) dbUpdate.description = fields.description;
  if (fields.features !== undefined) dbUpdate.features = fields.features;
  if (fields.limits !== undefined) dbUpdate.limits = fields.limits;
  if (fields.is_active !== undefined) dbUpdate.is_active = fields.is_active;
  if (fields.sort_order !== undefined) dbUpdate.sort_order = fields.sort_order;
  if (fields.metadata !== undefined) dbUpdate.metadata = fields.metadata;

  const needsNewPrice = price_amount !== undefined || currency !== undefined ||
    interval !== undefined || interval_count !== undefined;

  if (needsNewPrice) {
    await stripe.prices.update(existing.stripe_price_id, { active: false });

    const newPrice = await stripe.prices.create({
      product: existing.stripe_product_id,
      unit_amount: price_amount ?? existing.price_amount,
      currency: currency ?? existing.currency,
      recurring: {
        interval: interval ?? existing.interval,
        interval_count: interval_count ?? existing.interval_count
      },
      metadata: { source: 'fitrank_admin' }
    });

    dbUpdate.stripe_price_id = newPrice.id;
    dbUpdate.price_amount = price_amount ?? existing.price_amount;
    dbUpdate.currency = currency ?? existing.currency;
    dbUpdate.interval = interval ?? existing.interval;
    dbUpdate.interval_count = interval_count ?? existing.interval_count;
  }

  if (fields.is_active === false) {
    await stripe.products.update(existing.stripe_product_id, { active: false });
  } else if (fields.is_active === true) {
    await stripe.products.update(existing.stripe_product_id, { active: true });
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
    payload: { changes: Object.keys(dbUpdate), new_price: needsNewPrice }
  });

  return jsonResponse({ plan: updated }, 200);
}

async function archivePlan(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
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
    .select('id, stripe_product_id, stripe_price_id, name')
    .eq('id', plan_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) return jsonResponse({ error: 'Plano não encontrado' }, 404);

  await stripe.prices.update(existing.stripe_price_id, { active: false });
  await stripe.products.update(existing.stripe_product_id, { active: false });

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

async function listSubscriptions(admin: ReturnType<typeof createClient>, url: URL) {
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
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
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
    .select('stripe_subscription_id, user_id, tenant_id')
    .eq('id', subscription_id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return jsonResponse({ error: 'Assinatura não encontrada' }, 404);
  }

  if (immediate) {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id);
  } else {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true
    });

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
    payload: { user_id: sub.user_id, stripe_subscription_id: sub.stripe_subscription_id }
  });

  return jsonResponse({ success: true, immediate }, 200);
}

async function pauseSubscription(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
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
    .select('stripe_subscription_id, user_id, tenant_id, status')
    .eq('id', subscription_id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return jsonResponse({ error: 'Assinatura não encontrada' }, 404);
  }

  if (sub.status !== 'active' && sub.status !== 'trialing') {
    return jsonResponse({ error: 'Apenas assinaturas ativas podem ser pausadas' }, 400);
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    pause_collection: { behavior: 'void' }
  });

  await admin
    .from('subscriptions')
    .update({ status: 'paused' })
    .eq('id', subscription_id);

  if (sub.user_id) {
    await admin.rpc('internal_update_profile_stripe', {
      p_user_id: sub.user_id,
      p_is_pro: false
    });
  }

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.subscription_paused',
    target_type: 'subscription',
    target_id: subscription_id,
    tenant_id: sub.tenant_id,
    payload: { user_id: sub.user_id }
  });

  return jsonResponse({ success: true }, 200);
}

async function resumeSubscription(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
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
    .select('stripe_subscription_id, user_id, tenant_id, status')
    .eq('id', subscription_id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return jsonResponse({ error: 'Assinatura não encontrada' }, 404);
  }

  if (sub.status !== 'paused') {
    return jsonResponse({ error: 'Apenas assinaturas pausadas podem ser resumidas' }, 400);
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    pause_collection: null
  });

  await admin
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('id', subscription_id);

  if (sub.user_id) {
    await admin.rpc('internal_update_profile_stripe', {
      p_user_id: sub.user_id,
      p_is_pro: true
    });
  }

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.subscription_resumed',
    target_type: 'subscription',
    target_id: subscription_id,
    tenant_id: sub.tenant_id,
    payload: { user_id: sub.user_id }
  });

  return jsonResponse({ success: true }, 200);
}

async function changeSubscriptionPlan(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  req: Request,
  actorId: string
) {
  const body = await req.json();
  const parsed = changeSubscriptionPlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }
  const { subscription_id, new_price_id } = parsed.data;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, user_id, tenant_id, plan_id')
    .eq('id', subscription_id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return jsonResponse({ error: 'Assinatura não encontrada' }, 404);
  }

  const { data: newPlan } = await admin
    .from('subscription_plans')
    .select('id, name, stripe_price_id')
    .eq('stripe_price_id', new_price_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!newPlan) {
    return jsonResponse({ error: 'Plano destino não encontrado ou inativo' }, 404);
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const currentItemId = stripeSub.items.data[0]?.id;

  if (!currentItemId) {
    return jsonResponse({ error: 'Assinatura Stripe sem items' }, 500);
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [{ id: currentItemId, price: new_price_id }],
    proration_behavior: 'create_prorations'
  });

  await admin
    .from('subscriptions')
    .update({ plan_id: newPlan.id })
    .eq('id', subscription_id);

  await insertPlatformAudit(admin, {
    actor_id: actorId,
    action: 'billing.subscription_plan_changed',
    target_type: 'subscription',
    target_id: subscription_id,
    tenant_id: sub.tenant_id,
    payload: {
      user_id: sub.user_id,
      old_plan_id: sub.plan_id,
      new_plan_id: newPlan.id,
      new_plan_name: newPlan.name
    }
  });

  return jsonResponse({ success: true, new_plan: newPlan.name }, 200);
}

// ============================================================
// Métricas
// ============================================================

async function getMetrics(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('admin_billing_metrics');
  if (error) throw error;
  return jsonResponse({ metrics: data }, 200);
}
