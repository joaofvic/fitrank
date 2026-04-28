## Rollout — Ranking de desafios com privacidade (Epics 1–4)

**Objetivo**: ocultar contagem total de inscritos e controlar visibilidade do ranking:
- **Não participante**: vê **Top 3** e **somente enquanto ativo**
- **Participante**: vê **janela** (1 acima / eu / 1 abaixo) e pode abrir **ranking completo** **somente enquanto ativo**

### Migrations (ordem sugerida)
- `20260428195500_challenges_privacy_remove_counts`
- `20260428196000_desafio_ranking_public_top3_active`
- `20260428197000_desafio_ranking_participant_window`
- `20260428199000_desafio_ranking_full_active_participant`
- `20260428202000_harden_get_desafio_ranking` (hardening: impede acesso via RPC antiga)

### Checklist de validação manual

- **UI sem contagem**
  - Em `Desafios`, não aparece “X participante(s)” em nenhum card.

- **Não participante (ativo)**
  - Botão “Ver ranking” mostra **apenas 3 linhas**.
  - Não existe opção de “ranking completo”.

- **Não participante (inativo)**
  - “Ver ranking” mostra a mensagem **“Ranking disponível apenas durante o desafio.”**

- **Participante (sempre)**
  - Em “Ver ranking”, aparece “**Sua posição: #N**”.
  - Lista mostra **no máximo 3 linhas** (acima/eu/abaixo).

- **Participante (ativo)**
  - Existe CTA **“Ver ranking completo”**.
  - Ao abrir, lista completa aparece.

- **Hardening**
  - Chamar diretamente a RPC `get_desafio_ranking` como usuário **não inscrito** deve retornar **array vazio**.

### Testes automatizados (Playwright)
- Spec: `e2e/challenges-ranking-privado.spec.js`
  - não participante: Top 3 (ativo) e mensagem (inativo)
  - participante: janela + “Sua posição”
  - participante ativo: abre ranking completo

