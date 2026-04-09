const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Uma única renovação por vez — evita 429 (Too Many Requests) com vários invokeEdge em paralelo. */
let refreshInFlight = null;

async function refreshSessionSingleFlight(supabase) {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = supabase.auth.refreshSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function readTextSafe(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isSupabaseClient(x) {
  return Boolean(x && typeof x === 'object' && typeof x.auth?.getSession === 'function');
}

/** true se o JWT de access estiver ausente ou já expirado (margem ~45s para clock skew). */
function isAccessTokenExpiredOrMissing(token) {
  if (!token || typeof token !== 'string') return true;
  try {
    const p = token.split('.')[1];
    if (!p) return true;
    let b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const payload = JSON.parse(atob(b64));
    const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    if (expMs == null) return true;
    return Date.now() >= expMs - 45_000;
  } catch {
    return true;
  }
}

/**
 * Resolve Bearer: string JWT ou cliente Supabase.
 * Renova só se não houver token ou se o access JWT já estiver expirado — evita o 1º fetch com JWT morto
 * (ruído no console) sem competir com autoRefreshToken renovando tokens ainda válidos.
 * Em 401, invokeEdge tenta refreshSessionSingleFlight uma vez e repete o fetch.
 */
async function resolveAccessToken(accessTokenOrClient) {
  if (isSupabaseClient(accessTokenOrClient)) {
    const supabase = accessTokenOrClient;
    const {
      data: { session }
    } = await supabase.auth.getSession();
    let token = session?.access_token ?? null;

    if (!token || isAccessTokenExpiredOrMissing(token)) {
      const { data: ref, error: refErr } = await refreshSessionSingleFlight(supabase);
      if (!refErr && ref?.session?.access_token) {
        token = ref.session.access_token;
      } else {
        const {
          data: { session: s2 }
        } = await supabase.auth.getSession();
        token = s2?.access_token ?? token;
      }
    }

    return { token, supabase };
  }
  return { token: accessTokenOrClient, supabase: null };
}

/**
 * Monta URL da Edge Function preservando query embutida em `path` e mesclando `searchParams`.
 */
function buildFunctionUrl(path, searchParams) {
  const raw = path.replace(/^\//, '');
  const qMark = raw.indexOf('?');
  const pathOnly = qMark >= 0 ? raw.slice(0, qMark) : raw;
  const queryFromPath = qMark >= 0 ? raw.slice(qMark + 1) : '';
  const sp = new URLSearchParams(queryFromPath || '');
  if (searchParams && typeof searchParams === 'object') {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null && String(v) !== '') sp.set(k, String(v));
    }
  }
  const q = sp.toString();
  const base = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${pathOnly}`;
  return q ? `${base}?${q}` : base;
}

async function edgeFetchOnce(url, token, method, body) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`
  };

  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload
  });

  const text = await readTextSafe(res);
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      (text ? text : `Edge Function falhou (${res.status})`);
    const err = new Error(msg);
    err.status = res.status;
    err.details = json ?? text;
    return { data: json, error: err };
  }

  return { data: json, error: null };
}

/**
 * Chama uma Edge Function com JWT.
 * Segundo argumento: access token (string) ou cliente Supabase (recomendado).
 */
export async function invokeEdge(path, accessTokenOrClient, { method = 'GET', body, searchParams } = {}) {
  if (!supabaseUrl || !anonKey) {
    return { data: null, error: new Error('Supabase não configurado') };
  }

  const { token: firstToken, supabase } = await resolveAccessToken(accessTokenOrClient);
  if (!firstToken) {
    return { data: null, error: new Error('Sessão inválida (sem token)') };
  }

  const url = buildFunctionUrl(path, searchParams);

  let result = await edgeFetchOnce(url, firstToken, method, body);

  if (result.error?.status === 401 && supabase) {
    const { data: ref, error: refErr } = await refreshSessionSingleFlight(supabase);
    const t2 = !refErr && ref?.session?.access_token ? ref.session.access_token : null;
    if (t2) {
      result = await edgeFetchOnce(url, t2, method, body);
    }
  }

  return result;
}
