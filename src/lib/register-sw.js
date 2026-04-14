import { Sentry } from './sentry.js';
import { track } from './analytics.js';

let swUpdateCallback = null;

export function onSwUpdate(cb) {
  swUpdateCallback = cb;
}

export let updateSW = () => {};

function trackConnectivity() {
  const handleOnline = () => track('pwa_online_restored');
  const handleOffline = () => track('pwa_offline_detected');
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

async function register() {
  if (import.meta.env.DEV) return;

  trackConnectivity();

  try {
    const { registerSW } = await import('virtual:pwa-register');
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        track('pwa_sw_update_available');
        if (swUpdateCallback) swUpdateCallback({ type: 'needRefresh' });
      },
      onOfflineReady() {
        if (swUpdateCallback) swUpdateCallback({ type: 'offlineReady' });
      },
      onRegisteredSW(_swUrl, registration) {
        track('pwa_sw_registered');
        if (registration) {
          setInterval(() => registration.update(), 60 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error('FitRank: SW registration failed', error);
        if (Sentry?.captureException) {
          Sentry.captureException(error, {
            tags: { source: 'service-worker' },
            extra: { phase: 'registration' }
          });
        }
      }
    });
  } catch {
    // SW não disponível
  }
}

register();
