import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const bodySchema = z.object({
  returnUrl: z.string().url()
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
    .select('stripe_customer_id')
    .eq('id', userData.user.id)
    .single();

  if (profErr || !profile?.stripe_customer_id) {
    return jsonResponse({ error: 'no_stripe_customer' }, 400);
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-11-20.acacia', httpClient: Stripe.createFetchHttpClient() });

  const portal = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id as string,
    return_url: parsed.returnUrl
  });

  return jsonResponse({ url: portal.url });
});
