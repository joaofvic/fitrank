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

const checkoutSchema = z.object({
  price_id: z.string().min(1, 'price_id obrigatório')
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('APP_URL') || Deno.env.get('VITE_PUBLIC_APP_URL') || 'http://localhost:3000';

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

  const { price_id } = parsed.data;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: plan } = await admin
    .from('subscription_plans')
    .select('id, stripe_price_id, is_active')
    .eq('stripe_price_id', price_id)
    .maybeSingle();

  if (!plan || !plan.is_active) {
    return jsonResponse({ error: 'Plano não encontrado ou inativo' }, 404);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, display_name, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return jsonResponse({ error: 'Perfil não encontrado' }, 404);
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
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${appUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?checkout=cancel`,
      metadata: { user_id: user.id, tenant_id: profile.tenant_id },
      subscription_data: {
        metadata: { user_id: user.id, tenant_id: profile.tenant_id }
      },
      allow_promotion_codes: true
    });

    return jsonResponse({ url: session.url }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar sessão de checkout';
    console.error('stripe-checkout:', message);
    return jsonResponse({ error: message }, 500);
  }
});
