---
name: Advanced Fitness Features
overview: "Implementar 5 funcionalidades fitness avancadas: timer integrado, heatmap de consistencia, tracking de progresso (peso/medidas/fotos), estatisticas avancadas com graficos, e planos de treino com IA. Cada epic eh construida sobre a anterior, com a Epic 1 (schema) como fundacao."
todos:
  - id: epic-1-schema
    content: "Epic 1: Schema Foundation + Check-in Enriquecido (migration + CheckinModal + RPCs)"
    status: pending
  - id: epic-2-timer
    content: "Epic 2: Timer/Cronometro (WorkoutTimerView + standalone + integracao check-in + mini-timer)"
    status: pending
  - id: epic-3-heatmap
    content: "Epic 3: Heatmap de Consistencia (ConsistencyHeatmap SVG + ProfileView + PublicProfileView)"
    status: pending
  - id: epic-4-progress
    content: "Epic 4: Tracking de Progresso (ProgressView + medidas + fotos evolucao + comparador)"
    status: pending
  - id: epic-5-stats
    content: "Epic 5: Estatisticas Avancadas (componentes chart SVG + RPCs + StatsView + comparativo amigos)"
    status: pending
  - id: epic-6-ai-plans
    content: "Epic 6: Planos de Treino com IA (schema + Edge Function OpenAI + gerador + visualizador)"
    status: pending
isProject: false
---

# Funcionalidades Fitness Avancadas -- Plano de Implementacao

## Diagnostico Atual

- Check-in captura apenas: `tipo_treino`, `foto_url`, `feed_visible`, `feed_caption`
- **Sem** duracao, peso, medidas, series, repeticoes
- **Sem** graficos de usuario (charts apenas no admin via SVG custom)
- **Sem** heatmap de consistencia ou timeline de evolucao
- **Sem** timer/cronometro
- **Sem** biblioteca de graficos (recharts, chart.js, etc.)
- Bucket de storage existente: `checkin-photos`, `avatars`, `stories`
- Padroes de charts: SVG custom em [src/components/admin/engagement/EngagementLineBarChart.jsx](src/components/admin/engagement/EngagementLineBarChart.jsx)
- Sons/haptics ja existem: `src/lib/sounds.js`, `src/lib/haptics.js`

---

## Epic 1 -- Schema Foundation e Check-in Enriquecido

**Objetivo:** Estender o modelo de dados para suportar duracao de treino, medidas corporais e fotos de evolucao.

### US 1.1 -- Migration: Estender tabela `checkins`

Adicionar coluna `duration_seconds integer` e `notes text` em `checkins`:

```sql
ALTER TABLE checkins ADD COLUMN duration_seconds integer;
ALTER TABLE checkins ADD COLUMN notes text;
```

### US 1.2 -- Migration: Tabela `body_measurements`

```sql
CREATE TABLE body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  chest_cm numeric(5,1),
  waist_cm numeric(5,1),
  hip_cm numeric(5,1),
  bicep_cm numeric(5,1),
  thigh_cm numeric(5,1),
  calf_cm numeric(5,1),
  notes text,
  checkin_id uuid REFERENCES checkins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: usuario ve/edita somente os proprios; `is_platform_master` le todos.

### US 1.3 -- Migration: Tabela `progress_photos`

```sql
CREATE TABLE progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_type text NOT NULL DEFAULT 'front',  -- front, side, back
  taken_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Bucket `progress-photos` (privado, RLS: dono apenas). RLS na tabela identica a `body_measurements`.

### US 1.4 -- Atualizar CheckinModal

Em [src/components/views/CheckinModal.jsx](src/components/views/CheckinModal.jsx):
- Novo step opcional **"Detalhes"** apos tipo de treino:
  - Campo `duracao` (pre-preenchido se timer foi usado)
  - Campo `peso (kg)` (opcional, salva em `body_measurements` vinculado ao check-in)
  - Campo `notas` (textarea curta)
