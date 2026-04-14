import { useState } from 'react';
import { Flame, ShieldCheck, Loader2, Crown } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { playSound } from '../../lib/sounds.js';
import { haptic } from '../../lib/haptics.js';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog.jsx';

export function StreakRecoveryModal({ open = true, recoveryInfo, onRecover, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRecover = async () => {
    setLoading(true);
    try {
      const res = await onRecover(recoveryInfo.gap_date);
      setResult(res);
      if (res?.success) {
        playSound('streak');
        haptic('success');
      }
    } catch {
      setResult({ error: 'Erro inesperado ao recuperar streak' });
    } finally {
      setLoading(false);
    }
  };

  if (result?.success) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm text-center space-y-4">
          <DialogTitle className="sr-only">Streak Recuperado</DialogTitle>
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <Flame className="w-8 h-8 text-orange-500 fill-orange-500" />
          </div>
          <h3 className="text-xl font-bold text-white">Streak Recuperado!</h3>
          <p className="text-zinc-400">
            Seu streak foi restaurado de <span className="text-orange-500 font-bold">{result.streak_before}</span> para{' '}
            <span className="text-green-500 font-bold">{result.streak_after} dias</span>.
          </p>
          <Button onClick={onClose} className="w-full">Fechar</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
            Recuperar Streak
          </DialogTitle>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-2">
          <p className="text-sm text-zinc-300">
            Seu streak de <span className="text-orange-500 font-bold">{recoveryInfo.streak_before} {recoveryInfo.streak_before === 1 ? 'dia' : 'dias'}</span> foi
            quebrado. Você perdeu o dia <span className="text-white font-semibold">{formatDate(recoveryInfo.gap_date)}</span>.
          </p>
          <p className="text-xs text-zinc-500">
            Limite: 1 recuperação por mês.
          </p>
        </div>

        <div className="bg-zinc-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="bg-yellow-500/20 p-2 rounded-lg">
            <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Benefício PRO</p>
            <p className="text-xs text-zinc-400">Recurso exclusivo para membros PRO</p>
          </div>
          <ShieldCheck className="w-5 h-5 text-green-500 ml-auto" />
        </div>

        {result?.error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400" role="alert">
            {result.error}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleRecover} className="flex-1" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Recuperar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
