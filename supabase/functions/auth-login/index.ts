import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.24.2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const bodySchema = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().min(6).max(72),
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Connection": "keep-alive" },
  });
}

function okFalse() {
  // Sempre 200 para não cair no erro genérico do supabase-js (non-2xx),
  // mas sem revelar se o usuário existe.
  return jsonResponse({ ok: false, error: "Credenciais inválidas" }, 200);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePhoneLikeDb(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const rest = s.slice(1).replace(/[^0-9]/g, "");
    return rest ? `+${rest}` : null;
  }
  const digits = s.replace(/[^0-9]/g, "");
  return digits || null;
}

function looksLikeEmail(identifier: string) {
  const t = identifier.trim();
  const at = t.indexOf("@");
  return at > 0 && at < t.length - 1;
}

function looksLikePhone(identifier: string) {
  const norm = normalizePhoneLikeDb(identifier);
  if (!norm) return false;
  const digits = norm.startsWith("+") ? norm.slice(1) : norm;
  return digits.length >= 10;
}

async function resolveEmailFromIdentifier(params: {
  admin: ReturnType<typeof createClient>;
  identifier: string;
}): Promise<string | null> {
  const raw = params.identifier.trim();
  if (!raw) return null;

  if (looksLikeEmail(raw)) {
    return raw.toLowerCase();
  }

  // phone: lookup by profiles.phone_normalized
  if (looksLikePhone(raw)) {
    const norm = normalizePhoneLikeDb(raw);
    if (!norm) return null;

    // phone_normalized pode estar com ou sem '+', então tentamos ambas as formas
    const candidates = new Set<string>();
    const digits = norm.startsWith("+") ? norm.slice(1) : norm;

    // Aceita login por:
    // - DDD+8 (10 dígitos): adiciona 9 fixo para comparar com o formato salvo
    // - DDD+9+8 (11 dígitos): usa como está
    const withNine =
      digits.length === 10 ? `${digits.slice(0, 2)}9${digits.slice(2)}` : digits;
    const withoutPlus = withNine;

    candidates.add(withoutPlus);
    candidates.add(`+${withoutPlus}`);

    for (const c of candidates) {
      const { data } = await params.admin
        .from("profiles")
        .select("email")
        .eq("phone_normalized", c)
        .maybeSingle();
      const email = typeof data?.email === "string" ? data.email.trim() : "";
      if (email) return email.toLowerCase();
    }
    return null;
  }

  // username: lookup by exact lower
  const username = raw.toLowerCase();
  const { data } = await params.admin
    .from("profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();
  const email = typeof data?.email === "string" ? data.email.trim() : "";
  return email ? email.toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "Configuração do servidor incompleta" }, 500);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    await sleep(250);
    return okFalse();
  }

  const { identifier, password } = parsed.data;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const email = await resolveEmailFromIdentifier({ admin, identifier });

    // Não revela se existe ou não
    if (!email) {
      await sleep(250);
      return okFalse();
    }

    const tokenUrl = new URL(`${supabaseUrl}/auth/v1/token`);
    tokenUrl.searchParams.set("grant_type", "password");

    const res = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      await sleep(250);
      return okFalse();
    }

    const json = await res.json().catch(() => null) as any;
    const access_token = json?.access_token;
    const refresh_token = json?.refresh_token;
    const expires_in = json?.expires_in;
    const token_type = json?.token_type;
    const user = json?.user;

    if (typeof access_token !== "string" || typeof refresh_token !== "string") {
      return jsonResponse({ ok: false, error: "Falha ao autenticar" }, 200);
    }

    return jsonResponse(
      { ok: true, access_token, refresh_token, expires_in, token_type, user },
      200,
    );
  } catch {
    await sleep(250);
    return okFalse();
  }
});

