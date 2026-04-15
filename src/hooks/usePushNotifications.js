import { useState, useEffect, useCallback, useRef } from 'react';
import {
  registerWebPush,
  unregisterWebPush,
  getWebPushPermission,
  getExistingSubscription,
} from '../lib/web-push-register.js';

const DISMISS_KEY = 'push_dismissed_until';
const DISMISS_DAYS = 7;

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient | null;
 *   session: object | null;
 *   profile: { id: string; tenant_id?: string } | null;
 *   navigate?: (view: string) => void;
 * }} opts
 */
export function usePushNotifications({ supabase, session, profile, navigate }) {
  const [permissionStatus, setPermissionStatus] = useState(() => getWebPushPermission());
  const [isRegistered, setIsRegistered] = useState(false);
  const cleanupDone = useRef(false);

  useEffect(() => {
    setPermissionStatus(getWebPushPermission());

    if (!supabase || !session || !profile) {
      setIsRegistered(false);
      return;
    }

    getExistingSubscription().then((sub) => {
      setIsRegistered(Boolean(sub));
    });
  }, [supabase, session, profile]);

  // Listen for notification click messages from the Service Worker
  useEffect(() => {
    if (!navigate) return;

    const handler = (event) => {
      if (event.data?.type === 'PUSH_NOTIFICATION_CLICK') {
        const path = event.data.payload?.path;
        if (path) navigate(path === '/' ? 'home' : path.replace('/', ''));
      }
    };

    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [navigate]);

  const requestPermission = useCallback(async () => {
    if (!supabase || !profile) return false;

    const sub = await registerWebPush(supabase, profile.id, profile.tenant_id);
    const granted = Boolean(sub);

    setPermissionStatus(getWebPushPermission());
    setIsRegistered(granted);

    if (!granted) {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
      );
    }

    return granted;
  }, [supabase, profile]);

  const removeToken = useCallback(async () => {
    if (!supabase) return;
    await unregisterWebPush(supabase);
    setIsRegistered(false);
  }, [supabase]);

  const isDismissed = useCallback(() => {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    if (Date.now() > Number(until)) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    return true;
  }, []);

  const shouldPrompt = Boolean(
    supabase &&
    profile &&
    permissionStatus === 'default' &&
    !isRegistered &&
    !isDismissed()
  );

  // Cleanup on logout
  useEffect(() => {
    if (!session && !cleanupDone.current && isRegistered) {
      cleanupDone.current = true;
      removeToken();
    }
    if (session) {
      cleanupDone.current = false;
    }
  }, [session, isRegistered, removeToken]);

  return {
    permissionStatus,
    isRegistered,
    shouldPrompt,
    requestPermission,
    removeToken,
    dismissPrompt: () => {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
      );
    },
  };
}
