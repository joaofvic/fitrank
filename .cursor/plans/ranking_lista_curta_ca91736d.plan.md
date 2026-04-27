---
name: ranking_lista_curta
overview: Reduzir o ranking exibido (Top 10) mantendo a colocação do usuário via um card "Sua posição", sem precisar carregar todos os perfis.
todos:
  - id: backend-rpcs
    content: Adicionar RPCs Top N + minha posição (geral e liga) via migrations Supabase.
    status: completed
  - id: hook-dataflow
    content: Atualizar `useFitCloudData` para buscar e expor topUsers + myRankUser (geral e liga).
    status: completed
  - id: ui-homeview
    content: Atualizar `HomeView` para renderizar Top 10 + card “Sua posição” sem duplicar.
    status: completed
  - id: wiring-app
    content: Ajustar `App.jsx` para passar as novas props do ranking.
    status: completed
  - id: perf-security
    content: Revisar payload, dedupe, logs e campos expostos; validar performance e segurança.
    status: completed
isProject: false
---

# Plano: Ranking enxuto com "Sua posição"

## Contexto atual (estado do código)
- A Home renderiza o ranking em `src/components/views/HomeView.jsx`, usando `displayUsers = (rankingTab === 'league' ? leagueUsers : allUsers)`.
- No modo cloud, `allUsers` vem de `useFitCloudData` via RPC `get_tenant_leaderboard_period` (retorna **todos** os perfis do tenant, ordenados por pontos) e `leagueUsers` vem de `get_league_leaderboard`.
- Há virtualização acima de 50 itens, mas **continua pesado** (muitos dados e muito ruído na UI) e não resolve o problema de “lista extensa”.

## Objetivo de regra de negócio (decisão)
- Exibir apenas **Top 10** do ranking (geral e da liga).
- Exibir sempre um card fixo **"Sua posição"** com:
  - `rank` (colocação global/liga)
  - `pontos` do período
  - indicadores já existentes (avatar, nível, liga, pro, academia)
- Evitar duplicação: se o usuário estiver no Top 10, o card “Sua posição” vira “Você está no Top 10” (ou simplesmente não aparece).

## Epic 1 — Backend: APIs de ranking "Top N + minha posição"
### US-1.1 — Criar RPC para Top N (geral)
- Criar uma função SQL (migration nova) como `public.get_tenant_leaderboard_top_period(p_start date, p_end date, p_period text default null, p_limit int default 10)`.
- Implementação:
  - Reaproveitar a lógica de pontos atual (CTEs `checkin_agg` + `ledger_agg`) usada em `public.get_tenant_leaderboard_period` (ver migration `supabase/migrations/20260414200700_leagues.sql`).
  - `ORDER BY pontos DESC, id ASC`.
  - `LIMIT p_limit`.
- Segurança:
  - Manter `security definer` + `where tenant_id = current_tenant_id()`.
  - Garantir que a função não aceita SQL dinâmico.

### US-1.2 — Criar RPC para “minha posição” (geral)
- Criar `public.get_my_tenant_rank_period(p_start date, p_end date, p_period text default null)`.
- Implementação sugerida:
  - Construir um CTE `base` com todos os atletas do tenant e seus pontos (mesma agregação), e calcular `row_number() over (order by pontos desc, id asc) as rank`.
  - Retornar apenas a linha `where id = auth.uid()`.
- Retorno deve incluir os mesmos campos necessários para o card.

### US-1.3 — Repetir para ranking por liga
- Criar equivalentes:
  - `public.get_league_leaderboard_top(p_start, p_end, p_period, p_limit)`
  - `public.get_my_league_rank_period(p_start, p_end, p_period)`
- Critério de liga: igual ao atual `get_league_leaderboard` (liga do caller via `profiles where id = auth.uid()`).

### US-1.4 — Compatibilidade e rollout
- Manter RPCs antigas (`get_tenant_leaderboard_period`, `get_league_leaderboard`) por um tempo.
- Feature flag no front (config) para alternar entre “ranking completo” e “ranking enxuto” durante validação.
- **Implementado:** variável de ambiente build-time `VITE_RANKING_LIST_MODE`:
  - `compact` (padrão se ausente ou inválido): `get_tenant_leaderboard_top_period` + `get_my_tenant_rank_period` e equivalentes de liga.
  - `full`: `get_tenant_leaderboard_period` e `get_league_leaderboard`; `myLeaderboardEntry` / `myLeagueLeaderboardEntry` ficam `null` (lista completa na UI; card “Sua posição” não aparece). Ver `.env.example` e `useFitCloudData` (`rankingListMode`).

## Epic 2 — Frontend: UI e fluxo de dados
### US-2.1 — Atualizar `useFitCloudData` para buscar Top 10 e “minha posição”
- Arquivo: `src/hooks/useFitCloudData.js`.
- Alterar `refreshLeaderboard` para chamar **duas RPCs** em paralelo:
  - top 10 (geral)
  - minha posição (geral)
- Fazer o mesmo para `refreshLeagueRanking`.
- Montar novo estado:
  - `leaderboardTop` (array)
  - `myLeaderboardEntry` (obj ou null)
  - `leagueLeaderboardTop` e `myLeagueLeaderboardEntry`
- Regra de dedupe:
  - Se `myLeaderboardEntry.uid` estiver no `leaderboardTop`, não exibir card extra.

### US-2.2 — Ajustar `HomeView` para renderizar Top 10 + card “Sua posição”
- Arquivo: `src/components/views/HomeView.jsx`.
- Alterar props de entrada:
  - trocar `allUsers` -> `topUsers`
  - adicionar `myRankUser`
  - idem para liga.
- UI:
  - Se `myRankUser` existir e não estiver no Top 10, renderizar uma seção fixa abaixo do Top 10:
    - título “Sua posição”
    - reutilizar `RankingRow` (passando `idx = myRankUser.rank - 1` ou criar `RankingRow` que aceite `rank` explícito para evitar confusão de índice).

### US-2.3 — Ajustar `App.jsx` (wiring)
- Arquivo: `src/App.jsx`.
- Trocar o mapeamento do hook para as novas props do `HomeView`.

## Epic 3 — Observabilidade, qualidade e performance
### US-3.1 — Logging e métricas leves
- Em `useFitCloudData`, logar erros das novas RPCs com contexto (`period`, `tab`, `tenantId`) sem vazar dados sensíveis.

### US-3.2 — Performance
- Benefício esperado: reduzir payload e render.
- Otimização adicional (opcional): cache em memória por período/tab por alguns segundos para evitar chamadas repetidas em navegação.

## Epic 4 — Segurança e privacidade
### US-4.1 — Controle de exposição de dados
- Revisar campos retornados pelas RPCs novas para expor apenas o necessário (ex: evitar e-mail/identificadores além de `id` + display).
- Confirmar que `security definer` está com `set search_path = public` e sem funções perigosas.

## Test plan (essencial)
- Validar: usuário fora do Top 10 vê Top 10 + “Sua posição”.
- Validar: usuário dentro do Top 10 não vê card duplicado.
- Validar: aba “Liga” aplica a mesma regra.
- Validar: troca de período (dia/semana/mês) mantém coerência da posição.
