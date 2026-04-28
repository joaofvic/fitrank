## Rollout seguro (Epics A–D)

### Objetivo
Garantir que as mudanças de **cadastro/perfil/login por múltiplos identificadores** (email/username/telefone) sejam ativadas sem regressões, sem vazamento de informação (enumeração) e com migrações idempotentes.

### Pré-requisitos
- Supabase com migrations aplicadas:
  - `profiles_email_phone_sync`
  - `signup_meta_username_phone`
  - `fix_availability_rpcs`
- Edge Function `auth-login` deployada e **ACTIVE**.

### Checklist de segurança
- [ ] **Service role** nunca exposto no frontend (somente Edge Functions).
- [ ] Edge Function `auth-login` retorna mensagens genéricas em falha (**anti-enumeração**).
- [ ] Unicidade garantida no banco:
  - `profiles_username_unique`
  - `profiles_email_unique`
  - `profiles_phone_normalized_unique`
- [ ] Trigger `profiles_prevent_privilege_escalation()` bloqueia update direto de `profiles.email/phone/phone_normalized`.

### Checklist de regressão (manual)
- Cadastro
  - [ ] Username duplicado mostra “já em uso”
  - [ ] Telefone duplicado mostra “já em uso”
  - [ ] Email duplicado mostra “já em uso”
  - [ ] `profiles.username`, `profiles.phone`, `profiles.phone_normalized`, `profiles.email` são preenchidos após signup
- Editar perfil
  - [ ] Atualizar `academia` reflete em `profiles.academia`
  - [ ] Atualizar email usa `auth.updateUser` e reflete em `profiles.email` (via trigger)
  - [ ] Atualizar telefone usa `auth.updateUser` e reflete em `profiles.phone_normalized` (via trigger)
- Login
  - [ ] Login por email funciona
  - [ ] Login por username funciona
  - [ ] Login por telefone funciona
  - [ ] Erro de credenciais é sempre genérico (não indica se usuário existe)

### Verificações SQL úteis (Supabase)
> Execute no SQL editor (apenas leitura).

```sql
-- Colunas de contato existem
select column_name
from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('email','phone','phone_normalized','username','academia');

-- Índices únicos ativos
select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='profiles'
  and indexname in ('profiles_username_unique','profiles_email_unique','profiles_phone_normalized_unique');

-- Trigger de sync auth.users -> profiles
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgname='on_auth_user_updated';
```

