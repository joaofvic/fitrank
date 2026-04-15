/**
 * Push notification handlers for the Service Worker.
 * Imported by the Workbox-generated SW via importScripts.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'FitRank', body: event.data.text() };
  }

  const title = payload.title || 'FitRank';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.svg',
    badge: '/icons/favicon.svg',
    tag: payload.type || 'default',
    renotify: true,
    data: {
      type: payload.type,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );

  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    navigator.setAppBadge().catch(() => {});
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  const TARGET_MAP = {
    like: '/feed',
    comment: '/feed',
    mention: '/feed',
    share: '/feed',
    friend_request: '/friends',
    friend_accepted: '/friends',
    badge_unlocked: '/profile',
    league_promoted: '/profile',
    training_reminder: '/checkin-modal',
    checkin_rejected: '/feed',
    checkin_approved: '/feed',
  };

  const targetPath = TARGET_MAP[data.type] || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_CLICK',
            payload: { path: targetPath, data },
          });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetPath);
    })
  );
});
