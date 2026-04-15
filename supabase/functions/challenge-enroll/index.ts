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

const enrollSchema = z.object({
  desafio_id: z.string().uuid(),
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
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('VITE_PUBLIC_APP_URL') || '';

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

  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }

  const { desafio_id } = parsed.data;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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
    .select('tenant_id, display_name')
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

  // Desafio gratuito: inscrever direto
  if (!desafio.entry_fee || desafio.entry_fee <= 0) {
    const { error: insErr } = await admin.from('desafio_participantes').insert({
      desafio_id,
      user_id: user.id,
      tenant_id: desafio.tenant_id,
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

  // Desafio pago: criar preferência Mercado Pago
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
          title: `Inscrição: ${desafio.nome}`,
          quantity: 1,
          unit_price: MpClient.centsToReais(desafio.entry_fee),
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: user.email ?? '',
      },
      back_urls: {
        success: `${appUrl}/challenges?challenge_checkout=success`,
        failure: `${appUrl}/challenges?challenge_checkout=failure`,
        pending: `${appUrl}/challenges?challenge_checkout=pending`,
      },
      auto_return: 'approved',
      external_reference: `challenge:${user.id}:${desafio_id}`,
      notification_url: webhookUrl,
      statement_descriptor: 'FITRANK',
    });

    return jsonResponse({ url: preference.init_point }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar oferta de pagamento';
    console.error('challenge-enroll:', message);
    return jsonResponse({ error: message }, 500);
  }
});
