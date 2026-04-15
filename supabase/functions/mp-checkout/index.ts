import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';
import { createMpClient, MpClient } from '../_shared/mp-client.ts';

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

const checkoutSchema = z.object({
  plan_id: z.string().uuid('plan_id obrigatório'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('VITE_PUBLIC_APP_URL') || '';

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Não autorizado' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Sessão inválida' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }

  const { plan_id } = parsed.data;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: plan, error: planErr } = await admin
    .from('subscription_plans')
    .select('id, name, price_amount, currency, interval, interval_count, is_active')
    .eq('id', plan_id)
    .maybeSingle();

  if (planErr) {
    console.error('mp-checkout: erro ao buscar plano', planErr.message);
    return jsonResponse({ error: 'Erro interno' }, 500);
  }

  if (!plan) {
    return jsonResponse({ error: 'Plano não encontrado' }, 404);
  }

  if (!plan.is_active) {
    return jsonResponse({ error: 'Plano indisponível' }, 400);
  }

  let mp: ReturnType<typeof createMpClient>;
  try {
    mp = createMpClient();
  } catch {
    return jsonResponse({ error: 'Provedor de pagamento não configurado' }, 500);
  }

  const webhookUrl = `${supabaseUrl}/functions/v1/mp-webhook`;

  try {
    const preference = await mp.createPreference({
      items: [
        {
          title: plan.name,
          quantity: 1,
          unit_price: MpClient.centsToReais(plan.price_amount),
          currency_id: (plan.currency || 'brl').toUpperCase(),
        },
      ],
      payer: {
        email: user.email ?? '',
      },
      back_urls: {
        success: `${appUrl}/profile?payment=success`,
        failure: `${appUrl}/profile?payment=failure`,
        pending: `${appUrl}/profile?payment=pending`,
      },
      auto_return: 'approved',
      external_reference: `sub:${user.id}:${plan_id}`,
      notification_url: webhookUrl,
      statement_descriptor: 'FITRANK PRO',
    });

    return jsonResponse({ url: preference.init_point }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar checkout';
    console.error('mp-checkout:', message);
    return jsonResponse({ error: message }, 500);
  }
});
