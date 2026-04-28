---
name: login-cadastro-por-email-username-telefone
overview: Adicionar suporte completo a nome, username, e-mail e telefone desde o cadastro, edição posterior do perfil (incluindo academia) e login usando e-mail, username ou telefone, com segurança (evitando enumeração) e compatibilidade com Supabase Auth + tabela public.profiles.
todos:
  - id: epic-a-db-sync
    content: Definir migrations para adicionar/sincronizar `profiles.email` e `profiles.phone`, com índices únicos e backfill + ajustes em triggers.
    status: pending
  - id: epic-b-signup
    content: Atualizar cadastro para coletar nome/username/telefone/academia e persistir via Auth meta + validações.
    status: pending
  - id: epic-c-edit-profile
    content: Atualizar Editar Perfil para permitir editar nome/username/academia e atualizar email/telefone via Supabase Auth.
    status: pending
  - id: epic-d-multi-login
    content: Implementar login por email/username/telefone com Edge Function segura (sem enumeração).
    status: pending
  - id: epic-e-rollout
    content: Adicionar testes/QA, observabilidade e checklist de segurança para rollout.
    status: pending
isProject: false
---

# Plano faseado: Cadastro/Perfil e Login por e-mail/username/telefone

## Contexto atual (pontos do código)
- O cadastro/login hoje usa somente **e-mail + senha** na UI (`supabase.auth.signUp` / `signInWithPassword`) em [`src/components/auth/AuthScreen.jsx`](src/components/auth/AuthScreen.jsx).
- O perfil é criado via trigger `handle_new_user()` e alimentado por `raw_user_meta_data` em migrations como [`supabase/migrations/20250405180000_epic_1_1_tenants_profiles.sql`](supabase/migrations/20250405180000_epic_1_1_tenants_profiles.sql) e [`supabase/migrations/20250408100000_epic_1_2a_helper_profiles_triggers.sql`](supabase/migrations/20250408100000_epic_1_2a_helper_profiles_triggers.sql).
- `profiles.username` já existe e tem índice único case-insensitive em [`supabase/migrations/20260412200000_profiles_username_avatar.sql`](supabase/migrations/20260412200000_profiles_username_avatar.sql).
- A edição de perfil hoje permite **nome (display_name), username e avatar** em [`src/components/views/EditProfileView.jsx`](src/components/views/EditProfileView.jsx); **não** inclui e-mail, telefone e academia.
- Para exibir onboarding, o app verifica `profile.onboarding_completed_at` em `App.jsx` (já visto na conversa).

## Decisões já confirmadas
- **username único global** (não por tenant).
- **telefone como dado de perfil** e login por telefone com **senha** (sem OTP/SMS).

## Objetivos de produto
- Usuário tem: **nome**, **nome de usuário**, **e-mail** e **telefone** (além de poder editar **academia**).
- Essas informações devem existir **desde o cadastro**.
- Usuário pode editar essas infos em **Editar perfil**.
- Login aceita: **e-mail OU username OU telefone**.

## Diretrizes de arquitetura e segurança (Supabase)
- Evitar **enumeração de contas**: não expor uma RPC pública que “resolve username→email” de forma direta e consultável sem senha.
- Manter `profiles_prevent_privilege_escalation()` como guardião para campos “apenas servidor” e estender com cuidado.
- Normalizar entradas:
  - `username`: já normalizado na UI (min 3, lower, charset restrito) e índice único `lower(username)`.
  - `email`: sempre `lower(trim(email))`.
  - `telefone`: armazenar em **E.164** quando possível (ex: `+5511999999999`) e/ou um campo auxiliar normalizado.

## Epics e User Stories

### Epic A — Modelo de dados e sincronização com Auth
**Objetivo**: garantir que `public.profiles` tenha os campos necessários e que **email/telefone** fiquem sincronizados com `auth.users`.

- **US-A1**: Como sistema, quero armazenar `email` e `phone` no `public.profiles` para permitir lookup interno seguro durante o login.
  - **DB**: migration adicionando colunas `email text`, `phone text` (e opcionalmente `phone_e164 text` / `phone_normalized text`).
  - **Índices/constraints**:
    - `unique index` em `lower(email)` (com `where email is not null`).
    - `unique index` em `phone` normalizado (com `where phone is not null`).
  - **Backfill**: preencher `profiles.email/phone` a partir de `auth.users` para usuários existentes.

