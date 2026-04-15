---
name: Web Push + Backend Dispatch
overview: Implementar Epic 4 (Edge Function send-push + trigger pg_net) e Epic 3 (Web Push com Service Worker customizado, registro de tokens VAPID e hook unificado), completando o pipeline push notifications end-to-end para a PWA.
todos:
  - id: us4.1-send-push
    content: "US 4.1: Criar Edge Function send-push + modulo web-push.ts compartilhado"
    status: completed
  - id: us4.2-trigger
    content: "US 4.2: Migration SQL com pg_net extension + trigger notify_push_on_insert"
    status: completed
  - id: us4.3-type-map
    content: "US 4.3: Mapeamento type -> categoria de preferencia (dentro de send-push)"
    status: completed
  - id: us3.2-sw
    content: "US 3.2: Criar src/sw.js customizado + migrar vite.config.js para injectManifest"
    status: completed
  - id: us3.1-register
    content: "US 3.1: Criar src/lib/web-push-register.js (registro de token Web Push)"
    status: completed
  - id: us3.3-hook
    content: "US 3.3: Criar hook usePushNotifications.js unificado"
    status: completed
  - id: env-vars
    content: Atualizar .env.example com VITE_VAPID_PUBLIC_KEY
    status: completed
isProject: false
---

# Web Push + Backend de Despacho (Epics 3 e 4)

## Ordem de implementacao

Epic 4 primeiro (backend), depois Epic 3 (client web push). Sem o backend, os tokens registrados nao recebem nada.

## Decisao arquitetural: Web Push nativo vs Firebase JS SDK

- **Abordagem escolhida**: Web Push API nativa (`PushManager.subscribe()`) com VAPID keys, SEM Firebase JS SDK no cliente
- **Motivo**: evita dependencia pesada (~50KB gzipped), segue o principio do projeto de nao instalar pacotes sem necessidade explicita
- **Impacto no backend**: a Edge Function `send-push` tera dual dispatch:
  - Tokens `android`/`ios` -> FCM HTTP v1 API (quando Epic 2 for implementada)
  - Tokens `web` -> Web Push protocol (VAPID + criptografia via Web Crypto API)

## Variaveis de ambiente necessarias

Adicionar ao `.env.example` e `.env.local` (placeholders ate Firebase ser configurado):

```
VITE_VAPID_PUBLIC_KEY=<your-vapid-public-key>
```

No Supabase (secrets para Edge Functions):

```
VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:contato@fitrank.app
```

---

## Epic 4 -- Backend de Despacho

### US 4.1 -- Edge Function `send-push`

Criar [supabase/functions/send-push/index.ts](supabase/functions/send-push/index.ts):

- Rota `POST` com validacao zod: `{ user_id, title, body, data?, type }`
- Autenticacao via header `Authorization: Bearer <service_role_key>` (chamada interna via pg_net)
- Busca tokens em `push_tokens` WHERE `user_id`
- Busca preferencias em `push_preferences` WHERE `user_id`
- Filtragem:
  - `enabled === false` -> skip tudo
  - Mapear `type` para categoria (`social`, `friends`, `achievements`, `admin`) -> checar boolean
  - Quiet hours: se `quiet_start`/`quiet_end` definidos e hora atual entre eles -> skip
- Dispatch por platform:
  - `web`: Web Push protocol usando VAPID + Web Crypto API do Deno (sem npm packages)
  - `android`/`ios`: FCM HTTP v1 API com Google service account JWT (placeholder/skip se secret nao configurado)
- Tokens invalidos (410 Gone / FCM UNREGISTERED): deletar de `push_tokens`
- Retorno: `{ sent: N, failed: N, skipped: string[] }`

Modulo auxiliar [supabase/functions/_shared/web-push.ts](supabase/functions/_shared/web-push.ts):
- Funcoes de criptografia Web Push: ECDH, HKDF, AES-128-GCM usando `globalThis.crypto.subtle`
- Construcao do JWT VAPID (header ES256)
- Funcao `sendWebPush(subscription, payload, vapidKeys)` que monta e envia o request

### US 4.2 -- Trigger `notify_push_on_insert`

