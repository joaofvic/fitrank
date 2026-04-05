# Checklist Go-Live — FitRank

## Pré-deploy

- [ ] Migrations aplicadas no projeto Supabase de produção (revisar ordem em `supabase/migrations/`).
- [ ] Edge Functions publicadas com secrets configurados (Stripe, Brevo, BYOK, e-mail interno, worker).
- [ ] Webhook Stripe apontando para `https://<ref>.supabase.co/functions/v1/stripe-webhook` com eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Auth: URLs de redirect e Site URL incluem o domínio Netlify (e previews, se necessário).
- [ ] Smoke tests RLS conforme `docs/rls-manual-tests.md`.
- [ ] Primeiro `platform_admin` inserido via SQL.

## Netlify

- [ ] Variáveis de build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PRICE_ID_PRO` (se PRO ativo).
- [ ] Redirect SPA (`/*` → `index.html`) já em `netlify.toml`.

## Pós-deploy

- [ ] Testar cadastro, login, check-in, ranking, desafio, upload de foto opcional.
- [ ] Fluxo PRO: checkout → webhook → `is_pro` no perfil → portal do cliente.
- [ ] Monitorar logs das Edge Functions (falhas de webhook / Brevo).
- [ ] Plano de rollback: manter migration reversível ou backup do schema antes de mudanças grandes.

## Métricas (PRD)

- [ ] Instrumentar eventos (DAU, retenção 7d streak, MRR) em iteração seguinte; agregar no backend para não vazar PII.

## Estratégia BYOK vs Stripe Connect

- **Preferência:** Stripe Connect para repasses por tenant reduz armazenamento de `sk_live` no banco.
- **Implementado agora:** segredos do tenant em `tenant_byok_secrets` (AES-GCM com `BYOK_MASTER_KEY`) + auditoria em `api_key_audit_log`; uso nas Edge Functions quando integrar cobrança tenant-specific.
