import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

const enrollSchema = z.object({
  desafio_id: z.string().uuid()
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const appUrl = Deno.env.get('APP_URL') || Deno.env.get('VITE_PUBLIC_APP_URL') || 'http://localhost:3000';

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }

  const { desafio_id } = parsed.data;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: desafio, error: dErr } = await admin
    .from('desafios')
    .select('id, nome, tenant_id, status, entry_fee, max_participantes')
    .eq('id', desafio_id)
    .maybeSingle();

  if (dErr) {
    console.error('challenge-enroll: erro ao buscar desafio', dErr.message);
    return jsonResponse({ error: 'Erro interno' }, 500);
  }

  if (!desafio) {
    return jsonResponse({ error: 'Desafio não encontrado' }, 404);
  }

  if (desafio.status !== 'ativo') {
    return jsonResponse({ error: 'Desafio não está ativo' }, 400);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id, stripe_customer_id, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return jsonResponse({ error: 'Perfil não encontrado' }, 404);
  }

  if (profile.tenant_id !== desafio.tenant_id) {
    return jsonResponse({ error: 'Desafio não pertence ao seu grupo' }, 403);
  }

  const { data: existing } = await admin
    .from('desafio_participantes')
    .select('id')
    .eq('desafio_id', desafio_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return jsonResponse({ enrolled: true, already: true }, 200);
  }

  if (desafio.max_participantes) {
    const { count } = await admin
      .from('desafio_participantes')
      .select('id', { count: 'exact', head: true })
      .eq('desafio_id', desafio_id);

    if ((count ?? 0) >= desafio.max_participantes) {
      return jsonResponse({ error: 'Vagas esgotadas' }, 400);
    }
  }

  if (!desafio.entry_fee || desafio.entry_fee <= 0) {
    const { error: insErr } = await admin.from('desafio_participantes').insert({
      desafio_id,
      user_id: user.id,
      tenant_id: desafio.tenant_id
    });

    if (insErr) {
      if (insErr.code === '23505') {
        return jsonResponse({ enrolled: true, already: true }, 200);
      }
      console.error('challenge-enroll: erro ao inserir participante', insErr.message);
      return jsonResponse({ error: 'Erro ao inscrever' }, 500);
    }

    return jsonResponse({ enrolled: true }, 200);
  }

  if (!stripeSecretKey) {
    return jsonResponse({ error: 'Stripe não configurado' }, 500);
  }

  try {
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' });

    let customerId = profile.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile.display_name || undefined,
        metadata: { user_id: user.id, tenant_id: profile.tenant_id }
      });
      customerId = customer.id;

      await admin.rpc('internal_update_profile_stripe', {
        p_user_id: user.id,
        p_is_pro: false,
        p_stripe_customer_id: customerId,
        p_stripe_subscription_id: null
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `Inscrição: ${desafio.nome}`,
              description: `Taxa de inscrição no desafio "${desafio.nome}"`
            },
            unit_amount: desafio.entry_fee
          },
          quantity: 1
        }
      ],
      success_url: `${appUrl}?challenge_checkout=success&desafio_id=${desafio_id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?challenge_checkout=cancel&desafio_id=${desafio_id}`,
      metadata: {
        type: 'challenge_entry',
        user_id: user.id,
        tenant_id: desafio.tenant_id,
        desafio_id
      }
    });

    return jsonResponse({ url: session.url }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar sessão de checkout';
    console.error('challenge-enroll:', message);
    return jsonResponse({ error: message }, 500);
  }
});