- Atualizar `useFitCloudData.js` para salvar `duration_seconds`, `notes` e inserir `body_measurements` se peso informado

### US 1.5 -- RPCs de Consulta

- `get_checkin_heatmap(p_user_id, p_year)`: retorna array de `{date, count}` para montar heatmap
- `get_body_measurements_history(p_user_id, p_limit)`: retorna medidas ordenadas por data
- `get_progress_photos(p_user_id)`: retorna fotos agrupadas por tipo e data

---

## Epic 2 -- Timer/Cronometro Integrado

**Objetivo:** Timer standalone acessivel da Home + integracao com check-in para registrar duracao.

### US 2.1 -- Componente WorkoutTimer

Criar `src/components/views/WorkoutTimerView.jsx`:
- **Modo stopwatch**: contagem progressiva (00:00 ate parar)
- **Modo countdown** (rest timer): presets 30s, 60s, 90s, 120s + custom
- Display grande central com animacao de progresso circular (SVG `circle` + `stroke-dashoffset`)
- Botoes: Play/Pause, Reset, Finalizar Treino
- `useRef` + `setInterval` para precisao; `requestAnimationFrame` para display
- Feedback: som ao final do countdown (`sounds.js`), haptic (`haptics.js`)

### US 2.2 -- Standalone na Home

Em [src/components/views/HomeView.jsx](src/components/views/HomeView.jsx):
- Botao "Iniciar Timer" ao lado do card "Hora do Treino"
- Abre `WorkoutTimerView` como view full-screen via `navigate('timer')`
- Lazy-loaded (`React.lazy`)

### US 2.3 -- Integracao com Check-in

- Ao finalizar o timer (botao "Finalizar Treino"), navegar para `CheckinModal` com `prefillDuration` como prop
- O campo `duracao` no CheckinModal vem pre-preenchido com o tempo cronometrado
- Se o usuario abrir check-in sem timer, o campo duracao fica vazio (optional)

### US 2.4 -- Mini-timer persistente

- Quando o timer esta rodando e o usuario navega para outra aba, mostrar mini-badge flutuante no canto inferior com o tempo corrente
- Clicar abre o timer full-screen novamente
- State do timer gerenciado via `useRef` no `App.jsx` (sobrevive a troca de view)

---

## Epic 3 -- Heatmap de Consistencia (estilo GitHub)

**Objetivo:** Visualizar padrao de treino em grade de 52 semanas x 7 dias.

### US 3.1 -- RPC `get_checkin_heatmap`

Ja definida na Epic 1 (US 1.5). Retorna:

```sql
SELECT checkin_local_date AS date, count(*)::int AS count
FROM checkins
WHERE user_id = p_user_id
  AND checkin_local_date >= (p_year || '-01-01')::date
  AND checkin_local_date <= (p_year || '-12-31')::date
  AND photo_review_status != 'rejected'
GROUP BY checkin_local_date
ORDER BY checkin_local_date;
```

### US 3.2 -- Componente ConsistencyHeatmap

Criar `src/components/ui/ConsistencyHeatmap.jsx`:
- Grid SVG: 52 colunas (semanas) x 7 linhas (dias)
- Escala de cores: zinc-900 (0 treinos) ate green-500 (2+ treinos)
- Labels: meses no topo, dias da semana na lateral
- Tooltip ao toque/hover: "3 treinos em 14/mar"
- Legenda: "Menos ... Mais"
- Prop `year` com seletor (ano atual / anterior)

### US 3.3 -- Integracao no ProfileView

Em [src/components/views/ProfileView.jsx](src/components/views/ProfileView.jsx):
- Nova secao "Consistencia" entre os stats e o historico de treinos
- Carrega dados via `supabase.rpc('get_checkin_heatmap', {...})`
- Skeleton dedicado durante loading
- Tambem visivel no `PublicProfileView` (perfil publico de outros usuarios)

---

## Epic 4 -- Tracking de Progresso (Medidas + Fotos de Evolucao)

