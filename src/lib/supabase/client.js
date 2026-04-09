import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _client = null;

/**
 * Cliente Supabase para o browser (chave anon + RLS).
 * Só cria o client se as variáveis existirem (evita crash em demo sem .env).
 */
export function getSupabase() {
  if (!url || !anonKey) {
    return null;
  }
  if (_client) return _client;
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return _client;
}

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}
