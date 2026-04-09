# Plano — Admin Panel (Perfil de Administrador)

Este documento define o escopo do **Admin Panel** do FitRank, com foco principal em **moderação de provas de treino via fotos** (validação/rejeição) e ferramentas de gestão para **admin master da plataforma** (cross-tenant).

## Decisões já tomadas
- **Escopo do admin**: **platform_admin** (admin master, acessa todos os tenants).
- **Pontos**: entram no check-in **imediatamente**, mas podem ser **revertidos** se a foto for rejeitada, com **auditoria**.

---

## 1) Fluxo de validação de fotos (moderação)

### US-ADM-01 — Fila global de moderação (cross-tenant)
**Como** admin master  
**Quero** uma fila unificada de check-ins com foto pendentes de revisão  
**Para** revisar rapidamente, sem trocar de telas/tenants.

**Critérios de aceitação**
- Lista “**Pendentes**” com: foto (thumb), usuário, tenant/academia, data local do check-in, tipo de treino, pontos concedidos, hora de envio.
- Filtros: **tenant**, **período**, **tipo de treino**, **status** (pendente/aprovado/rejeitado), “apenas com denúncia”.
- Ordenação padrão: **mais antigos primeiro** (SLA), com opção “mais recentes”.
- Paginação/scroll infinito com pré-carregamento de thumbs.
- Busca por usuário (nome/id/email).

### US-ADM-02 — Revisão em “modo rápido” (1 item por vez)
**Como** admin  
**Quero** abrir um item em foco com ações grandes e rápidas  
**Para** reduzir tempo por validação.

**Critérios de aceitação**
- Visualização em “card expandido” com imagem grande, zoom/pan, e dados essenciais ao lado.
- Ações: **Aprovar**, **Rejeitar**, **Pular**.
- Ao aprovar/rejeitar: avança automaticamente para o próximo item (sem reload completo).
- Se outro admin revisou o item: UI mostra “já revisado” e impede conflito (lock otimista/back-end).

### US-ADM-03 — Feed em grade (revisão em lote visual)
**Como** admin  
**Quero** ver várias fotos em grade  
**Para** identificar rapidamente inválidas e agir em lote.

**Critérios de aceitação**
- Grid com thumbs e badges (tenant, pontos, tipo).
- Seleção múltipla (checkbox + shift-click).
- Ação em lote: **aprovar selecionados** / **rejeitar selecionados** (rejeição pede motivo).
- Mostra contador “X selecionados”.

### US-ADM-04 — Atalhos de teclado (speed moderation)
**Como** admin  
**Quero** atalhos de teclado consistentes  
**Para** reduzir cliques repetitivos.

**Critérios de aceitação**
- Atalhos no modo rápido:
  - `A`: aprovar
  - `R`: rejeitar (abre modal)
  - `S` ou `P`: pular
  - `←/→`: anterior/próximo
  - `Z`: zoom toggle
- Tooltip/legenda de atalhos visível e opção de desativar.

### US-ADM-05 — SLA e prioridade
**Como** admin  
**Quero** priorização por tempo pendente e/ou risco  
**Para** manter filas controladas.

**Critérios de aceitação**
- Badge “pendente há X horas/dias”.
- Ordenações: “mais antigos”, “maior risco” (ex.: denunciados, usuário novo, tenant com alta fraude).
- Métrica no topo: pendentes total + pendentes > 24h.

### US-ADM-06 — Contexto do usuário (recomendado)
**Como** admin  
**Quero** ver contexto do usuário  
**Para** decidir com mais segurança.

**Critérios de aceitação**
- Painel lateral com mini-histórico do usuário (últimos check-ins, taxa de rejeição, denúncias).
- Link para perfil do usuário e histórico do tenant.

---

## 2) Tratamento de rejeições (feedback e consistência)

### US-ADM-07 — Rejeição com motivos padronizados
**Como** admin  
**Quero** selecionar um motivo pré-definido ao rejeitar  
**Para** dar feedback claro e gerar métricas de fraude/qualidade.

**Critérios de aceitação**
- Modal de rejeição com:
  - Lista de motivos (**obrigatório** escolher 1)
  - Campo “observação” (opcional; **obrigatório** quando motivo = “Outro”)
  - Toggle “marcar como suspeito/fraude” (opcional)
- Motivos sugeridos (MVP):
  - Foto ilegível/escura
  - Não comprova atividade
  - Foto duplicada/reutilizada
  - Conteúdo impróprio
  - Foto de tela/print
  - Tipo de treino não condizente
  - Outro (exige observação)
- O usuário recebe motivo (e observação, se existir) na UI/notificação.

