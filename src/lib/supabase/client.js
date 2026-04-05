import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Cliente Supabase para o browser (chave anon + RLS).
 * Só cria o client se as variáveis existirem (evita crash em demo sem .env).
 */
export function getSupabase() {
  if (!url || !anonKey) {
    return null;
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}
