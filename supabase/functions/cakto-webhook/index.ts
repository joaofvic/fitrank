import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const webhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('cakto-webhook: variáveis de ambiente ausentes');
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }

  let payload: CaktoWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  if (payload?.secret !== webhookSecret) {
    console.error('cakto-webhook: secret inválido');
    return jsonResponse({ error: 'Secret inválido' }, 401);
  }

  const event = payload.event;
  const data = payload.data;

  if (!event || !data) {
    return jsonResponse({ error: 'Payload incompleto' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    switch (event) {
      case 'purchase_approved':
        await handlePurchaseApproved(admin, data);
        break;

      case 'subscription_created':
        await handleSubscriptionCreated(admin, data);
        break;

      case 'subscription_canceled':
        await handleSubscriptionCanceled(admin, data);
        break;

      case 'subscription_renewed':
        await handleSubscriptionRenewed(admin, data);
        break;

      case 'subscription_renewal_refused':
        await handleRenewalRefused(admin, data);
        break;

      case 'refund':
        await handleRefund(admin, data);
        break;

      case 'chargeback':
        await handleChargeback(admin, data);
        break;

      default:
        console.log(`cakto-webhook: evento não tratado: ${event}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error(`cakto-webhook: erro ao processar ${event}:`, message);
    return jsonResponse({ error: message }, 500);
  }

  return jsonResponse({ received: true }, 200);
});

// ============================================================
// Types
// ============================================================

interface CaktoWebhookPayload {
  event: string;
  secret: string;
  data: CaktoWebhookData;
}

interface CaktoWebhookData {
  id: string;
  refId?: string;
  status: string;
  amount: number;
  paidAt?: string | null;
  createdAt?: string;
  canceledAt?: string | null;
  refundedAt?: string | null;
  chargedbackAt?: string | null;
  paymentMethod?: string;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    docType?: string | null;
    docNumber?: string | null;
  };
  product?: {
    id: string;
    name: string;
    type: string;
  };
  offer?: {
    id: string;
    name: string;
    price: number;
  };
  checkoutUrl?: string;
  sck?: string | null;
  subscription?: unknown;
  subscription_period?: unknown;
  [key: string]: unknown;
}

type AdminClient = ReturnType<typeof createClient>;

// ============================================================
// Helpers
// ============================================================

function parseSck(sck: string | null | undefined): { userId: string | null; desafioId: string | null } {
  if (!sck) return { userId: null, desafioId: null };
  const parts = sck.split(':');
  return {
    userId: parts[0] || null,
    desafioId: parts[1] || null
  };
}

async function resolveUserId(admin: AdminClient, sck: string | null | undefined, customerEmail: string | null | undefined): Promise<string | null> {
  const { userId } = parseSck(sck);
  if (userId) return userId;

  if (!customerEmail) return null;

  const { data } = await admin
    .from('profiles')
    .select('id')
    .ilike('cakto_customer_email', customerEmail)
    .limit(1)
    .maybeSingle();

  if (data?.id) return data.id;

  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1 });
  const match = authUsers?.users?.find(u => u.email?.toLowerCase() === customerEmail.toLowerCase());
  return match?.id ?? null;
}

async function updateProfileCakto(admin: AdminClient, userId: string, email: string | null, orderId: string | null, isPro: boolean) {
  const { error } = await admin.rpc('internal_update_profile_cakto', {
    p_user_id: userId,
    p_is_pro: isPro,
    p_cakto_customer_email: email,
    p_cakto_order_id: orderId
  });
  if (error) {
    console.error('cakto-webhook: erro ao atualizar perfil via RPC', error.message);
    throw error;
  }
}

// ============================================================
// Handlers
// ============================================================

async function handlePurchaseApproved(admin: AdminClient, data: CaktoWebhookData) {
  const { userId, desafioId } = parseSck(data.sck);
  const email = data.customer?.email ?? null;
  const resolvedUserId = userId || await resolveUserId(admin, data.sck, email);

  if (!resolvedUserId) {
    console.error('cakto-webhook: purchase_approved sem user identificado', { sck: data.sck, email });
    return;
  }

  if (desafioId) {
    await handleChallengePayment(admin, resolvedUserId, desafioId, data);
    return;
  }

  if (data.product?.type === 'subscription') {
    await handleSubscriptionCreated(admin, data);
    return;
  }

  await recordPayment(admin, resolvedUserId, data, 'subscription', 'paid');
  console.log(`cakto-webhook: purchase_approved processado para user ${resolvedUserId}, order ${data.id}`);
}

async function handleSubscriptionCreated(admin: AdminClient, data: CaktoWebhookData) {
  const email = data.customer?.email ?? null;
  const resolvedUserId = await resolveUserId(admin, data.sck, email);

  if (!resolvedUserId) {
    console.error('cakto-webhook: subscription_created sem user identificado', { sck: data.sck, email });
    return;
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', resolvedUserId)
    .maybeSingle();

  if (!profile) {
    console.error('cakto-webhook: perfil não encontrado', resolvedUserId);
    return;
  }

  const caktoOfferId = data.offer?.id ?? null;
  let planId: string | null = null;
  if (caktoOfferId) {
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('cakto_offer_id', caktoOfferId)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  const { error: subError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: resolvedUserId,
        tenant_id: profile.tenant_id,
        plan_id: planId,
        cakto_order_id: data.id,
        cakto_customer_email: email,
        status: 'active',
        current_period_start: data.paidAt ?? new Date().toISOString(),
        current_period_end: null,
        cancel_at_period_end: false
      },
      { onConflict: 'cakto_order_id' }
    );

  if (subError) {
    console.error('cakto-webhook: erro ao upsert subscription', subError.message);
    throw subError;
  }

  await updateProfileCakto(admin, resolvedUserId, email, data.id, true);
  await recordPayment(admin, resolvedUserId, data, 'subscription', 'paid');

  console.log(`cakto-webhook: subscription_created para user ${resolvedUserId}, order ${data.id}`);
}

async function handleSubscriptionCanceled(admin: AdminClient, data: CaktoWebhookData) {
  const orderId = data.id;

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: data.canceledAt ?? new Date().toISOString()
    })
    .eq('cakto_order_id', orderId);

  if (error) {
    console.error('cakto-webhook: erro ao cancelar subscription', error.message);
    throw error;
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, cakto_customer_email')
    .eq('cakto_order_id', orderId)
    .maybeSingle();

  if (sub?.user_id) {
    await updateProfileCakto(admin, sub.user_id, sub.cakto_customer_email, orderId, false);
  }

  console.log(`cakto-webhook: subscription_canceled, order ${orderId}`);
}

async function handleSubscriptionRenewed(admin: AdminClient, data: CaktoWebhookData) {
  const orderId = data.id;

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: data.paidAt ?? new Date().toISOString(),
      cancel_at_period_end: false
    })
    .eq('cakto_order_id', orderId);

  if (error) {
    console.error('cakto-webhook: erro ao renovar subscription', error.message);
    throw error;
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, cakto_customer_email')
    .eq('cakto_order_id', orderId)
    .maybeSingle();

  if (sub?.user_id) {
    await updateProfileCakto(admin, sub.user_id, sub.cakto_customer_email, orderId, true);
    await recordPayment(admin, sub.user_id, data, 'subscription', 'paid');
  }

  console.log(`cakto-webhook: subscription_renewed, order ${orderId}`);
}

async function handleRenewalRefused(admin: AdminClient, data: CaktoWebhookData) {
  const orderId = data.id;

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('cakto_order_id', orderId);

  if (error) {
    console.error('cakto-webhook: erro ao marcar past_due', error.message);
    throw error;
  }

  console.log(`cakto-webhook: subscription_renewal_refused, order ${orderId}`);
}

async function handleRefund(admin: AdminClient, data: CaktoWebhookData) {
  const orderId = data.id;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, user_id, cakto_customer_email')
    .eq('cakto_order_id', orderId)
    .maybeSingle();

  if (sub) {
    await admin
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: data.refundedAt ?? new Date().toISOString()
      })
      .eq('id', sub.id);

    if (sub.user_id) {
      await updateProfileCakto(admin, sub.user_id, sub.cakto_customer_email, orderId, false);
    }
  }

  await admin
    .from('pagamentos')
    .update({ status: 'refunded' })
    .eq('id_externo', orderId);

  console.log(`cakto-webhook: refund processado, order ${orderId}`);
}

async function handleChargeback(admin: AdminClient, data: CaktoWebhookData) {
  const orderId = data.id;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, user_id, cakto_customer_email')
    .eq('cakto_order_id', orderId)
    .maybeSingle();

  if (sub) {
    await admin
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: data.chargedbackAt ?? new Date().toISOString()
      })
      .eq('id', sub.id);

    if (sub.user_id) {
      await updateProfileCakto(admin, sub.user_id, sub.cakto_customer_email, orderId, false);
    }
  }

  await admin
    .from('pagamentos')
    .update({ status: 'chargeback' })
    .eq('id_externo', orderId);

  console.log(`cakto-webhook: chargeback processado, order ${orderId}`);
}

// ============================================================
// Challenge entry payment
// ============================================================

async function handleChallengePayment(admin: AdminClient, userId: string, desafioId: string, data: CaktoWebhookData) {
  const { data: desafio } = await admin
    .from('desafios')
    .select('id, tenant_id, entry_fee')
    .eq('id', desafioId)
    .maybeSingle();

  if (!desafio) {
    console.error('cakto-webhook: desafio não encontrado', desafioId);
    return;
  }

  const { error: enrollErr } = await admin.rpc('internal_enroll_paid_challenge', {
    p_desafio_id: desafioId,
    p_user_id: userId,
    p_tenant_id: desafio.tenant_id
  });

  if (enrollErr) {
    console.error('cakto-webhook: erro ao inscrever participante via RPC', enrollErr.message);
    throw enrollErr;
  }

  const orderId = data.id;

  const { data: existingPag } = await admin
    .from('pagamentos')
    .select('id')
    .eq('id_externo', orderId)
    .maybeSingle();

  if (!existingPag) {
    const { error: pagErr } = await admin.from('pagamentos').insert({
      user_id: userId,
      tenant_id: desafio.tenant_id,
      tipo: 'challenge_entry',
      valor: data.amount ?? (desafio.entry_fee ? desafio.entry_fee / 100 : 0),
      status: 'paid',
      id_externo: orderId,
      metadata: {
        desafio_id: desafioId,
        cakto_order_id: orderId,
        payment_method: data.paymentMethod ?? null
      }
    });

    if (pagErr) {
      console.error('cakto-webhook: erro ao registrar pagamento do desafio', pagErr.message);
      throw pagErr;
    }
  }

  console.log(`cakto-webhook: usuário ${userId} inscrito no desafio ${desafioId} via pagamento Cakto`);
}

// ============================================================
// Record payment helper
// ============================================================

async function recordPayment(admin: AdminClient, userId: string, data: CaktoWebhookData, tipo: string, status: string) {
  const orderId = data.id;

  const { data: existingPag } = await admin
    .from('pagamentos')
    .select('id')
    .eq('id_externo', orderId)
    .maybeSingle();

  if (existingPag) {
    console.log('cakto-webhook: pagamento já registrado (idempotente)', orderId);
    return;
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return;

  const { error } = await admin.from('pagamentos').insert({
    user_id: userId,
    tenant_id: profile.tenant_id,
    tipo,
    valor: data.amount ?? 0,
    status,
    id_externo: orderId,
    metadata: {
      cakto_order_id: orderId,
      payment_method: data.paymentMethod ?? null,
      offer_id: data.offer?.id ?? null,
      product_id: data.product?.id ?? null
    }
  });

  if (error) {
    console.error('cakto-webhook: erro ao inserir pagamento', error.message);
    throw error;
  }
}
