import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const bodySchema = z.object({
  priceId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  mode: z.enum(['subscription', 'payment']).default('subscription')
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecret) {
    return jsonResponse({ error: 'stripe_not_configured' }, 503);
  }

  const jwt = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'invalid_session' }, 401);
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: 'invalid_body', details: String(e) }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('stripe_customer_id, tenant_id')
    .eq('id', userData.user.id)
    .single();

  if (profErr || !profile) {
    return jsonResponse({ error: 'profile_not_found' }, 400);
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-11-20.acacia', httpClient: Stripe.createFetchHttpClient() });

  let customerId = profile.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData.user.email ?? undefined,
      metadata: { supabase_user_id: userData.user.id, tenant_id: profile.tenant_id }
    });
    customerId = customer.id;
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userData.user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: parsed.mode,
    customer: customerId,
    line_items: [{ price: parsed.priceId, quantity: 1 }],
    success_url: parsed.successUrl,
    cancel_url: parsed.cancelUrl,
    metadata: {
      supabase_user_id: userData.user.id,
      tenant_id: profile.tenant_id
    }
  });

  return jsonResponse({ url: session.url, sessionId: session.id });
});
