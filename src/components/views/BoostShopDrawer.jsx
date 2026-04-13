import { useState, useEffect } from 'react';
import { Zap, Crown, Loader2, X, Check } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { playSound } from '../../lib/sounds.js';
import { haptic } from '../../lib/haptics.js';

const BOOST_OPTIONS = [10, 25, 50, 100];

export function BoostShopDrawer({ onGetStatus, onPurchase, onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    onGetStatus?.().then((s) => {
      setStatus(s);
      setLoading(false);
    });
  }, [onGetStatus]);

  const handlePurchase = async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      const res = await onPurchase(selected);
      setResult(res);
      if (res?.success) {
        playSound('boost');
        haptic('success');
      }
      if (res?.success && status) {
        setStatus((prev) => ({
          ...prev,
          boosts_used: (prev?.boosts_used ?? 0) + 1,
          boosts_remaining: Math.max(0, (prev?.boosts_remaining ?? 0) - 1)
        }));
      }
    } catch {
      setResult({ error: 'Erro inesperado' });
    } finally {
      setPurchasing(false);
    }
  };

  const canBoost = status?.is_pro && (status?.boosts_remaining ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-6 pb-8 space-y-5 animate-in-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-500 fill-green-500" />
            Boost de Pontos
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : result?.success ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h4 className="text-xl font-bold text-white">Boost Ativado!</h4>
            <p className="text-zinc-400">
              <span className="text-green-500 font-bold">+{result.points_added}</span> pontos adicionados.
              Total: <span className="text-white font-bold">{result.points_total}</span>.
            </p>
            <p className="text-xs text-zinc-500">
              {result.boosts_remaining > 0
                ? `Ainda ${result.boosts_remaining === 1 ? 'resta 1 boost' : `restam ${result.boosts_remaining} boosts`} esta semana.`
                : 'Você usou todos os boosts desta semana.'}
            </p>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        ) : (
          <>
            <div className="bg-zinc-800/50 rounded-xl p-3 flex items-center gap-3">
              <div className="bg-yellow-500/20 p-2 rounded-lg">
                <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Benefício PRO</p>
                <p className="text-xs text-zinc-400">
                  {status?.boosts_remaining ?? 0} de {status?.max_per_week ?? 2} boosts restantes esta semana
                </p>
              </div>
            </div>

            {!status?.is_pro && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-sm text-yellow-400">
                Assine o PRO para usar boosts de pontos.
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-zinc-400">Escolha a quantidade de pontos:</p>
              <div className="grid grid-cols-2 gap-3">
                {BOOST_OPTIONS.map((pts) => (
                  <button
                    key={pts}
                    onClick={() => canBoost && setSelected(pts)}
                    disabled={!canBoost}
                    className={`relative rounded-xl border p-4 text-center transition-all ${
                      selected === pts
                        ? 'border-green-500 bg-green-500/10 ring-1 ring-green-500/30'
                        : canBoost
                        ? 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                        : 'border-zinc-800 bg-zinc-900/50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Zap className={`w-4 h-4 ${selected === pts ? 'text-green-500 fill-green-500' : 'text-zinc-500'}`} />
                      <span className={`text-2xl font-black ${selected === pts ? 'text-green-500' : 'text-white'}`}>
                        {pts}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">pontos</p>
                  </button>
                ))}
              </div>
            </div>

            {result?.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
                {result.error}
              </div>
            )}

            <Button
              onClick={handlePurchase}
              disabled={!selected || purchasing || !canBoost}
              className="w-full h-12"
            >
              {purchasing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : selected ? (
                `Ativar +${selected} pontos`
              ) : (
                'Selecione uma opção'
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
