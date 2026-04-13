import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LeagueBadge, getLeagueConfig } from '../ui/LeagueBadge.jsx';
import { Button } from '../ui/Button.jsx';
import { fireConfetti } from '../../lib/confetti.js';
import { playSound } from '../../lib/sounds.js';
import { haptic } from '../../lib/haptics.js';

export function LeaguePromotionOverlay({ league, onClose, onShare }) {
  const [visible, setVisible] = useState(false);
  const config = getLeagueConfig(league);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const confettiPreset = league === 'diamante' ? 'diamond'
      : league === 'platina' ? 'platinum'
      : league === 'ouro' ? 'gold'
      : league === 'prata' ? 'silver'
      : 'bronze';
    fireConfetti({ preset: confettiPreset, particleCount: 150, durationMs: 4000 });
    playSound('leaguePromotion');
    haptic('heavy');
    setTimeout(() => haptic('celebration'), 300);
  }, [league]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className="flex flex-col items-center gap-6 px-8 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`transition-all duration-700 ${visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          <LeagueBadge league={league} size="lg" />
        </div>

        <div className={`text-center space-y-2 transition-all duration-700 delay-300 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
          <p className="text-lg text-zinc-400 font-medium">Você subiu para</p>
          <h2 className="text-3xl font-black text-white" style={{ color: config.text }}>
            Liga {config.name}!
          </h2>
          <p className="text-sm text-zinc-500">Continue treinando para subir ainda mais!</p>
        </div>

        <div className={`w-full space-y-3 transition-all duration-700 delay-500 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
          {onShare && (
            <Button onClick={() => { onShare(); handleClose(); }} className="w-full">
              Compartilhar
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} className="w-full">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
