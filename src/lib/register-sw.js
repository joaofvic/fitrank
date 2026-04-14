let swUpdateCallback = null;

export function onSwUpdate(cb) {
  swUpdateCallback = cb;
}

export let updateSW = () => {};

async function register() {
  if (import.meta.env.DEV) return;

  try {
    const { registerSW } = await import('virtual:pwa-register');
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (swUpdateCallback) swUpdateCallback({ type: 'needRefresh' });
      },
      onOfflineReady() {
        if (swUpdateCallback) swUpdateCallback({ type: 'offlineReady' });
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          setInterval(() => registration.update(), 60 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error('FitRank: SW registration failed', error);
      }
    });
  } catch {
    // SW não disponível em dev
  }
}

register();
