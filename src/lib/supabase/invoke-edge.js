const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function readTextSafe(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export async function invokeEdge(path, accessToken, { method = 'GET', body } = {}) {
  if (!supabaseUrl || !anonKey) {
    return { data: null, error: new Error('Supabase não configurado') };
  }
  if (!accessToken) {
    return { data: null, error: new Error('Sessão inválida (sem token)') };
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${path.replace(/^\//, '')}`;

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