**Objetivo:** Tela dedicada "Meu Progresso" com historico de medidas e comparativo de fotos.

### US 4.1 -- ProgressView (tela dedicada)

Criar `src/components/views/ProgressView.jsx`:
- Acessivel via ProfileView (botao "Meu Progresso")
- Tabs: **Medidas** | **Fotos**
- Lazy-loaded

### US 4.2 -- Tab Medidas

- **Formulario de registro**: campos para peso, % gordura, peitoral, cintura, quadril, biceps, coxa, panturrilha + notas
- Todos opcionais exceto pelo menos 1 preenchido
- **Historico**: lista de registros com data e valores principais
- **Mini-grafico inline** (sparkline SVG) mostrando tendencia do peso nos ultimos 30 dias
- Delta com registro anterior: "+0.5 kg" ou "-2 cm cintura" em verde/vermelho

### US 4.3 -- Tab Fotos de Evolucao

- **Upload**: captura/selecao de foto com seletor de tipo (frente, lado, costas) + data
- Salva no bucket `progress-photos`
- **Timeline**: grid cronologico de thumbnails agrupados por data
- **Comparador Before/After**: slider horizontal que sobrepoe duas fotos de datas diferentes
  - Componente `PhotoCompareSlider.jsx` em `src/components/ui/`
  - Selecionar duas datas para comparar

### US 4.4 -- Widget resumo no ProfileView

Em `ProfileView`, adicionar card compacto:
- Ultimo peso registrado + delta desde o anterior
- Dias desde ultima medicao
- Thumbnail da foto de evolucao mais recente
- CTA: "Registrar medidas" / "Ver progresso"

---

## Epic 5 -- Estatisticas Avancadas e Graficos

**Objetivo:** Dashboard pessoal com graficos de evolucao e comparativo com amigos.

### US 5.1 -- Componentes de grafico reutilizaveis

Criar `src/components/ui/charts/`:
- `LineChart.jsx`: grafico de linha SVG (baseado no padrao do `EngagementLineBarChart`)
- `BarChart.jsx`: grafico de barras SVG
- `DonutChart.jsx`: grafico donut/pie SVG
- `Sparkline.jsx`: mini-grafico inline SVG
- Todos com suporte a tema escuro, tooltip on touch, responsive

### US 5.2 -- RPCs de estatisticas

- `get_user_workout_stats(p_user_id, p_days)`: retorna treinos por dia (para line chart), distribuicao por tipo (para donut), total de treinos/pontos/streak max
- `get_user_weight_trend(p_user_id, p_days)`: retorna serie temporal de peso
- `get_friend_comparison(p_user_id, p_friend_ids[])`: retorna stats comparativos (treinos, pontos, streak) de N amigos

### US 5.3 -- StatsView (dashboard pessoal)

Criar `src/components/views/StatsView.jsx`:
- Acessivel via ProfileView (botao "Estatisticas") ou tab dedicada
- **Secao 1 -- Resumo**: KPI cards (treinos no mes, streak atual, streak recorde, pontos acumulados)
- **Secao 2 -- Frequencia**: LineChart mostrando treinos/semana nos ultimos 3 meses
- **Secao 3 -- Tipos de treino**: DonutChart com distribuicao percentual
- **Secao 4 -- Evolucao de peso**: LineChart com tendencia (se houver registros em `body_measurements`)
- **Secao 5 -- Comparativo com amigos**: selecionar ate 3 amigos e ver barras lado a lado (treinos, pontos, streak)
- Lazy-loaded, com pull-to-refresh

### US 5.4 -- Compartilhamento de stats

- Botao "Compartilhar resumo" que gera um card visual (screenshot via `html2canvas` ou SVG export)
- Reutilizar padroes de share do `ShareDrawer`

---

## Epic 6 -- Planos de Treino com IA

**Objetivo:** Gerar sugestoes de planos de treino personalizados com base no historico do usuario.

