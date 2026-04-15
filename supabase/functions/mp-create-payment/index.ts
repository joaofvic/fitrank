import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';
import { createMpClient } from '../_shared/mp-client.ts';
import type { MpCreatePaymentInput } from '../_shared/mp-client.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const pixSchema = z.object({
  identification: z.object({
    type: z.string().min(1),
    number: z.string().min(5),
  }),
});

const requestSchema = z.object({
  type: z.enum(['challenge', 'subscription']),
  desafio_id: z.string().uuid().optional(),
  plan_id: z.string().uuid().optional(),
  method: z.enum(['pix', 'card']),
  payer: z
    .object({
      email: z.string().email().optional(),
      identification: z
        .object({
          type: z.string().min(1),
          number: z.string().min(5),
        })
        .optional(),
    })
    .optional(),
  card: z.record(z.unknown()).optional(),
});

type AdminClient = ReturnType<typeof createClient>;

async function getUserFromJwt(userClient: ReturnType<typeof createClient>) {
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) {
    const msg = error?.message || 'Sessão inválida';
    throw new Error(`AUTH_INVALID: ${msg}`);
  }
  return user;
}

async function loadChallenge(admin: AdminClient, desafioId: string) {
  const { data, error } = await admin
    .from('desafios')
    .select('id, nome, tenant_id, status, entry_fee')
    .eq('id', desafioId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadPlan(admin: AdminClient, planId: string) {
  const { data, error } = await admin
    .from('subscription_plans')
    .select('id, name, price_amount, currency, interval, interval_count, is_active')
    .eq('id', planId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function buildNotificationUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\\/$/, '')}/functions/v1/mp-webhook`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
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
    global: { headers: { Authorization: authHeader } },
  });

  let user;
  try {
    user = await getUserFromJwt(userClient);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AUTH_INVALID';
    return jsonResponse({ error: message }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }

  const input = parsed.data;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Garantir que o valor venha do banco (não confiar no client)
  let description = '';
  let amountCents = 0;
  let externalRef = '';

  if (input.type === 'challenge') {
    if (!input.desafio_id) return jsonResponse({ error: 'desafio_id obrigatório' }, 400);
    const desafio = await loadChallenge(admin, input.desafio_id);
    if (!desafio) return jsonResponse({ error: 'Desafio não encontrado' }, 404);
    if (desafio.status !== 'ativo') return jsonResponse({ error: 'Desafio não está ativo' }, 400);
    if (!desafio.entry_fee || desafio.entry_fee <= 0) {
      return jsonResponse({ error: 'Este desafio não requer pagamento' }, 400);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) return jsonResponse({ error: 'Perfil não encontrado' }, 404);
    if (profile.tenant_id !== desafio.tenant_id) {
      return jsonResponse({ error: 'Desafio não pertence ao seu grupo' }, 403);
    }

    amountCents = desafio.entry_fee;
    description = `Inscrição: ${desafio.nome}`;
    externalRef = `challenge:${user.id}:${desafio.id}`;
  } else {
    if (!input.plan_id) return jsonResponse({ error: 'plan_id obrigatório' }, 400);
    const plan = await loadPlan(admin, input.plan_id);
    if (!plan) return jsonResponse({ error: 'Plano não encontrado' }, 404);
    if (!plan.is_active) return jsonResponse({ error: 'Plano indisponível' }, 400);
    amountCents = plan.price_amount;
    description = plan.name;
    externalRef = `sub:${user.id}:${plan.id}`;
  }

  const mp = createMpClient();
  const notificationUrl = buildNotificationUrl(supabaseUrl);

  // Payer email: preferir auth user email
  const payerEmail = (user.email ?? input.payer?.email ?? '').trim();
  if (!payerEmail) return jsonResponse({ error: 'Email do pagador indisponível' }, 400);

  try {
    if (input.method === 'pix') {
      const payer = input.payer ?? {};
      const pixParsed = pixSchema.safeParse({
        identification: payer.identification,
      });
      if (!pixParsed.success) {
        return jsonResponse({ error: 'CPF obrigatório para PIX', details: pixParsed.error.flatten() }, 400);
      }

      const body: MpCreatePaymentInput = {
        transaction_amount: Math.round((amountCents / 100) * 100) / 100,
        description,
        payment_method_id: 'pix',
        payer: {
          email: payerEmail,
          identification: pixParsed.data.identification,
        },
        external_reference: externalRef,
        notification_url: notificationUrl,
      };

      const res = await mp.createPayment(body);
      return jsonResponse(
        {
          id: res.id,
          status: res.status,
          status_detail: res.status_detail,
          pix: {
            qr_code: res.point_of_interaction?.transaction_data?.qr_code ?? null,
            qr_code_base64: res.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
            ticket_url: res.point_of_interaction?.transaction_data?.ticket_url ?? null,
          },
        },
        200
      );
    }

    // Card (via CardPayment Brick): repassamos os campos relevantes.
    // O Brick envia `token`, `payment_method_id`, `issuer_id`, `installments`, `payer`.
    const card = input.card ?? {};
    const token = typeof card.token === 'string' ? card.token : null;
    const paymentMethodId =
      typeof card.payment_method_id === 'string'
        ? card.payment_method_id
        : typeof card.paymentMethodId === 'string'
          ? card.paymentMethodId
          : null;
    const issuerId =
      typeof card.issuer_id === 'string'
        ? card.issuer_id
        : typeof card.issuerId === 'string'
          ? card.issuerId
          : null;
    const installmentsRaw =
      typeof card.installments === 'number'
        ? card.installments
        : typeof card.installments === 'string'
          ? Number(card.installments)
          : null;
    const installments = installmentsRaw && Number.isFinite(installmentsRaw) ? Math.max(1, Math.floor(installmentsRaw)) : 1;

    const payerFromBrick = card.payer && typeof card.payer === 'object' ? card.payer : null;
    const idType =
      payerFromBrick?.identification && typeof payerFromBrick.identification === 'object'
        ? payerFromBrick.identification.type
        : input.payer?.identification?.type;
    const idNumber =
      payerFromBrick?.identification && typeof payerFromBrick.identification === 'object'
        ? payerFromBrick.identification.number
        : input.payer?.identification?.number;

    if (!token || !paymentMethodId) {
      return jsonResponse({ error: 'Dados do cartão incompletos (token/payment_method_id)' }, 400);
    }

    const body: MpCreatePaymentInput = {
      transaction_amount: Math.round((amountCents / 100) * 100) / 100,
      description,
      payment_method_id: paymentMethodId,
      issuer_id: issuerId ?? undefined,
      installments,
      token,
      payer: {
        email: payerEmail,
        identification: idType && idNumber ? { type: String(idType), number: String(idNumber) } : undefined,
      },
      external_reference: externalRef,
      notification_url: notificationUrl,
    };

    const res = await mp.createPayment(body);
    return jsonResponse(
      { id: res.id, status: res.status, status_detail: res.status_detail },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar pagamento';
    console.error('mp-create-payment:', message);
    return jsonResponse({ error: message }, 500);
  }
});

