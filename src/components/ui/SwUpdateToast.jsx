import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { onSwUpdate } from '../../lib/register-sw.js';
import { track } from '../../lib/analytics.js';

export function SwUpdateToast() {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    onSwUpdate((event) => {
      setNotification(event);
      if (event.type === 'offlineReady') {
        setTimeout(() => setNotification(null), 4000);
      }
    });
  }, []);

  if (!notification) return null;

  if (notification.type === 'offlineReady') {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] bg-zinc-900 border border-zinc-700 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-in-fade max-w-sm">
        <WifiOff className="w-5 h-5 text-green-500 shrink-0" />
        <p className="text-sm">App pronto para uso offline</p>
        <button onClick={() => setNotification(null)} className="text-zinc-500 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (notification.type === 'needRefresh') {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] bg-zinc-900 border border-green-500/30 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-in-fade max-w-sm">
        <RefreshCw className="w-5 h-5 text-green-500 shrink-0" />
        <p className="text-sm flex-1">Nova versão disponível</p>
        <button
          onClick={async () => { track('pwa_sw_update_applied'); const { updateSW } = await import('../../lib/register-sw.js'); updateSW(true); setNotification(null); }}
          className="text-sm font-bold text-green-500 hover:text-green-400 shrink-0"
        >
          Atualizar
        </button>
        <button onClick={() => setNotification(null)} className="text-zinc-500 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}