### US 6.1 -- Schema: tabelas de planos

```sql
CREATE TABLE workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  goal text NOT NULL,         -- 'hypertrophy', 'fat_loss', 'endurance', 'general'
  frequency_per_week int NOT NULL DEFAULT 4,
  duration_weeks int NOT NULL DEFAULT 4,
  difficulty text DEFAULT 'intermediate',
  ai_generated boolean DEFAULT true,
  status text NOT NULL DEFAULT 'active', -- active, completed, archived
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workout_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_number int NOT NULL,
  title text NOT NULL,           -- ex: "Dia 1 - Peito e Triceps"
  muscle_groups text[] NOT NULL, -- ex: {'chest','triceps'}
  exercises jsonb NOT NULL,      -- array de {name, sets, reps, rest_seconds, notes}
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: usuario ve somente os proprios planos.

### US 6.2 -- Edge Function `generate-workout-plan`

Nova Edge Function em `supabase/functions/generate-workout-plan/`:
- POST autenticado
- Recebe: `goal`, `frequency_per_week`, `available_equipment` (opcional)
- Busca contexto do usuario (ultimos 30 check-ins, tipos, frequencia, medidas recentes)
- Chama API OpenAI (GPT-4o-mini) com prompt estruturado + schema JSON
- Salva o plano gerado em `workout_plans` + `workout_plan_days`
- Retorna o plano completo
- Secret: `OPENAI_API_KEY` no Supabase

### US 6.3 -- Tela de configuracao do plano

Criar `src/components/views/WorkoutPlanGeneratorView.jsx`:
- Step 1: Selecionar objetivo (Hipertrofia, Emagrecimento, Resistencia, Geral)
- Step 2: Frequencia semanal (2x a 6x) + duracao (4, 8, 12 semanas)
- Step 3: Equipamento disponivel (academia completa, home gym, sem equipamento)
- Botao "Gerar Plano" com loading state e animacao
- Preview do plano gerado com opcao de aceitar ou regenerar

### US 6.4 -- Visualizador de plano

Criar `src/components/views/WorkoutPlanView.jsx`:
- Lista de dias da semana com exercicios
- Cada exercicio mostra: nome, series x repeticoes, descanso
- Checkbox de conclusao (salva localmente em `localStorage` por simplicidade)
- Botao "Iniciar Timer" que abre o timer com rest-timer pre-configurado para o exercicio
- Card de progresso: "Semana 2 de 4 -- 60% concluido"

### US 6.5 -- Integracao no ProfileView

- Secao "Meu Plano" no ProfileView se houver plano ativo
- Card compacto: titulo, progresso, proximo treino
- CTA: "Ver plano" ou "Gerar novo plano"

---

## Dependencias entre Epics

```
Epic 1 (Schema)
  |
  +---> Epic 2 (Timer) -- usa duration_seconds
  |
  +---> Epic 3 (Heatmap) -- usa RPC get_checkin_heatmap
  |
  +---> Epic 4 (Progresso) -- usa body_measurements + progress_photos
  |       |
  |       +---> Epic 5 (Stats) -- usa dados de todas anteriores
  |
  +---> Epic 6 (IA Plans) -- usa historico de check-ins + medidas
```

## Decisoes Tecnicas

- **Charts**: componentes SVG custom (extender padrao do `EngagementLineBarChart`), sem biblioteca externa
- **Timer**: `useRef` + `setInterval` (1s) com `requestAnimationFrame` para display; state em `App.jsx` via ref para persistir entre views
- **Fotos de evolucao**: bucket Supabase `progress-photos` com RLS; `react-easy-crop` (ja instalado) para crop antes do upload
- **IA**: OpenAI API via Edge Function, modelo `gpt-4o-mini` (custo baixo, velocidade alta); resposta em JSON Schema
- **Heatmap**: SVG puro com `rect` elements, sem dependencia extra
- **Lazy loading**: todas as novas views via `React.lazy()` + fallback skeleton
