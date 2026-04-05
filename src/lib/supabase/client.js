import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Cliente público (anon). Operações sensíveis ficam em RPC / Edge Functions. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export function getSupabaseUrl() {
  return import.meta.env.VITE_SUPABASE_URL ?? '';
}
