# Guia de Observabilidade -- FitRank

Stack: **Sentry** (error monitoring) + **PostHog** (product analytics + session replay).

## Variaveis de Ambiente

```bash
# .env.local (frontend)
VITE_SENTRY_DSN=https://xxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_APP_VERSION=1.0.0

# Edge Functions (Supabase secrets)
SENTRY_DSN=https://xxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX
```

## Setup do Dashboard Admin (In-App)

A tela **Observabilidade** no menu admin usa a Edge Function `admin-observability` para consultar PostHog e Sentry. Ela precisa de 5 secrets configuradas no Supabase.

### 1. Gerar Personal API Key no PostHog

1. Acesse [PostHog](https://us.posthog.com) e faca login
2. Clique no seu avatar (canto inferior esquerdo) > **Settings**
3. No menu lateral, va em **Personal API Keys**
4. Clique **Create personal API key**
5. Dê um nome (ex: `fitrank-admin-dashboard`) e clique **Create key**
6. Copie a chave gerada (comeca com `phx_`)

### 2. Obter o Project ID no PostHog

1. Em **Settings** > **Project**, o ID numerico aparece na URL: `https://us.posthog.com/project/XXXXX/settings`
2. O `XXXXX` e o seu Project ID

### 3. Gerar Auth Token no Sentry

1. Acesse [sentry.io](https://sentry.io) e faca login
2. Va em **Settings** (engrenagem) > **Auth Tokens** (menu lateral, secao Developer Settings)
3. Clique **Create New Token**
4. Marque os escopos: `project:read`, `event:read`, `org:read`
5. Clique **Create Token** e copie o valor

### 4. Obter Org e Project Slugs no Sentry

- **Org slug**: visivel na URL do Sentry: `https://sentry.io/organizations/SEU-ORG-SLUG/`
- **Project slug**: va em **Settings > Projects**, o slug aparece na lista (ex: `fitrank` ou `fitrank-frontend`)

### 5. Salvar as secrets no Supabase

Execute no terminal (ou via painel do Supabase em Edge Functions > Secrets):

```bash
supabase secrets set \
  POSTHOG_PERSONAL_API_KEY=phx_XXXXXXXXXXXXXXXXXXXXXXXX \
  POSTHOG_PROJECT_ID=12345 \
  SENTRY_AUTH_TOKEN=sntrys_XXXXXXXXXXXXXXXXXXXXXXXX \
  SENTRY_ORG_SLUG=fitrank \
  SENTRY_PROJECT_SLUG=fitrank
```

> **Opcional**: se o seu PostHog estiver hospedado em regiao EU, adicione tambem:
> ```bash
> supabase secrets set POSTHOG_HOST=https://eu.i.posthog.com
> ```
> O padrao e `https://us.i.posthog.com`.

### Verificacao

Apos salvar as secrets, abra o app como admin master, va em **Perfil > Admin > Observabilidade**. Os 4 cards devem carregar:

| Card | Fonte | Secret usada |
|------|-------|-------------|
| Usuarios Ativos (DAU/WAU/MAU) | PostHog TrendsQuery | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` |
| Funnel de Check-in | PostHog FunnelsQuery | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` |
| Erros Recentes | Sentry Issues API | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG` |
| Web Vitals | PostHog HogQLQuery | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` |

Se um card mostrar mensagem de erro (ex: "PostHog nao configurado"), verifique se a secret correspondente foi salva corretamente.

---

## 1. Sentry -- Error Monitoring

### Acesso

- Dashboard: https://sentry.io/organizations/fitrank/issues/

### Configurar Alertas (manual no painel)

Acesse **Alerts > Create Alert** e crie estas 3 regras:

#### Alerta 1: New Issue
- **When**: A new issue is created
- **Filter**: `event.tags.runtime != deno` (erros do frontend)
- **Then**: Send email notification
- **Name**: `[FitRank] Novo erro frontend`

#### Alerta 2: Error Spike
- **When**: Number of events in an issue is more than **3x** the average over **1 hour**
- **Then**: Send email notification
- **Name**: `[FitRank] Spike de erros`

#### Alerta 3: Edge Function Critical
- **When**: A new issue is created
- **Filter**: `event.tags.runtime = deno` OR `event.tags.function_name IS SET`
- **Then**: Send email notification
- **Name**: `[FitRank] Erro em Edge Function`

### Investigar um Erro

1. Abra o issue no Sentry
2. Veja o **stack trace** para localizar o arquivo/linha
3. Confira o **contexto do usuario** (sidebar direita): user ID, tenant, is_master
4. Veja os **breadcrumbs** (acoes do usuario antes do erro)
5. Se precisar, copie o **user ID** e busque o session replay no PostHog

### Tags Disponíveis

| Tag | Descricao |
|-----|-----------|
| `tenant_id` | ID da academia |
| `is_master` | Se e admin master |
| `source` | `service-worker` quando vem do SW |
| `runtime` | `deno` em Edge Functions |
| `function_name` | Nome da Edge Function |

---

## 2. PostHog -- Product Analytics

### Acesso

- Dashboard: https://us.posthog.com/project/XXXXX

### Dashboards Recomendados

Crie estes dashboards em **Dashboards > New Dashboard**:

#### Dashboard: Visao Geral
| Insight | Tipo | Configuracao |
|---------|------|-------------|
| DAU | Trends | Event: `$pageview`, count unique users, daily |
| WAU | Trends | Event: `$pageview`, count unique users, weekly |
| MAU | Trends | Event: `$pageview`, count unique users, monthly |
| Retencao | Retention | Start: `$pageview`, Return: `$pageview`, weekly |

#### Dashboard: Funnel de Check-in
| Insight | Tipo | Configuracao |
|---------|------|-------------|
| Funnel | Funnel | Steps: `checkin_started` > `checkin_submitted` > `checkin_success` |
| Taxa de erro | Trends | Event: `checkin_error`, daily |
| Breakdown | Funnel | Mesmo funnel, breakdown by `workout_type` |

#### Dashboard: Engajamento Social
| Insight | Tipo | Configuracao |
|---------|------|-------------|
| Likes/dia | Trends | Event: `social_like`, daily |
| Comments/dia | Trends | Event: `social_comment_added`, daily |
| Shares/dia | Trends | Event: `social_share`, breakdown by `share_platform` |
| Stories criados | Trends | Event: `social_story_created`, daily |
| Amizades/dia | Trends | Events: `social_friend_request_sent`, `social_friend_accepted`, daily |

#### Dashboard: Feature Adoption
| Insight | Tipo | Configuracao |
|---------|------|-------------|
| Badges desbloqueados | Trends | Event: `gamification_badge_unlocked`, daily |
| Level ups | Trends | Event: `gamification_level_up`, daily |
| Streak recoveries | Trends | Event: `gamification_streak_recovery`, daily |
| Boosts comprados | Trends | Event: `gamification_boost_purchased`, daily |
| Liga promovida | Trends | Event: `gamification_league_promoted`, breakdown by `to_league` |

#### Dashboard: Tenant Breakdown
- Qualquer insight acima pode ser filtrado por grupo `tenant`
- Use **Breakdown > Group: tenant** para ver metricas por academia

#### Dashboard: Performance
| Insight | Tipo | Configuracao |
|---------|------|-------------|
| LCP | Trends | Event: `web_vitals`, filter `metric = LCP`, avg of `value` |
| INP | Trends | Event: `web_vitals`, filter `metric = INP`, avg of `value` |
| CLS | Trends | Event: `web_vitals`, filter `metric = CLS`, avg of `value` |
| PWA installs | Trends | Event: `pwa_installed`, daily |
| Offline events | Trends | Events: `pwa_offline_detected`, `pwa_online_restored` |

### Analisar um Funnel

1. Va em **Product Analytics > New Insight > Funnel**
2. Adicione os steps (ex: `checkin_started` > `checkin_submitted` > `checkin_success`)
3. Ajuste o periodo (7d, 30d)
4. Use **Breakdown** para segmentar (por `workout_type`, `platform`, grupo `tenant`)
5. Clique em qualquer step para ver quem abandonou

### Session Replay

- **Sampling**: 10% das sessoes normais, 100% das sessoes com erro
- **Privacy**: passwords e emails mascarados; use `data-ph-mask` em elementos sensiveis
- Acesse em **Session Replay** no menu lateral
- Filtre por:
  - User ID especifico
  - Eventos (ex: "mostrar sessoes que tiveram `checkin_error`")
  - Erros (ex: "sessoes com console errors")

### Ver Replay de um Usuario Especifico

1. Copie o user ID (do Sentry, Supabase ou do proprio PostHog)
2. Va em **Session Replay**
3. Filtre: **Person > distinct_id = [user_id]**
4. Selecione a sessao desejada

---

## 3. Eventos Disponiveis

### Check-in
| Evento | Propriedades |
|--------|-------------|
| `checkin_started` | `platform` |
| `checkin_submitted` | `platform`, `workout_type` |
| `checkin_success` | `platform`, `points`, `workout_type`, `streak_day`, `leveled_up` |
| `checkin_error` | `platform`, `error_type` |

### Social
| Evento | Propriedades |
|--------|-------------|
| `social_like` / `social_unlike` | `checkin_id` |
| `social_comment_added` | `checkin_id` |
| `social_share` | `share_platform` |
| `social_story_created` | -- |
| `social_story_viewed` | `author_id` |
| `social_friend_request_sent` | -- |
| `social_friend_accepted` | -- |

### Gamification
| Evento | Propriedades |
|--------|-------------|
| `gamification_badge_unlocked` | `badge_key`, `category` |
| `gamification_level_up` | `new_level`, `xp` |
| `gamification_league_promoted` | `from_league`, `to_league` |
| `gamification_streak_recovery` | `streak_days` |
| `gamification_boost_purchased` | `points` |

### Auth
| Evento | Propriedades |
|--------|-------------|
| `auth_login` / `auth_signup` / `auth_logout` | -- |
| `auth_password_reset_requested` | -- |

### PWA
| Evento | Propriedades |
|--------|-------------|
| `pwa_install_prompted` / `pwa_installed` / `pwa_install_dismissed` | -- |
| `pwa_sw_registered` / `pwa_sw_update_available` / `pwa_sw_update_applied` | -- |
| `pwa_offline_detected` / `pwa_online_restored` | -- |

### Performance
| Evento | Propriedades |
|--------|-------------|
| `web_vitals` | `metric` (CLS/INP/LCP/TTFB), `value`, `rating` (good/needs-improvement/poor) |

---

## 4. Arquitetura dos Arquivos

```
src/lib/
  sentry.js          # Sentry SDK init + export
  posthog.js         # PostHog SDK init + identify/reset/pageview
  analytics.js       # track() wrapper + eventos nomeados
  logger.js          # logger.error/warn/info -> Sentry + console
  web-vitals.js      # Core Web Vitals -> PostHog

src/components/ui/
  ErrorBoundary.jsx  # React Error Boundary com Sentry

src/components/views/
  AdminObservabilityView.jsx  # Dashboard in-app (DAU, funnel, erros, vitals)

supabase/functions/
  admin-observability/
    index.ts         # Edge Function proxy seguro para PostHog + Sentry APIs
  _shared/
    logger.ts        # Structured JSON logging + Sentry HTTP API
```
