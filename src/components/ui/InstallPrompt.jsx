import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, Download, Plus, Share, SquarePlus, X } from 'lucide-react';

const DISMISS_KEY = 'fitrank_install_dismiss';
const DISMISS_DAYS = 7;
const IOS_DELAY_MS = 5000;

function isDismissed() {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  return Date.now() - Number(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function IOSInstallSheet({ onDismiss }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm animate-in-fade"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Instalar FitRank"
        className="fixed bottom-0 left-0 right-0 z-[81] max-w-lg mx-auto animate-in-slide-up"
      >
        <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl px-6 pt-4 pb-8 safe-bottom">
          {/* Handle bar */}
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5" />

          {/* Close */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar"
            className="absolute top-4 right-5 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg shadow-green-500/20">
              <span className="text-2xl font-black italic text-white tracking-tighter">FR</span>
            </div>
            <h3 className="text-lg font-black text-white">Instale o FitRank</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Tenha acesso rápido e receba notificações
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4 mb-6">
            <StepRow
              number={1}
              icon={<Share size={18} className="text-blue-400" />}
              text={<>Toque no ícone <strong className="text-white">Compartilhar</strong> na barra do Safari</>}
            />
            <StepRow
              number={2}
              icon={<SquarePlus size={18} className="text-green-400" />}
              text={<>Role e toque em <strong className="text-white">"Adicionar à Tela de Início"</strong></>}
            />
            <StepRow
              number={3}
              icon={<Plus size={18} className="text-green-400" />}
              text={<>Toque em <strong className="text-white">"Adicionar"</strong> no canto superior direito</>}
            />
          </div>

          {/* Animated arrow pointing to Safari bar */}
          <div className="flex flex-col items-center gap-1 mb-5">
            <span className="text-[11px] text-zinc-500 font-medium">Barra do Safari</span>
            <ChevronDown size={22} className="text-green-400 animate-bounce" />
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-3 rounded-xl bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-colors"
          >
            Entendi
          </button>
        </div>
      </div>
    </>
  );
}

function StepRow({ number, icon, text }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-green-400">{number}</span>
      </div>
      <div className="flex items-start gap-2 min-w-0 pt-0.5">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <p className="text-sm text-zinc-300 leading-snug">{text}</p>
      </div>
    </div>
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    if (isIOSSafari()) {
      const timer = setTimeout(() => {
        setShowIOSGuide(true);
        setVisible(true);
      }, IOS_DELAY_MS);
      return () => clearTimeout(timer);
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

  if (showIOSGuide) {
    return <IOSInstallSheet onDismiss={handleDismiss} />;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[75] bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-4 py-3 flex items-center gap-3 animate-in-fade max-w-lg mx-auto">
      <div className="bg-green-500/20 p-2 rounded-lg shrink-0">
        <Download className="w-5 h-5 text-green-500" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">Instale o FitRank</p>
        <p className="text-xs text-zinc-400">Acesso rápido na tela inicial</p>
      </div>

      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="text-sm font-bold text-black bg-green-500 px-3 py-1.5 rounded-lg hover:bg-green-400 transition-colors shrink-0"
        >
          Instalar
        </button>
      )}

      <button onClick={handleDismiss} className="text-zinc-500 hover:text-white transition-colors shrink-0" aria-label="Fechar">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
