let mpSdkPromise = null;

function getPublicKey() {
  const pk = import.meta.env.VITE_MP_PUBLIC_KEY;
  return typeof pk === 'string' ? pk.trim() : '';
}

function loadScriptOnce(src) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.head.appendChild(s);
  });
}

/**
 * Carrega MercadoPago.js v2 e retorna `window.MercadoPago`.
 * Requer `VITE_MP_PUBLIC_KEY` no frontend.
 */
export async function loadMercadoPago() {
  if (mpSdkPromise) return mpSdkPromise;

  mpSdkPromise = (async () => {
    const publicKey = getPublicKey();
    if (!publicKey) {
      throw new Error('VITE_MP_PUBLIC_KEY não configurada');
    }

    await loadScriptOnce('https://sdk.mercadopago.com/js/v2');

    const Ctor = window.MercadoPago;
    if (typeof Ctor !== 'function') {
      throw new Error('SDK do Mercado Pago não inicializou corretamente');
    }

    return new Ctor(publicKey);
  })();

  return mpSdkPromise;
}

