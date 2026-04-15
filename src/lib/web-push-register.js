/**
 * Web Push registration utilities.
 * Subscribes the browser to push notifications via the Push API (VAPID)
 * and persists the subscription token in the push_tokens table.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} [tenantId]
 * @returns {Promise<PushSubscription | null>}
 */
export async function registerWebPush(supabase, userId, tenantId) {
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
    console.warn('Web Push not supported in this browser');
    return null;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY not configured');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.info('Push notification permission denied');
    return null;
  }

  const registration = await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const tokenPayload = JSON.stringify(subscription.toJSON());

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      tenant_id: tenantId ?? null,
      token: tokenPayload,
      platform: 'web',
      device_info: getDeviceInfo(),
    },
    { onConflict: 'token' }
  );

  if (error) {
    console.error('Failed to save push token', error);
    return null;
  }

  return subscription;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<void>}
 */
export async function unregisterWebPush(supabase) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const tokenPayload = JSON.stringify(subscription.toJSON());

      await supabase
        .from('push_tokens')
        .delete()
        .eq('token', tokenPayload);

      await subscription.unsubscribe();
    }
  } catch (err) {
    console.error('Failed to unregister web push', err);
  }
}

/**
 * @returns {Promise<'granted' | 'denied' | 'default' | 'unsupported'>}
 */
export function getWebPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * @returns {Promise<PushSubscription | null>}
 */
export async function getExistingSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}
