---
name: Performance UX Refactor
overview: "Refatorar performance e UX do FitRank: quebrar componentes admin monoliticos, implementar lazy loading com code splitting, adicionar skeleton loading consistente, corrigir pull-to-refresh, virtualizar listas longas e eliminar o N+1 do ChallengesView."
todos:
  - id: epic-7-n1
    content: "Epic 7: Eliminar N+1 no ChallengesView (RPC + frontend)"
    status: pending
  - id: epic-1-lazy
    content: "Epic 1: Lazy loading e code splitting (React.lazy + manualChunks)"
    status: done
  - id: epic-4-skeleton
    content: "Epic 4: Skeleton loading consistente em todas as views"
    status: pending
  - id: epic-5-ptr
    content: "Epic 5: Corrigir pull-to-refresh (Challenges + Profile completo)"
    status: pending
  - id: epic-2-engagement
    content: "Epic 2: Refatorar AdminEngagementView em 5 subcomponentes"
    status: pending
  - id: epic-3-moderation
    content: "Epic 3: Refatorar AdminModerationView em 5 subcomponentes"
    status: pending
  - id: epic-6-virtual
    content: "Epic 6: Virtualizacao de listas longas (Feed, Ranking, Moderacao)"
    status: pending
isProject: false
---

# Performance e UX -- Plano de Implementacao

## Diagnostico Atual

- `AdminEngagementView.jsx`: **1732 linhas**, ~8 secoes funcionais, dezenas de `useState`
- `AdminModerationView.jsx`: **1511 linhas**, ~7-9 secoes, modais embutidos
- **9 views admin** importadas estaticamente em `App.jsx` -- carregam para TODOS os usuarios
- Skeleton loading **parcial** (Home e Feed tem, admin e challenges nao)
- Pull-to-refresh habilitado em 4 views, mas **Challenges e no-op** (nao dispara refresh)
- Feed usa IntersectionObserver para paginacao, mas **sem virtualizacao** (todos os posts permanecem no DOM)
- **N+1 confirmado** em `ChallengesView`: 1 query por desafio para contar participantes

---

## Epic 1 -- Lazy Loading e Code Splitting

Reduzir o bundle inicial removendo codigo admin do chunk principal.

**Arquivos:** [src/App.jsx](src/App.jsx), [vite.config.js](vite.config.js)

### US 1.1 -- React.lazy para views admin

Substituir os 9 imports estaticos por `React.lazy()`:

```jsx
const AdminTenantsView = lazy(() => import('./components/views/AdminTenantsView.jsx'));
const AdminModerationView = lazy(() => import('./components/views/AdminModerationView.jsx'));
// ... demais 7 views
```

Envolver cada renderizacao condicional em `<Suspense fallback={<ViewSkeleton />}>`.

### US 1.2 -- Lazy loading para views secundarias

Aplicar `React.lazy` tambem para views que nao sao tab principal:
- `PublicProfileView`, `NotificationsView`, `HashtagFeedView`, `StoryCreator`, `StoryViewer`
- `EditProfileView`, `FriendsView`, `CheckinModal`

### US 1.3 -- Manual chunks no Vite

Em [vite.config.js](vite.config.js), adicionar `build.rollupOptions.output.manualChunks` para garantir separacao:

```js
manualChunks: {
  admin: [
    'src/components/views/AdminEngagementView.jsx',
    'src/components/views/AdminModerationView.jsx',
    // ... demais admin
  ]
}
```

**Metrica de sucesso:** bundle principal reduzido em ~30-40%; views admin em chunk separado.

---

## Epic 2 -- Refatoracao do AdminEngagementView (1732 linhas)

Quebrar em subcomponentes modulares mantendo a mesma UX.

**Arquivo:** [src/components/views/AdminEngagementView.jsx](src/components/views/AdminEngagementView.jsx)

### US 2.1 -- Extrair componentes de filtro

Criar `src/components/admin/engagement/EngagementFilters.jsx`:
- Filtros de tenant, regiao, tipo de usuario, plano, presets de data, botoes CSV/Atualizar
- Recebe `state` + `onChange` como props

### US 2.2 -- Extrair KPI Grid

Criar `src/components/admin/engagement/EngagementKpiGrid.jsx`:
- Grid de cards com KPIs e deltas
- Recebe `data`, `prevData`, `loading` como props

### US 2.3 -- Extrair Insights Card

Criar `src/components/admin/engagement/EngagementInsights.jsx`:
- Card de insights automaticos + alertas inteligentes
- Manter a funcao `buildEngagementInsights` neste arquivo

### US 2.4 -- Extrair Charts + Drill-down

Criar `src/components/admin/engagement/EngagementCharts.jsx`:
- 3x `EngagementLineBarChart` + painel de drill-down do dia
- O componente `EngagementLineBarChart` ja pode virar arquivo proprio

### US 2.5 -- Extrair Analise de Rejeicoes

Criar `src/components/admin/engagement/RejectionAnalysis.jsx`:
- Card de ranking de motivos + painel de exemplos com thumbnails

### US 2.6 -- Orquestrador final

`AdminEngagementView.jsx` vira um orquestrador de ~150-200 linhas que:
- Gerencia estado principal e data fetching
- Renderiza os 5 subcomponentes

---

## Epic 3 -- Refatoracao do AdminModerationView (1511 linhas)

**Arquivo:** [src/components/views/AdminModerationView.jsx](src/components/views/AdminModerationView.jsx)

### US 3.1 -- Extrair Toolbar + Filtros

Criar `src/components/admin/moderation/ModerationToolbar.jsx`:
- Modo rapido, lista/grid toggle, filtros de tenant, tipo de treino, busca, ordenacao

