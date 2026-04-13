import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@17?target=deno';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function toTimestamp(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('stripe-webhook: variáveis de ambiente ausentes');
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' });

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'Assinatura Stripe ausente' }, 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na verificação';
    console.error('stripe-webhook: assinatura inválida', message);
    return jsonResponse({ error: `Webhook Error: ${message}` }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session, stripe);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.paused':
        await handleSubscriptionPaused(admin, event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.resumed':
        await handleSubscriptionResumed(admin, event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePayment(admin, event.data.object as Stripe.Invoice, 'succeeded');
        break;

      case 'invoice.payment_failed':
        await handleInvoicePayment(admin, event.data.object as Stripe.Invoice, 'failed');
        break;

      default:
        console.log(`stripe-webhook: evento não tratado: ${event.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error(`stripe-webhook: erro ao processar ${event.type}:`, message);
    return jsonResponse({ error: message }, 500);
  }

  return jsonResponse({ received: true }, 200);
});

// ============================================================
// Handlers
// ============================================================

async function handleCheckoutCompleted(
  admin: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  stripe: Stripe
) {
  if (session.mode !== 'subscription') return;

  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;
  const stripeSubscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;

  if (!stripeCustomerId || !stripeSubscriptionId) {
    console.error('stripe-webhook: checkout sem customer ou subscription');
    return;
  }

  const userId = session.metadata?.user_id ?? session.client_reference_id;
  if (!userId) {
    console.error('stripe-webhook: checkout sem user_id nos metadados');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const stripePriceId = subscription.items.data[0]?.price?.id ?? null;

  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    console.error('stripe-webhook: perfil não encontrado para user_id', userId);
    return;
  }

  let planId: string | null = null;
  if (stripePriceId) {
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('stripe_price_id', stripePriceId)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  const { error: subError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        tenant_id: profile.tenant_id,
        plan_id: planId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId,
        status: subscription.status,
        current_period_start: toTimestamp(subscription.current_period_start),
        current_period_end: toTimestamp(subscription.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end
      },
      { onConflict: 'stripe_subscription_id' }
    );

  if (subError) {
    console.error('stripe-webhook: erro ao upsert subscription', subError.message);
    throw subError;
  }

  await updateProfileStripeFields(admin, userId, stripeCustomerId, stripeSubscriptionId, true);
}

async function handleSubscriptionUpdated(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const stripeSubId = subscription.id;
  const isPro = ['active', 'trialing'].includes(subscription.status);
  const stripePriceId = subscription.items.data[0]?.price?.id ?? null;

  let planId: string | null = null;
  if (stripePriceId) {
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('stripe_price_id', stripePriceId)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: subscription.status,
      plan_id: planId,
      current_period_start: toTimestamp(subscription.current_period_start),
      current_period_end: toTimestamp(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? toTimestamp(subscription.canceled_at) : null
    })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('stripe-webhook: erro ao atualizar subscription', error.message);
    throw error;
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, stripe_customer_id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (sub?.user_id) {
    await updateProfileStripeFields(
      admin,
      sub.user_id,
      sub.stripe_customer_id,
      stripeSubId,
      isPro
    );
  }
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const stripeSubId = subscription.id;

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: toTimestamp(subscription.canceled_at ?? Math.floor(Date.now() / 1000))
    })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('stripe-webhook: erro ao marcar subscription cancelada', error.message);
    throw error;
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, stripe_customer_id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (sub?.user_id) {
    await updateProfileStripeFields(admin, sub.user_id, sub.stripe_customer_id, stripeSubId, false);
  }
}

async function handleSubscriptionPaused(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const stripeSubId = subscription.id;

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'paused' })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('stripe-webhook: erro ao pausar subscription', error.message);
    throw error;
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, stripe_customer_id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (sub?.user_id) {
    await updateProfileStripeFields(admin, sub.user_id, sub.stripe_customer_id, stripeSubId, false);
  }
}

async function handleSubscriptionResumed(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const stripeSubId = subscription.id;

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: toTimestamp(subscription.current_period_start),
      current_period_end: toTimestamp(subscription.current_period_end)
    })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('stripe-webhook: erro ao resumir subscription', error.message);
    throw error;
  }

  const isPro = ['active', 'trialing'].includes(subscription.status);

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, stripe_customer_id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (sub?.user_id) {
    await updateProfileStripeFields(admin, sub.user_id, sub.stripe_customer_id, stripeSubId, isPro);
  }
}

async function handleInvoicePayment(
  admin: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice,
  outcome: 'succeeded' | 'failed'
) {
  const stripeCustomerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id ?? null;

  if (!stripeCustomerId) return;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, tenant_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .limit(1)
    .maybeSingle();

  if (!sub) {
    console.log('stripe-webhook: invoice sem subscription local para customer', stripeCustomerId);
    return;
  }

  const idExterno = invoice.id;

  const { data: existing } = await admin
    .from('pagamentos')
    .select('id')
    .eq('id_externo', idExterno)
    .maybeSingle();

  if (existing) {
    console.log('stripe-webhook: pagamento já registrado (idempotente)', idExterno);
    return;
  }

  const { error } = await admin.from('pagamentos').insert({
    user_id: sub.user_id,
    tenant_id: sub.tenant_id,
    tipo: 'subscription',
    valor: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
    status: outcome === 'succeeded' ? 'paid' : 'failed',
    id_externo: idExterno,
    metadata: {
      stripe_invoice_id: invoice.id,
      stripe_subscription_id:
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id ?? null,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      period_start: invoice.period_start,
      period_end: invoice.period_end
    }
  });

  if (error) {
    console.error('stripe-webhook: erro ao inserir pagamento', error.message);
    throw error;
  }
}

// ============================================================
// Helpers
// ============================================================

async function updateProfileStripeFields(
  admin: ReturnType<typeof createClient>,
  userId: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string,
  isPro: boolean
) {
  const { error } = await admin.rpc('internal_update_profile_stripe', {
    p_user_id: userId,
    p_is_pro: isPro,
    p_stripe_customer_id: stripeCustomerId,
    p_stripe_subscription_id: stripeSubscriptionId
  });

  if (error) {
    console.error('stripe-webhook: erro ao atualizar perfil via RPC', error.message);
    throw error;
  }
}
