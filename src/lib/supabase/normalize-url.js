export function normalizeSupabaseUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Supabase base URL esperada: https://<project>.supabase.co
  // Erros comuns em .env: incluir /rest/v1, /auth/v1 ou /functions/v1 no final.
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const normalized = withoutTrailingSlash.replace(/\/(rest|auth|functions)\/v1$/i, '');
  return normalized;
}

