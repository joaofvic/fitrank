import { useEffect, useState, useCallback } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISS_KEY = 'fitrank_install_dismiss';
const DISMISS_DAYS = 7;

function isDismissed() {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const diff = Date.now() - Number(ts);
  return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    if (isIOSSafari()) {
      setShowIOSGuide(true);
      setVisible(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[75] bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-4 py-3 flex items-center gap-3 animate-in-fade max-w-lg mx-auto">
      <div className="bg-green-500/20 p-2 rounded-lg shrink-0">
        {showIOSGuide ? (
          <Share className="w-5 h-5 text-green-500" />
        ) : (
          <Download className="w-5 h-5 text-green-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {showIOSGuide ? (
          <>
            <p className="text-sm font-medium text-white">Instale o FitRank</p>
            <p className="text-xs text-zinc-400 truncate">
              Toque em <Share className="w-3 h-3 inline" /> e depois "Adicionar à Tela de Início"
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-white">Instale o FitRank</p>
            <p className="text-xs text-zinc-400">Acesso rápido na tela inicial</p>
          </>
        )}
      </div>

      {!showIOSGuide && deferredPrompt && (
        <button
          onClick={handleInstall}
          className="text-sm font-bold text-black bg-green-500 px-3 py-1.5 rounded-lg hover:bg-green-400 transition-colors shrink-0"
        >
          Instalar
        </button>
      )}

      <button onClick={handleDismiss} className="text-zinc-500 hover:text-white transition-colors shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
