import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const STRIPE_API_VERSION = '2024-06-20';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeSecret || !webhookSecret) {
    return jsonResponse({ error: 'stripe_not_configured' }, 503);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'missing_signature' }, 400);
  }

  const body = await req.text();
  const stripe = new Stripe(stripeSecret, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient()
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    console.error('[stripe-webhook] signature_error', { message: (e as Error).message });
    return jsonResponse({ error: 'invalid_signature' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: existing } = await admin.from('stripe_webhook_events').select('id').eq('id', event.id).maybeSingle();
  if (existing) {
    return jsonResponse({ received: true, duplicate: true });
  }

  const { error: insErr } = await admin.from('stripe_webhook_events').insert({ id: event.id });
  if (insErr) {
    console.error('[stripe-webhook] idempotency_insert_failed', insErr);
    return jsonResponse({ error: 'idempotency_failed' }, 500);
  }

  console.log(JSON.stringify({ scope: 'stripe_webhook', type: event.type, id: event.id }));

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const tenantId = session.metadata?.tenant_id;
        if (userId && session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await admin.from('subscriptions').upsert(
            {
              user_id: userId,
              tenant_id: tenantId ?? null,
              stripe_subscription_id: sub.id,
              stripe_customer_id: sub.customer as string,
              status: sub.status,
              price_id: sub.items.data[0]?.price.id,
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString()
            },
            { onConflict: 'stripe_subscription_id' }
          );
          await admin
            .from('profiles')
            .update({
              is_pro: sub.status === 'active' || sub.status === 'trialing',
              stripe_subscription_id: sub.id,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        }
        if (session.payment_intent && session.mode === 'payment') {
          await admin.from('pagamentos').insert({
            tenant_id: tenantId ?? (await tenantFromUser(admin, userId)),
            user_id: userId ?? null,
            tipo: 'stripe_payment',
            valor: (session.amount_total ?? 0) / 100,
            status: 'completed',
            external_id: session.payment_intent as string,
            metadata: { session_id: session.id, pix_future: true }
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data: row } = await admin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();
        const active = sub.status === 'active' || sub.status === 'trialing';
        await admin
          .from('subscriptions')
          .update({
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', sub.id);
        if (row?.user_id) {
          await admin
            .from('profiles')
            .update({
              is_pro: event.type === 'customer.subscription.deleted' ? false : active,
              updated_at: new Date().toISOString()
            })
            .eq('id', row.user_id);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('[stripe-webhook] handler_error', { type: event.type, message: (e as Error).message });
    return jsonResponse({ error: 'handler_failed' }, 500);
  }

  return jsonResponse({ received: true });
});

async function tenantFromUser(
  admin: ReturnType<typeof createClient>,
  userId: string | undefined
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
  return (data?.tenant_id as string) ?? null;
}
