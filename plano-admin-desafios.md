# Plano — Admin Gestão de Desafios (Admin Master)

Este documento define o plano faseado para construir o módulo de **Gestão de Desafios** pelo Admin Master (`platform_admin`), permitindo criar desafios com tipos de exercício, duração flexível e ciclo de vida completo.

## Decisões já tomadas

- **Schema incremental**: novas colunas adicionadas com defaults; coluna `ativo` mantida e sincronizada via trigger com `status`.
- **Backward compat**: `ChallengesView.jsx` continua funcionando sem alteração até o Epic 4.
- **Status**: text com CHECK (`rascunho`, `ativo`, `encerrado`, `cancelado`), não enum PostgreSQL.
- **4 triggers atualizados**: `bump_desafio_points_on_checkin`, `on_checkin_rejected_revert_points`, `on_checkin_reapproved_reapply_points`, `admin_adjust_points` — todos agora usam `data_inicio/data_fim` com fallback para `mes_referencia`.

---

## Epic 1 — Evolução do Schema `desafios` ✅

### Migrations criadas

| # | Arquivo | Objetivo |
|---|---------|----------|
| 1.1 | `20260411100000_desafios_evolve_schema.sql` | Novas colunas (`descricao`, `status`, `tipo_treino`, `data_inicio`, `data_fim`, `criado_por`, `max_participantes`, `updated_at`), backfill, trigger sync `status→ativo`, índices |
| 1.2 | `20260411100100_desafios_drop_unique_mes.sql` | Drop `UNIQUE(tenant_id, mes_referencia)`, CHECK `data_fim >= data_inicio` |
| 1.3 | `20260411100200_desafios_admin_rls.sql` | Policies RLS para platform_admin (SELECT/INSERT/UPDATE/DELETE) em `desafios` e `desafio_participantes` |
| 1.4 | `20260411100300_audit_target_type_desafio.sql` | Expandir CHECK de `platform_admin_audit_log.target_type` para incluir `'desafio'` |
| 1.5 | `20260411100400_bump_desafio_date_range.sql` | Atualizar 4 funções para usar `data_inicio/data_fim` com fallback `mes_referencia` |
| 1.6 | `20260411100500_desafios_admin_rpcs.sql` | RPCs: `admin_desafios_list`, `admin_desafio_participantes`, `admin_desafio_detail` |

### Schema evoluído (`desafios`)

| Coluna | Tipo | Default | Nota |
|--------|------|---------|------|
| `id` | uuid | gen_random_uuid() | PK |
| `tenant_id` | uuid | — | FK tenants, NOT NULL |
| `nome` | text | — | NOT NULL |
| `descricao` | text | `''` | NOT NULL |
| `ativo` | boolean | true | **Backward compat** — sincronizado com `status` |
| `status` | text | `'ativo'` | CHECK: rascunho/ativo/encerrado/cancelado |
| `tipo_treino` | text[] | `'{}'` | Array de tipos de treino filtrados |
| `mes_referencia` | date | — | NOT NULL (legado, preenchido com `data_inicio`) |
| `data_inicio` | date | — | Nullable (backfill de `mes_referencia`) |
| `data_fim` | date | — | Nullable (backfill de último dia do mês) |
| `criado_por` | uuid | — | FK profiles, nullable |
| `max_participantes` | integer | — | Nullable |
| `created_at` | timestamptz | now() | — |
| `updated_at` | timestamptz | now() | Atualizado automaticamente via trigger |

---

## Epic 2 — Edge Function `admin-challenges` ✅

- Arquivo: `supabase/functions/admin-challenges/index.ts` (557 linhas)
- Deploy: `admin-challenges` v1 (ACTIVE, verify_jwt: false)
- **GET**: `?mode=list` (filtros: tenant_id, status, from, to, search, limit, offset) | `?mode=detail&id=` | `?mode=participants&id=`
- **POST**: criar desafio (validação: datas coerentes, tenant válido, tipo_treino no catálogo)
- **PATCH**: `action: update` (edição de campos, regras por status) | `action: activate/close/cancel` (ciclo de vida com transições válidas) | `action: remove_participant` (com motivo obrigatório)
- **DELETE**: `?id=` soft-cancel
- Segurança: Bearer JWT → `is_platform_master` → 403; `service_role` para mutações; zod em todos os inputs
- Auditoria: `desafio.create`, `desafio.update`, `desafio.activate`, `desafio.close`, `desafio.cancel`, `desafio.remove_participant`

## Epic 3 — CRUD Admin no Frontend ✅

- **Arquivo criado**: `src/components/views/AdminChallengesView.jsx` (~430 linhas)
- **Integração `App.jsx`**: import + rota `admin-challenges` + prop `onOpenChallenges`
- **Integração `ProfileView.jsx`**: prop `onOpenChallenges` + botão "Admin · Desafios"
- **Sub-views internas**: `list` (listagem com filtros) → `detail` (detalhe + participantes) → `form` (criar/editar)
- **Funcionalidades**:
  - Listagem cross-tenant com filtros (tenant, status, busca textual)
  - Criação de desafio (nome, descrição, tenant, tipos de treino via `WorkoutTypeMultiSelect`, datas, max participantes, status inicial)
  - Edição com regras de status (campos bloqueados para cancelado/encerrado, datas bloqueadas para ativo com participantes)
  - Ciclo de vida: ativar, encerrar, cancelar (com confirm)
  - Detalhe com metadados completos + lista de participantes com ranking
  - Remover participante com motivo obrigatório (prompt)
  - Cálculo de duração em dias e dias restantes
- **Padrões seguidos**: `edgeReady` memoizado, `invokeEdge` com `searchParams`, error/loading states, mobile-first dark UI

