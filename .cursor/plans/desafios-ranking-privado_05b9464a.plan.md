---
name: desafios-ranking-privado
overview: "Ocultar a contagem total de inscritos e ajustar a visibilidade do ranking do desafio: não participantes veem apenas Top 3 (somente quando ativo). Participantes veem sua posição com contexto (1 acima e 1 abaixo) e podem abrir o ranking completo somente enquanto o desafio estiver ativo (sem exibir contagem)."
todos:
  - id: hide-counts-ui
    content: Remover/ajustar UI para não mostrar total de inscritos e evitar inferência.
    status: completed
  - id: rpc-challenges-no-count
    content: Atualizar RPC de listagem de desafios para não retornar contagem (ou substituir por booleano).
    status: completed
  - id: rpc-ranking-public-top3
    content: Criar RPC pública Top 3 somente para não participantes e apenas enquanto ativo.
    status: completed
  - id: rpc-ranking-participant-window
    content: Criar RPC de janela do ranking para participante (1 acima/eu/1 abaixo) com my_rank.
    status: completed
  - id: rpc-ranking-participant-full-active
    content: Criar RPC de ranking completo apenas para participante e apenas enquanto ativo (sem contagem).
    status: completed
  - id: qa-tests-docs
    content: Adicionar E2E Playwright e docs/checklist de rollout.
    status: completed
isProject: false
---

# Plano faseado: Ranking de desafios com privacidade

## Contexto atual (onde mexer)
- Tela de desafios usa `get_challenges_with_counts` e exibe `participant_count` em [`src/components/views/ChallengesView.jsx`](src/components/views/ChallengesView.jsx) (linhas ~58–64 e ~245–255).
- Ranking do desafio é carregado via RPC `get_desafio_ranking(p_desafio_id)` e renderiza a lista completa hoje em [`src/components/views/ChallengesView.jsx`](src/components/views/ChallengesView.jsx) (linhas ~81–93 e ~350–392).
- RPC atual `get_desafio_ranking` retorna todos os participantes ordenados por pontos em [`supabase/migrations/20250409120000_epic_2_leaderboard_desafio_storage.sql`](supabase/migrations/20250409120000_epic_2_leaderboard_desafio_storage.sql).

## Decisões confirmadas
- **Não participantes**: ver **apenas Top 3** e **somente enquanto o desafio estiver ativo**.
- **Participantes**: ver **1 acima + eu + 1 abaixo**, com opção de **abrir ranking completo somente enquanto ativo**.

## Epic 1 — Remover contagem total de inscritos (privacidade)
### US-1.1 — Ocultar contagem na UI
- Remover da UI o trecho que mostra `{count} participante(s)`.
- Arquivo: [`src/components/views/ChallengesView.jsx`](src/components/views/ChallengesView.jsx).

### US-1.2 — Remover `participant_count` do payload público
- Atualizar a RPC `get_challenges_with_counts` para **não retornar** `participant_count` (e também não retornar `max_participantes` se isso permitir inferência do total; manter apenas o que for necessário para inscrição/UX).
- Se a UI precisar saber se está “lotado”, substituir por um booleano **`is_full`** calculado no servidor, sem expor contagem.
- Arquivo: migration nova em `supabase/migrations/` (criar `create or replace function` + grants).

**Critérios de aceite**
- Não existe nenhum lugar na UI do app (não-admin) mostrando total de inscritos.
- Payload público não contém contagem total.

## Epic 2 — Ranking para não participantes (Top 3 somente quando ativo)
### US-2.1 — Criar RPC pública `get_desafio_ranking_public`
- Nova RPC (security definer) que:
  - Valida tenant via `current_tenant_id()`.
  - Verifica se o desafio está ativo (ou pela regra `data_fim`/`ativo`/`status`, conforme schema).
  - Retorna **somente Top 3** (campos públicos: `user_id`, `nome_exibicao`, `pontos_desafio`, `avatar_url` se existir no schema do ranking).
  - Se desafio não está ativo: retorna array vazio.
- Arquivo: migration nova.

### US-2.2 — UI: quando não inscrito, usar RPC pública
- No `ChallengesView`, quando `!is_enrolled`:
  - O botão “Ver ranking” carrega e exibe apenas Top 3.
  - Se o desafio não estiver ativo, exibir mensagem curta (ex: “Ranking disponível apenas durante o desafio”).

