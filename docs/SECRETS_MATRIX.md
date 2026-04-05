# Matriz de segredos — FitRank

| Segredo | Onde fica | Quem acessa | Notas |
|--------|-----------|-------------|--------|
| `SUPABASE_ACCESS_TOKEN` | Máquina local / CI privado (MCP, CLI) | Você / pipeline | **Nunca** commitar. Use env do Cursor ou cópia local de `docs/mcp.json` fora do git. |
| `VITE_SUPABASE_ANON_KEY` | Netlify (build env) | Browser | Apenas chave anon; RLS protege dados. |
| `VITE_SUPABASE_URL` | Netlify | Browser | Público. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets das Edge Functions (Supabase) | Apenas Deno Edge | Nunca no frontend nem no repositório. |
| `STRIPE_SECRET_KEY` | Secrets das Edge Functions | Checkout, portal, webhook | Rotacionar no Stripe em incidentes. |
| `STRIPE_WEBHOOK_SECRET` | Secrets da função `stripe-webhook` | Validação de assinatura | Um secret por endpoint de webhook. |
| `BREVO_API_KEY` | Secrets da função `send-email` | Envio transacional house | Opcional se todos os tenants usarem BYOK Brevo. |
| `BYOK_MASTER_KEY` | Secret Edge (`tenant-byok-secret`, `send-email`) | Cifrar/decifrar chaves tenant | 32 bytes aleatórios em base64; backup offline seguro. |
| `EMAIL_INTERNAL_KEY` | Secret `send-email` + `notification-worker` | Chamadas internas entre funções | Diferente do service_role; rotação simples. |
| `NOTIFICATION_WORKER_SECRET` | Secret `notification-worker` | Cron / invocação agendada | |
| Chaves BYOK (Stripe/Brevo do tenant) | `tenant_byok_secrets` (cifrado) | Edge Functions após decifrar | Auditoria em `api_key_audit_log`. |

**Netlify:** não armazenar `service_role`, `STRIPE_SECRET_KEY`, `BYOK_MASTER_KEY` ou chaves Brevo de tenant.

**Rotação BYOK:** substituir via função `tenant-byok-secret` (registra `api_key_audit_log` com ação `set` ou futuro `rotate`).