- **US-A2**: Como sistema, quero preencher `profiles.email/phone` no momento do cadastro automaticamente.
  - **DB**: atualizar `handle_new_user()` para copiar `new.email` e `new.phone` (se existir) para `profiles`.

- **US-A3**: Como sistema, quero manter `profiles.email/phone` atualizados quando o usuário alterar e-mail/telefone.
  - **DB**: criar trigger `handle_auth_user_updated()` (after update em `auth.users`) para sincronizar para `public.profiles`.

- **US-A4**: Como sistema, quero regras claras sobre quais campos o cliente pode alterar em `profiles`.
  - **DB**: revisar/estender `profiles_prevent_privilege_escalation()` para:
    - Bloquear alteração direta de `email/phone` no `profiles` (devem vir do `auth.users` via trigger).
    - Permitir alteração de `display_name`, `username`, `academia` normalmente via RLS de “update own”.

**Critérios de aceite (Epic A)**
- Todo usuário possui `profiles.email` após signup/backfill.
- Atualizar e-mail no Auth reflete em `profiles.email`.
- Unicidade de `username`, `email` e `phone` é garantida (case-insensitive onde aplicável).

---

### Epic B — Cadastro (Sign Up) com nome, username, e-mail e telefone
**Objetivo**: coletar os campos no cadastro, validar e criar conta de forma consistente.

- **US-B1**: Como usuário, quero informar **nome** e **username** no cadastro.
  - **Front**: adicionar campos `username` (obrigatório) e validação (min 3, normalização) em [`src/components/auth/AuthScreen.jsx`](src/components/auth/AuthScreen.jsx).
  - **Disponibilidade**: reutilizar RPC `check_username_available()` para feedback rápido.

- **US-B2**: Como usuário, quero informar **telefone** no cadastro.
  - **Front**: adicionar campo `telefone` (obrigatório ou opcional — definir no escopo da US) com normalização básica (remover espaços/()/-) e tentativa de E.164.
  - **Auth**: decidir estratégia de persistência:
    - Como o Supabase Auth “nativamente” autentica por email/senha, telefone pode ser armazenado no `raw_user_meta_data` no signup e depois sincronizado para `profiles.phone` via trigger/rotina, **ou**
    - Usar `supabase.auth.updateUser({ phone })` após criar sessão (quando aplicável) para gravar no `auth.users.phone`.

- **US-B3**: Como usuário, quero informar/editar **academia** no cadastro (já existe hoje).
  - **Front**: manter campo atual e garantir que ele persiste para `profiles.academia` via `raw_user_meta_data` (já existe no trigger).

**Critérios de aceite (Epic B)**
- Signup impede username inválido/duplicado.
- Telefone passa por validação mínima e é persistido.

---

### Epic C — Edição de Perfil (incluindo email, telefone e academia)
**Objetivo**: permitir edição segura e previsível, respeitando fluxos do Supabase (ex: alteração de e-mail pode exigir confirmação).

- **US-C1**: Como usuário, quero editar meu **nome**, **username** e **academia** no perfil.
  - **Front**: estender [`src/components/views/EditProfileView.jsx`](src/components/views/EditProfileView.jsx) para incluir campo `academia` e enviar em `onUpdateProfile(fields)`.

- **US-C2**: Como usuário, quero editar meu **e-mail**.
  - **Front**: adicionar campo e fluxo de `supabase.auth.updateUser({ email })`.
  - **UX**: tratar estado “pendente de confirmação” (quando aplicável), exibindo mensagem clara.

- **US-C3**: Como usuário, quero editar meu **telefone**.
  - **Front**: adicionar campo e fluxo de `supabase.auth.updateUser({ phone })` (mesmo sem OTP, o Supabase pode ter políticas do projeto; o plano inclui tratar possíveis erros/requirements).

- **US-C4**: Como sistema, quero que o perfil exibido no app sempre reflita a fonte correta (Auth vs Profiles).
  - **App/AuthProvider**: garantir que `loadProfile` selecione `academia` (já seleciona) e (após Epic A) também `email/phone` se forem exibidos no app.