### US-ADM-08 — Reversão de pontos automática e auditável
**Como** admin  
**Quero** que rejeitar reverta os pontos daquele check-in (e streak se aplicável)  
**Para** manter ranking correto.

**Critérios de aceitação**
- Ao rejeitar: sistema aplica ajuste que **subtrai** os pontos concedidos por aquele check-in.
- Mantém trilha: quem rejeitou, quando, motivo, antes/depois dos pontos.
- Evita dupla reversão (idempotência).
- Regra de streak explícita (ex.: rejeitar remove o dia do histórico e recalcula streak).

### US-ADM-09 — Reconsideração (desfazer rejeição)
**Como** admin  
**Quero** reverter uma decisão (reaprovar)  
**Para** corrigir erros operacionais.

**Critérios de aceitação**
- Tela de itens “Rejeitados” com busca e filtros.
- Ação “**Reaprovar**” que reaplica pontos (com auditoria).
- Mostra histórico de decisões (aprovações/rejeições).

### US-ADM-10 — Comunicação opcional ao usuário (templates)
**Como** admin  
**Quero** mandar uma mensagem curta ao usuário (template)  
**Para** reduzir reincidência.

**Critérios de aceitação**
- Templates rápidos (“Envie foto mais clara”, “Mostre o movimento”, etc.).
- Logs das mensagens enviadas.

---

## 3) Gestão geral (admin master)

### US-ADM-11 — Gestão de usuários (cross-tenant)
**Como** admin master  
**Quero** buscar e administrar usuários  
**Para** resolver problemas e garantir integridade.

**Critérios de aceitação**
- Lista/busca por: nome, email, user_id, tenant.
- Ações:
  - Ver perfil completo e histórico de check-ins
  - Ver “taxa de aprovação”, “taxa de rejeição”, “motivos mais comuns”
  - Resetar flags (ex.: “sob revisão”)
  - (Opcional) desativar/banir usuário (soft-delete/ban flag) com motivo

### US-ADM-12 — Ajustes de ranking e correções manuais (com trilha)
**Como** admin  
**Quero** corrigir pontuação quando houver erro sistêmico  
**Para** manter confiança no ranking.

**Critérios de aceitação**
- Ação “Ajustar pontos” por usuário (crédito/débito) com:
  - valor, motivo, referência (link/check-in), admin responsável
- Ajuste aparece em um “ledger” (extrato de pontos).
- Preferir ajuste via ledger (não editar “pontos” diretamente), e recalcular totais quando necessário.

### US-ADM-13 — Operação por tenant
**Como** admin master  
**Quero** operar por tenant quando preciso  
**Para** lidar com incidentes localizados.

**Critérios de aceitação**
- Seleção rápida de tenant e visão “pendentes do tenant”.
- Métricas por tenant: pendentes, tempo médio de moderação, % rejeição, reincidência.

### US-ADM-14 — Monitoramento de engajamento (dashboard)
**Como** admin  
**Quero** acompanhar engajamento e saúde do produto  
**Para** agir preventivamente.

**Critérios de aceitação**
- KPIs (por período e por tenant):
  - check-ins/dia, usuários ativos/dia, novos cadastros
  - taxa de check-in com foto
  - tempo médio até moderação
  - taxa de rejeição e top motivos
- Gráficos simples + export CSV.

### US-ADM-15 — Auditoria e segurança operacional
**Como** admin  
**Quero** um log de ações administrativas  
**Para** rastrear decisões e evitar abuso.

**Critérios de aceitação**
- Log imutável: admin_id, ação, alvo (user/checkin/tenant), payload mínimo, timestamp.
- Filtros por admin/tenant/período.
- Alertas (opcional): spikes de rejeição, admin com volume anormal.

### US-ADM-16 — Configurações de moderação
**Como** admin  
**Quero** configurar motivos de rejeição e políticas  
**Para** adaptar às regras da plataforma.

**Critérios de aceitação**
- CRUD de “motivos de rejeição” (ativar/desativar, ordem).
- Políticas:
  - auto-flag para usuário com X rejeições em Y dias
  - exigir foto para certos tipos de treino (se aplicável)

---

## Recomendações de UX/Performance (operacional)
- **Dois modos complementares**: “Modo rápido” (1 item) + “Grid em lote”.
- **Aprovação como ação padrão**: UX e teclado focados em reduzir cliques.
- **Conflitos multi-admin**: lock otimista e mensagens claras (“já revisado”).
- **Imagens**: thumbs pequenas e carregar full só no item em foco; cache de imagens; lazy-load.

---

## Pendência de produto (para fechar o MVP)
- A plataforma exige **foto para todo check-in**, ou apenas para certos tipos/usuários (ex.: usuário novo, desafios, tenants específicos)?