**Critérios de aceite**
- Não participante nunca recebe ranking completo.
- Não participante não consegue inferir total por paginação/offset.

## Epic 3 — Ranking para participantes (minha posição + 1 acima/1 abaixo)
### US-3.1 — Criar RPC `get_my_desafio_ranking_window(p_desafio_id, p_window)`
- RPC retorna apenas:
  - `me` (linha do usuário)
  - `above` (até 1 usuário acima)
  - `below` (até 1 usuário abaixo)
  - `my_rank` (posição numérica)
- Implementação sugerida:
  - Calcular ranking com `row_number()` sobre `pontos_desafio desc, user_id asc`.
  - Selecionar apenas ranks `my_rank-1`, `my_rank`, `my_rank+1`.
- Campos públicos: `user_id`, `nome_exibicao`, `pontos_desafio`, `is_me`.
- Arquivo: migration nova.

### US-3.2 — UI: renderizar “sua posição” + contexto
- Quando `is_enrolled`:
  - Mostrar card fixo “Sua posição” com `#my_rank`.
  - Mostrar lista com 1 acima, eu, 1 abaixo.
  - Se o usuário for 1º: não há “acima”. Se for último: não há “abaixo”.

**Critérios de aceite**
- Participante vê sua posição sem ver lista completa.
- Participante não recebe contagem total.

## Epic 4 — Participante: ranking completo (somente enquanto ativo)
> Observação: mesmo sem exibir contagem total, ao ver a lista completa o usuário pode **inferir** o total pelo tamanho da lista. O requisito aqui é **ocultar a contagem explícita** e impedir endpoints de contagem/paginação para não participantes.

### US-4.1 — Criar RPC `get_desafio_ranking_full_active(p_desafio_id)`
- Nova RPC (security definer) que:\n  - Valida tenant via `current_tenant_id()`.\n  - Verifica se o desafio está ativo.\n  - Verifica se `auth.uid()` está inscrito em `desafio_participantes`.\n  - Retorna o ranking completo (mesmos campos públicos do ranking), ordenado por pontos.\n  - Se desafio não estiver ativo ou usuário não for participante: retorna array vazio.
- Arquivo: migration nova.

### US-4.2 — UI: botão “Ver ranking completo” (apenas participante e ativo)
- No `ChallengesView`, quando `is_enrolled` e o desafio está ativo:\n  - Exibir um CTA “Ver ranking completo”.\n  - Ao abrir, carregar via `get_desafio_ranking_full_active`.
- Quando não ativo: ocultar CTA.

**Critérios de aceite**
- Participante consegue consultar ranking completo somente durante o desafio.\n- Não participante nunca acessa ranking completo.

## Epic 5 — Endurecimento e QA (Epic E)
### US-5.1 — Hardening anti-inferência
- Garantir que nenhuma RPC pública retorne `count`, `total`, `limit/offset` que permita inferir total.
- Rever respostas para não conter `max_participantes`+sinais que revelem total.

### US-5.2 — Testes E2E (Playwright)
- Adicionar testes cobrindo:
  - Não participante vê Top 3 apenas (e vazio quando inativo).
  - Participante vê “Sua posição” e somente 3 linhas (acima/eu/abaixo).
  - Participante (ativo) consegue abrir ranking completo.
  - A UI não renderiza contagem de participantes.
- Arquivos: `e2e/` (Playwright já configurado no repo).

### US-5.3 — Checklist de rollout
- Documentar:
  - Migrações aplicadas
  - RPCs/grants
  - Test plan manual
- Arquivo: `docs/`.

## Arquivos principais previstos
- Frontend
  - [`src/components/views/ChallengesView.jsx`](src/components/views/ChallengesView.jsx)
- Supabase (migrations)
  - Nova migration para atualizar `get_challenges_with_counts`.
  - Nova migration para `get_desafio_ranking_public`.
  - Nova migration para `get_my_desafio_ranking_window`.
  - Nova migration para `get_desafio_ranking_full_active`.
- Testes
  - `e2e/` novos specs.
- Docs
  - `docs/` guia de rollout/QA.

## Notas de segurança
- A lógica “participante vs não participante” deve ser decidida no servidor (via `exists` em `desafio_participantes` para `auth.uid()`), não no client.
- Para não participantes, limitar estritamente Top 3 e não expor endpoints pagináveis.
