import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { MpClient, createMpClient } from '../_shared/mp-client.ts';
import type { MpPayment } from '../_shared/mp-client.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type AdminClient = ReturnType<typeof createClient>;

// ============================================================
// External reference parsing
// ============================================================

interface RefSubscription {
  type: 'subscription';
  userId: string;
  planId: string;
}

interface RefChallenge {
  type: 'challenge';
  userId: string;
  desafioId: string;
}

type ParsedRef = RefSubscription | RefChallenge | null;

function parseExternalReference(ref: string | null | undefined): ParsedRef {
  if (!ref) return null;
  const parts = ref.split(':');
  if (parts[0] === 'sub' && parts[1] && parts[2]) {
    return { type: 'subscription', userId: parts[1], planId: parts[2] };
  }
  if (parts[0] === 'challenge' && parts[1] && parts[2]) {
    return { type: 'challenge', userId: parts[1], desafioId: parts[2] };
  }
  return null;
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const webhookSecret = Deno.env.get('MP_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    console.error('mp-webhook: variáveis de ambiente ausentes');
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }

  // --- Validate signature (if secret configured) ---
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  const url = new URL(req.url);
  const queryDataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';

  if (webhookSecret && xSignature && xRequestId) {
    const valid = await MpClient.validateWebhookSignature(
      xSignature,
      xRequestId,
      queryDataId,
      webhookSecret
    );
    if (!valid) {
      console.error('mp-webhook: assinatura inválida');
      return jsonResponse({ error: 'Assinatura inválida' }, 401);
    }
  }

  // --- Parse body ---
  let payload: { action?: string; type?: string; data?: { id?: string }; [key: string]: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const topic = payload.type ?? '';
  const dataId = payload.data?.id ?? queryDataId;

  if (topic !== 'payment' || !dataId) {
    console.log(`mp-webhook: tipo ignorado: ${topic}, data.id: ${dataId}`);
    return jsonResponse({ received: true }, 200);
  }

  // --- Fetch payment details from MP ---
  let mp: MpClient;
  try {
    mp = createMpClient();
  } catch {
    console.error('mp-webhook: MP_ACCESS_TOKEN não configurado');
    return jsonResponse({ error: 'Provedor de pagamento não configurado' }, 500);
  }

  let payment: MpPayment;
  try {
    payment = await mp.getPayment(dataId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar pagamento';
    console.error('mp-webhook: erro ao buscar pagamento:', msg);
    return jsonResponse({ error: msg }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ref = parseExternalReference(payment.external_reference);

  if (!ref) {
    console.log(`mp-webhook: external_reference não reconhecida: ${payment.external_reference}`);
    return jsonResponse({ received: true }, 200);
  }

  try {
    if (ref.type === 'subscription') {
      await handleSubscriptionPayment(admin, payment, ref);
    } else if (ref.type === 'challenge') {
      await handleChallengePayment(admin, payment, ref);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error(`mp-webhook: erro ao processar payment ${payment.id}:`, message);
    return jsonResponse({ error: message }, 500);
  }

  return jsonResponse({ received: true }, 200);
});

// ============================================================
// Subscription payment handler
// ============================================================

async function handleSubscriptionPayment(
  admin: AdminClient,
  payment: MpPayment,
  ref: RefSubscription
) {
  const paymentIdStr = String(payment.id);
  const email = payment.payer?.email ?? null;

  if (payment.status === 'approved') {
    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', ref.userId)
      .maybeSingle();

    if (!profile) {
      console.error('mp-webhook: perfil não encontrado', ref.userId);
      return;
    }

    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id, interval, interval_count')
      .eq('id', ref.planId)
      .maybeSingle();

    const periodEnd = computePeriodEnd(
      plan?.interval ?? 'month',
      plan?.interval_count ?? 1
    );

    const { error: subError } = await admin
      .from('subscriptions')
      .upsert(
        {
          user_id: ref.userId,
          tenant_id: profile.tenant_id,
          plan_id: ref.planId,
          mp_payment_id: paymentIdStr,
          mp_payer_email: email,
          status: 'active',
          current_period_start: payment.date_approved ?? new Date().toISOString(),
          current_period_end: periodEnd,
          cancel_at_period_end: false,
        },
        { onConflict: 'user_id' }
      );

    if (subError) {
      console.error('mp-webhook: erro ao upsert subscription', subError.message);
      throw subError;
    }

    await updateProfileMp(admin, ref.userId, email, paymentIdStr, true);
    await recordPayment(admin, ref.userId, payment, 'subscription', 'paid');

    console.log(`mp-webhook: subscription ativada para user ${ref.userId}, payment ${payment.id}`);
  } else if (payment.status === 'refunded') {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('id, user_id, mp_payer_email')
      .eq('mp_payment_id', paymentIdStr)
      .maybeSingle();

    if (sub) {
      await admin
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);

      if (sub.user_id) {
        await updateProfileMp(admin, sub.user_id, sub.mp_payer_email, paymentIdStr, false);
      }
    }

    await admin
      .from('pagamentos')
      .update({ status: 'refunded' })
      .eq('id_externo', paymentIdStr);

    console.log(`mp-webhook: refund processado, payment ${payment.id}`);
  } else if (payment.status === 'charged_back') {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('id, user_id, mp_payer_email')
      .eq('mp_payment_id', paymentIdStr)
      .maybeSingle();

    if (sub) {
      await admin
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);

      if (sub.user_id) {
        await updateProfileMp(admin, sub.user_id, sub.mp_payer_email, paymentIdStr, false);
      }
    }

    await admin
      .from('pagamentos')
      .update({ status: 'chargeback' })
      .eq('id_externo', paymentIdStr);

    console.log(`mp-webhook: chargeback processado, payment ${payment.id}`);
  } else {
    console.log(`mp-webhook: status ${payment.status} ignorado para subscription, payment ${payment.id}`);
  }
}

// ============================================================
// Challenge payment handler
// ============================================================

async function handleChallengePayment(
  admin: AdminClient,
  payment: MpPayment,
  ref: RefChallenge
) {
  const paymentIdStr = String(payment.id);

  if (payment.status !== 'approved') {
    console.log(`mp-webhook: challenge payment ${payment.id} status=${payment.status}, ignorado`);
    return;
  }

  const { data: desafio } = await admin
    .from('desafios')
    .select('id, tenant_id, entry_fee')
    .eq('id', ref.desafioId)
    .maybeSingle();

  if (!desafio) {
    console.error('mp-webhook: desafio não encontrado', ref.desafioId);
    return;
  }

  const { error: enrollErr } = await admin.rpc('internal_enroll_paid_challenge', {
    p_desafio_id: ref.desafioId,
    p_user_id: ref.userId,
    p_tenant_id: desafio.tenant_id,
  });

  if (enrollErr) {
    console.error('mp-webhook: erro ao inscrever participante via RPC', enrollErr.message);
    throw enrollErr;
  }

  const { data: existingPag } = await admin
    .from('pagamentos')
    .select('id')
    .eq('id_externo', paymentIdStr)
    .maybeSingle();

  if (!existingPag) {
    const { error: pagErr } = await admin.from('pagamentos').insert({
      user_id: ref.userId,
      tenant_id: desafio.tenant_id,
      tipo: 'challenge_entry',
      valor: payment.transaction_amount ?? (desafio.entry_fee ? desafio.entry_fee / 100 : 0),
      status: 'paid',
      id_externo: paymentIdStr,
      metadata: {
        desafio_id: ref.desafioId,
        mp_payment_id: paymentIdStr,
        payment_method: payment.payment_method_id ?? null,
      },
    });

    if (pagErr) {
      console.error('mp-webhook: erro ao registrar pagamento do desafio', pagErr.message);
      throw pagErr;
    }
  }

  console.log(`mp-webhook: usuário ${ref.userId} inscrito no desafio ${ref.desafioId} via pagamento MP`);
}

// ============================================================
// Helpers
// ============================================================

async function updateProfileMp(
  admin: AdminClient,
  userId: string,
  email: string | null,
  paymentId: string | null,
  isPro: boolean
) {
  const { error } = await admin.rpc('internal_update_profile_mp', {
    p_user_id: userId,
    p_is_pro: isPro,
    p_mp_payer_email: email,
    p_mp_payment_id: paymentId,
  });
  if (error) {
    console.error('mp-webhook: erro ao atualizar perfil via RPC', error.message);
    throw error;
  }
}

async function recordPayment(
  admin: AdminClient,
  userId: string,
  payment: MpPayment,
  tipo: string,
  status: string
) {
  const paymentIdStr = String(payment.id);

  const { data: existingPag } = await admin
    .from('pagamentos')
    .select('id')
    .eq('id_externo', paymentIdStr)
    .maybeSingle();

  if (existingPag) {
    console.log('mp-webhook: pagamento já registrado (idempotente)', paymentIdStr);
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
    valor: payment.transaction_amount ?? 0,
    status,
    id_externo: paymentIdStr,
    metadata: {
      mp_payment_id: paymentIdStr,
      payment_method: payment.payment_method_id ?? null,
      payment_type: payment.payment_type_id ?? null,
    },
  });

  if (error) {
    console.error('mp-webhook: erro ao inserir pagamento', error.message);
    throw error;
  }
}

function computePeriodEnd(interval: string, intervalCount: number): string {
  const now = new Date();
  if (interval === 'year') {
    now.setFullYear(now.getFullYear() + intervalCount);
  } else {
    now.setMonth(now.getMonth() + intervalCount);
  }
  return now.toISOString();
}