Criar nova migration SQL:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'type',    NEW.type,
      'title',   NEW.title,
      'body',    COALESCE(NEW.body, ''),
      'data',    NEW.data
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();
```

**Nota**: `pg_net` ja vem habilitado no Supabase hosted. As config vars `app.settings.supabase_url` e `app.settings.service_role_key` sao automaticas no Supabase.

### US 4.3 -- Mapeamento tipo -> categoria

Dentro de `send-push`, constante:

```typescript
const TYPE_TO_CATEGORY: Record<string, string> = {
  like: 'social', comment: 'social', mention: 'social', share: 'social',
  friend_request: 'friends', friend_accepted: 'friends',
  badge_unlocked: 'achievements', league_promoted: 'achievements',
  streak_recovered: 'achievements', boost_purchased: 'achievements',
  admin_message: 'admin', checkin_photo_rejected: 'admin',
  checkin_rejected: 'admin', checkin_approved: 'admin',
};
```

---

## Epic 3 -- Web Push (PWA / Service Worker)

### US 3.1 -- Registro de Web Push Token

Criar [src/lib/web-push-register.js](src/lib/web-push-register.js):

- Funcao `registerWebPush(supabase, userId)`:
  - Guard: `!('PushManager' in window)` -> return null
  - `Notification.requestPermission()` -> se denied, return null
  - Obter SW registration: `navigator.serviceWorker.ready`
  - `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })`
  - Converter subscription para JSON (endpoint + keys.p256dh + keys.auth)
  - Upsert em `push_tokens`: token = `JSON.stringify(subscription)`, platform = 'web'
- Funcao `unregisterWebPush(supabase)`:
  - `pushSubscription.unsubscribe()`
  - Delete do `push_tokens`
- Helper `urlBase64ToUint8Array(base64String)`

### US 3.2 -- Service Worker customizado com Push Handler

**Mudanca critica**: Migrar `vite-plugin-pwa` de `generateSW` para `injectManifest`.

Criar [src/sw.js](src/sw.js):

```javascript
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Workbox precaching (placeholder preenchido pelo vite-plugin-pwa no build)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
self.clients.claim();

// Runtime caching (migrado do vite.config.js)
registerRoute(/supabase\.co\/rest\/v1\//, new NetworkFirst({ ... }));
registerRoute(/supabase\.co\/storage\//, new CacheFirst({ ... }));
registerRoute(/supabase\.co\/functions\//, new NetworkOnly());
registerRoute(/supabase\.co\/auth\//, new NetworkOnly());

// Push handler
self.addEventListener('push', (event) => { ... });

// Notification click handler
self.addEventListener('notificationclick', (event) => { ... });
```

Atualizar [vite.config.js](vite.config.js):

```javascript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.js',
  registerType: 'autoUpdate',
  manifest: false,
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
  },
  devOptions: { enabled: false }
})
```

**Importante**: a config `workbox.runtimeCaching` sai do `vite.config.js` e vai para dentro do `src/sw.js` (com Workbox APIs).

### US 3.3 -- Hook unificado `usePushNotifications.js`

Criar [src/hooks/usePushNotifications.js](src/hooks/usePushNotifications.js):

- Recebe `{ supabase, session, profile }`
- Detecta plataforma: `Capacitor.isNativePlatform()` vs web
- Para web: importa e usa `registerWebPush` / `unregisterWebPush`
- Estado: `permissionStatus` ('prompt' | 'granted' | 'denied'), `isRegistered`
- `requestPermission()`: chama o flow de registro
- `removeToken()`: para uso no logout
- Respeita "nao perturbe": localStorage flag `push_dismissed_until` com 7 dias
- Retorna `{ permissionStatus, isRegistered, requestPermission, removeToken }`

---

## Arquivos criados/modificados

| Acao | Arquivo |
|------|---------|
| CRIAR | `supabase/functions/send-push/index.ts` |
| CRIAR | `supabase/functions/_shared/web-push.ts` |
| CRIAR | migration SQL (pg_net + trigger) |
| CRIAR | `src/lib/web-push-register.js` |
| CRIAR | `src/sw.js` |
| CRIAR | `src/hooks/usePushNotifications.js` |
| EDITAR | `vite.config.js` (generateSW -> injectManifest) |
| EDITAR | `.env.example` (adicionar VITE_VAPID_PUBLIC_KEY) |
| EDITAR | `src/lib/register-sw.js` (ajustar se necessario para injectManifest) |

## Riscos e mitigacoes

- **Web Crypto no Deno**: ECDH e AES-GCM sao suportados nativamente pelo Deno. Testado com `crypto.subtle.generateKey/deriveKey/encrypt`
- **`pg_net` no Supabase hosted**: ja vem habilitado, so precisa de `CREATE EXTENSION IF NOT EXISTS`
- **`app.settings` config vars**: Supabase popula automaticamente `supabase_url` e `service_role_key` -- nao requer configuracao manual
- **VAPID keys nao configuradas**: o codigo tera guards que logam warning e retornam gracefully quando as keys nao estao presentes
- **injectManifest migration**: a mudanca de `generateSW` para `injectManifest` requer que TODA a config de runtime caching seja migrada para o SW source file. Testar o build apos a mudanca