**Critérios de aceite (Epic C)**
- Editar nome/username/academia atualiza `profiles`.
- Editar email/telefone atualiza `auth.users` e sincroniza para `profiles`.

---

### Epic D — Login por e-mail, username ou telefone (sem enumeração)
**Objetivo**: permitir login com múltiplos identificadores sem vazar se um usuário existe.

- **US-D1**: Como usuário, quero digitar **um único campo** de “Login” aceitando email/username/telefone.
  - **Front**: substituir o campo `email` por `login` em [`src/components/auth/AuthScreen.jsx`](src/components/auth/AuthScreen.jsx) e detectar tipo:
    - Contém `@` → tratar como e-mail.
    - Começa com `+` ou só dígitos (após normalização) → tratar como telefone.
    - Caso contrário → tratar como username.

- **US-D2**: Como sistema, quero autenticar por username **sem** expor um endpoint de “lookup” enumerável.
  - **Back-end (recomendado)**: criar uma **Supabase Edge Function** `auth-login` (em `supabase/functions/`) que recebe `{ identifier, password }`:
    - Resolve `identifier` para `email` ou `phone` via consulta em `public.profiles` (usando `service_role` internamente na function).
    - Tenta login contra o GoTrue (token endpoint) e retorna sessão/tokens.
    - Retorna **mensagem genérica** para falhas (não dizer “username não existe”).
  - **Front**: se tipo = username, chamar a Edge Function; se tipo = email/phone, pode usar `signInWithPassword` direto ou também padronizar tudo via Edge Function.

- **US-D3**: Como sistema, quero rate-limit e observabilidade de tentativas de login.
  - **Edge Function**: rate limiting básico (por IP/identifier) e logs (sem PII sensível) + eventos `analytics.authLogin`/erro.

**Critérios de aceite (Epic D)**
- Usuário consegue logar com email, username ou telefone.
- Não há endpoint simples para enumerar usernames (respostas indistinguíveis).

---

### Epic E — Qualidade, migrações e rollout seguro
**Objetivo**: colocar em produção sem quebrar usuários existentes.

- **US-E1**: Migrations idempotentes e backfill.
- **US-E2**: Ajustes de UI/validação com mensagens claras.
- **US-E3**: E2E mínimo (login por 3 identificadores, editar perfil, persistência).
- **US-E4**: Checklist de segurança (RLS, triggers, não expor service_role no client).

## Fases de entrega (sugestão)
- **Fase 1 (DB base)**: Epic A (schema + sync + backfill) e revisão de trigger.
- **Fase 2 (Cadastro/Perfil)**: Epic B + Epic C (UI e fluxos de update em Auth).
- **Fase 3 (Login multi-identificador)**: Epic D com Edge Function (mais segura).
- **Fase 4 (Polimento/QA)**: Epic E (E2E, mensagens, observabilidade).

## Principais arquivos a alterar/criar (previstos)
- Frontend:
  - [`src/components/auth/AuthScreen.jsx`](src/components/auth/AuthScreen.jsx)
  - [`src/components/views/EditProfileView.jsx`](src/components/views/EditProfileView.jsx)
  - [`src/components/auth/AuthProvider.jsx`](src/components/auth/AuthProvider.jsx) (select e possíveis campos exibidos)
- Banco/migrations:
  - Nova migration em `supabase/migrations/` para colunas/índices `profiles.email/phone` + backfill.
  - Ajustes em trigger(s): `handle_new_user`, `profiles_prevent_privilege_escalation`.
- Backend:
  - Nova Edge Function em `supabase/functions/auth-login/`.

## Riscos e mitigação
- **Enumeração**: evitar RPC pública de lookup; preferir Edge Function que valida senha e responde genericamente.
- **Telefone**: normalização é crítica para unicidade; adotar padrão E.164 e/ou campo normalizado para índice único.
- **Alteração de e-mail**: pode exigir confirmação; UX deve explicar “verifique sua caixa de e-mail”.
- **Multi-tenant**: username global já é suportado pelo índice atual; email/phone também devem ser globais (índices sem `tenant_id`).