### US 3.2 -- Extrair Queue Stats

Criar `src/components/admin/moderation/ModerationStats.jsx`:
- Cards com estatisticas da fila (pendentes, aprovados, rejeitados)

### US 3.3 -- Extrair Item Card (lista e grid)

Criar `src/components/admin/moderation/ModerationItemCard.jsx`:
- Card individual de check-in na fila (imagem, usuario, tipo, acoes)
- Suportar modo lista e grid via prop `layout`

### US 3.4 -- Extrair Batch Actions

Criar `src/components/admin/moderation/BatchActions.jsx`:
- Barra de selecao em lote + fluxo de rejeicao em massa

### US 3.5 -- Extrair Modais

Criar `src/components/admin/moderation/RejectionModal.jsx`:
- Modal de rejeicao individual (textarea, checkbox suspeito/fraude)
- Modal de confirmacao de acao

### US 3.6 -- Orquestrador final

`AdminModerationView.jsx` vira orquestrador de ~200-250 linhas.

---

## Epic 4 -- Skeleton Loading Consistente

Garantir skeleton loading em todas as views que carregam dados.

**Arquivo base:** [src/components/ui/Skeleton.jsx](src/components/ui/Skeleton.jsx)

### US 4.1 -- Criar ViewSkeleton generico

Criar `src/components/ui/ViewSkeleton.jsx`:
- Skeleton de pagina inteira (header + 3-4 cards) para usar como fallback do `Suspense`

### US 4.2 -- Skeleton no ChallengesView

Substituir o texto "Carregando..." em [src/components/views/ChallengesView.jsx](src/components/views/ChallengesView.jsx) por:
- Skeleton de 3 cards de desafio empilhados

### US 4.3 -- Skeleton no AdminEngagementView

Adicionar skeleton de KPI grid + charts no estado de loading (substituir "Carregando...").

### US 4.4 -- Skeleton no AdminObservabilityView

Unificar o `SkeletonBar` local com o componente compartilhado `Skeleton.jsx`.

### US 4.5 -- Skeleton no ProfileView (areas faltantes)

Expandir o skeleton para cobrir toda a view de perfil alem do historico de check-ins.

---

## Epic 5 -- Pull-to-Refresh Completo

**Arquivo:** [src/App.jsx](src/App.jsx), [src/components/views/ChallengesView.jsx](src/components/views/ChallengesView.jsx)

### US 5.1 -- Fix PTR no ChallengesView

O `handlePullRefresh` tem comentario vazio para `challenges`. Solucao:
- Adicionar prop `onRefresh` ao `ChallengesView`
- No `App.jsx`, passar callback que chama a funcao de reload interna do `ChallengesView`
- Usar `useImperativeHandle` ou ref callback para expor `refresh()` do `ChallengesView`

### US 5.2 -- PTR no ProfileView completo

Expandir o refresh do profile para incluir `cloud.refreshCheckins`, lista de amigos e badges.

---

## Epic 6 -- Virtualizacao de Listas Longas

**Dependencia:** `react-window` (ou `@tanstack/react-virtual`)

### US 6.1 -- Virtualizar o Feed

Em [src/components/views/FeedView.jsx](src/components/views/FeedView.jsx):
- Substituir o `.map()` por `VariableSizeList` do `react-window`
- Manter o IntersectionObserver para carregar mais paginas
- Beneficio: apenas ~5-10 posts renderizados no DOM independente do scroll

### US 6.2 -- Virtualizar o Leaderboard

Em [src/components/views/HomeView.jsx](src/components/views/HomeView.jsx):
- Se o ranking ultrapassar ~50 usuarios, usar `FixedSizeList`
- Para rankings pequenos (<50), manter renderizacao direta

### US 6.3 -- Virtualizar a fila de moderacao

Em `AdminModerationView` (apos refatoracao da Epic 3):
- Aplicar virtualizacao na lista de itens da fila

---

## Epic 7 -- Eliminar N+1 no ChallengesView

**Arquivos:** [src/components/views/ChallengesView.jsx](src/components/views/ChallengesView.jsx), nova migration SQL

### US 7.1 -- Criar RPC `get_challenges_with_counts`

Nova migration SQL com funcao que retorna desafios + contagem de participantes em uma unica query:

```sql
SELECT d.*, 
  (SELECT count(*) FROM desafio_participantes dp WHERE dp.desafio_id = d.id) AS participant_count,
  EXISTS(SELECT 1 FROM desafio_participantes dp WHERE dp.desafio_id = d.id AND dp.user_id = auth.uid()) AS is_enrolled
FROM desafios d
WHERE d.tenant_id = current_tenant_id() AND d.status IN ('active','upcoming')
ORDER BY d.start_date DESC;
```

### US 7.2 -- Atualizar ChallengesView

Substituir o loop N+1 (linhas 79-97) pela chamada unica ao novo RPC:
- Eliminar `participantCounts` state separado
- Eliminar `enrolledIds` state separado
- Usar dados vindos diretos do RPC

**Metrica de sucesso:** de N+2 queries para 1 query.

---

## Ordem de Execucao Recomendada

1. **Epic 7** (N+1) -- fix rapido, impacto imediato em performance de rede
2. **Epic 1** (Lazy loading) -- maior impacto em tempo de carregamento inicial
3. **Epic 4** (Skeletons) -- necessario como fallback do Suspense da Epic 1
4. **Epic 5** (Pull-to-refresh) -- fix rapido, UX mobile essencial
5. **Epic 2** (Refatorar Engagement) -- manutenibilidade
6. **Epic 3** (Refatorar Moderation) -- manutenibilidade
7. **Epic 6** (Virtualizacao) -- otimizacao avancada, requer dependencia nova