## Epic 4 — Adaptação do ChallengesView.jsx ✅

- **Arquivo modificado**: `src/components/views/ChallengesView.jsx` (~260 linhas, reescrito)
- **Múltiplos desafios**: carrega todos os desafios `status = 'ativo'` do tenant do usuário
- **Informações por card**: nome, descrição (line-clamp), data_inicio—data_fim, dias restantes, tipo_treino (badges), contagem de participantes / max_participantes
- **Inscrição**: botão "Participar do desafio" por card, desabilitado se vagas esgotadas (max_participantes atingido)
- **Ranking expansível**: toggle "Ver ranking / Esconder ranking" por card, carregado sob demanda via `get_desafio_ranking` RPC
- **Estados**: enrolled highlight (borda verde), loading, error, busy (por card individual)
- **UX**: cards colapsáveis, layout compacto mobile-first, dark theme consistente
- **Backward compat**: desafios legados (mensais) continuam aparecendo pois têm `status = 'ativo'`

## Epic 5 — Testes e Qualidade ✅

### 5.1 — Smoke Tests RLS (7/7 PASSED)

Executados via SQL com `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)` para simular contexto de usuário real. Tenant temporário `_rls_test_tenant` criado e removido após os testes.

| # | Teste | Resultado |
|---|-------|-----------|
| 1 | Regular user vê apenas desafios do próprio tenant | PASSED (3 own, 0 other) |
| 2 | Admin vê desafios cross-tenant | PASSED (4 total, 1 other tenant) |
| 3 | Regular user não pode INSERT em desafios | PASSED (42501 RLS violation) |
| 4 | Regular user não pode inserir participante como outro user | PASSED (42501 RLS violation) |
| 5 | Regular user não vê participantes de outro tenant | PASSED (0 rows) |
| 6 | Regular user não pode DELETE desafio | PASSED (0 rows affected) |
| 7 | Regular user não pode UPDATE desafio | PASSED (0 rows affected, nome inalterado) |

### 5.2 — Validação de Payloads Edge Function (4/4 PASSED)

Executados via HTTP (`Invoke-WebRequest`) contra `admin-challenges` v12.

| # | Teste | Resultado |
|---|-------|-----------|
| 1 | GET sem Authorization header → 401 | PASSED |
| 2 | GET com Bearer inválido → 401 | PASSED |
| 3 | OPTIONS → 200 + CORS headers corretos | PASSED (ACAM: GET, POST, PATCH, DELETE, OPTIONS) |
| 4 | PUT (método não suportado) → auth check antes de método | PASSED (401) |

### 5.3 — Checklist Visual Mobile-First

#### Admin: AdminChallengesView

- [ ] **List**: header "Admin · Desafios" + botão "Voltar" visíveis
- [ ] **List**: filtros (tenant, status, busca) renderizam e funcionam
- [ ] **List**: botão "Novo desafio" full-width
- [ ] **List**: cards com nome, tenant_slug, StatusBadge, datas, participantes, tipo_treino badges
- [ ] **List**: card clicável abre detail view
- [ ] **Form (criar)**: todos os campos renderizam (nome, descrição, tenant select, WorkoutTypeMultiSelect, datas com cálculo de duração, max participantes, status inicial)
- [ ] **Form (criar)**: botão desabilitado quando campos obrigatórios vazios
- [ ] **Form (criar)**: criar desafio como "Rascunho" e "Ativo" funciona
- [ ] **Form (editar)**: campos pré-preenchidos; tenant bloqueado
- [ ] **Form (editar)**: datas bloqueadas para desafio ativo com participantes
- [ ] **Detail**: metadados completos (nome, descrição, tenant, criador, datas, dias restantes, tipos, participantes/max)
- [ ] **Detail**: botões de lifecycle (Ativar, Encerrar, Cancelar) com confirm
- [ ] **Detail**: lista de participantes com ranking e botão remover (com prompt de motivo)
- [ ] **Detail**: responsive em tela 375px (mobile)

#### User: ChallengesView

- [ ] **Header**: "Desafios" + subtítulo visíveis
- [ ] **Cards**: todos os desafios ativos do tenant renderizados
- [ ] **Card**: nome, descrição (line-clamp), período, dias restantes badge, tipo_treino badges, participantes/max
- [ ] **Card**: desafio inscrito tem borda verde + mensagem "Você está inscrito"
- [ ] **Card**: desafio não inscrito mostra botão "Participar do desafio"
- [ ] **Card**: vagas esgotadas mostra botão desabilitado "Vagas esgotadas"
- [ ] **Ranking**: toggle "Ver ranking / Esconder ranking" funciona
- [ ] **Ranking**: lista com posição, nome, pontos, "(você)" para o próprio user
- [ ] **Inscrição**: clicar "Participar" inscreve, atualiza contagem e abre ranking
- [ ] **Empty state**: "Nenhum desafio ativo no momento." quando sem desafios
- [ ] **Teaser**: card "Desafios pagos" visível no final
- [ ] **Responsive**: layout OK em 375px (iPhone SE)

---

## Notas técnicas

- **Zod `.trim()` incompatível com Deno Edge Functions**: o método `z.string().trim()` causa boot crash no runtime Deno do Supabase. Usar validação sem `.trim()` e tratar manualmente se necessário.
- **Deploy via MCP**: o Supabase MCP `deploy_edge_function` envia o conteúdo como JSON string. Evitar caracteres UTF-8 acentuados em string literals (usar ASCII) para prevenir problemas de encoding no deploy.

---

## Como aplicar as migrations

```bash
supabase db push
```

Ou via MCP Supabase no Cursor, na ordem dos timestamps.
