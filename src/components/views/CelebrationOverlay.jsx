import { useEffect, useState } from 'react';
import { Flame, Zap, Trophy, Star, ArrowUp } from 'lucide-react';
import { fireConfetti } from '../../lib/confetti.js';
import { playSound } from '../../lib/sounds.js';
import { haptic } from '../../lib/haptics.js';

/**
 * @param {{ celebration: CelebrationData | null, onDismiss: () => void }} props
 *
 * CelebrationData shape:
 * {
 *   points: number,           // pontos ganhos
 *   workoutType: string,      // tipo de treino
 *   streak?: number,          // streak atual (se > 1)
 *   leveledUp?: boolean,      // se subiu de nível
 *   newLevel?: number,        // nível novo
 *   badges?: string[],        // nomes de badges desbloqueados
 *   leaguePromotion?: string, // slug da nova liga (se promovido)
 * }
 */
export function CelebrationOverlay({ celebration, onDismiss }) {
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!celebration) return;
    setPhase(0);
    setVisible(true);

    const timers = [];

    timers.push(setTimeout(() => {
      setPhase(1);
      playSound('checkin');
      haptic('light');
    }, 100));

    if (celebration.streak > 1) {
      timers.push(setTimeout(() => {
        setPhase(2);
        const isStreakMilestone = [7, 30, 100].includes(celebration.streak);
        playSound(isStreakMilestone ? 'streak' : 'checkin');
        haptic(isStreakMilestone ? 'success' : 'light');
      }, 1200));
    }

    if (celebration.leveledUp) {
      timers.push(setTimeout(() => {
        setPhase(3);
        fireConfetti({ preset: 'rainbow', particleCount: 120 });
        playSound('levelUp');
        haptic('celebration');
      }, celebration.streak > 1 ? 2400 : 1200));
    }

    if (celebration.badges?.length > 0) {
      const badgeDelay = celebration.leveledUp
        ? (celebration.streak > 1 ? 3600 : 2400)
        : (celebration.streak > 1 ? 2400 : 1200);
      timers.push(setTimeout(() => {
        setPhase(4);
        fireConfetti({ preset: 'achievement', particleCount: 100 });
        playSound('badge');
        haptic('celebration');
      }, badgeDelay));
    }

    const totalDelay = calculateDismissDelay(celebration);
    timers.push(setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, totalDelay));

    fireConfetti({ preset: 'checkin', particleCount: 50 });

    return () => timers.forEach(clearTimeout);
  }, [celebration, onDismiss]);

  if (!celebration) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
    >
      <div className="flex flex-col items-center gap-4 px-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {/* Phase 1: Pontos */}
        <div className={`transition-all duration-500 ${phase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          <div className="bg-zinc-900 border border-green-500/30 rounded-2xl p-6 text-center w-full shadow-2xl shadow-green-500/10">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="bg-green-500/20 p-3 rounded-full">
                <Zap className="w-8 h-8 text-green-500 fill-green-500" />
              </div>
            </div>
            <p className="text-4xl font-black text-green-500 mb-1">+10 PTS</p>
            <p className="text-zinc-400 text-sm">{celebration.workoutType}</p>
          </div>
        </div>

        {/* Phase 2: Streak */}
        {celebration.streak > 1 && (
          <div className={`transition-all duration-500 delay-100 ${phase >= 2 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-5 py-3 flex items-center gap-3">
              <Flame className="w-6 h-6 text-orange-500 fill-orange-500 animate-pulse" />
              <div>
                <p className="text-lg font-black text-orange-500">{celebration.streak} dias seguidos!</p>
                <p className="text-xs text-zinc-500">Continue assim, atleta!</p>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Level Up */}
        {celebration.leveledUp && (
          <div className={`transition-all duration-500 ${phase >= 3 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl px-5 py-3 flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-full">
                <ArrowUp className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-purple-400">Nível {celebration.newLevel}!</p>
                <p className="text-xs text-zinc-500">Você subiu de nível</p>
              </div>
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 ml-auto animate-spin" style={{ animationDuration: '3s' }} />
            </div>
          </div>
        )}

        {/* Phase 4: Badges */}
        {celebration.badges?.length > 0 && (
          <div className={`transition-all duration-500 ${phase >= 4 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
            {celebration.badges.map((badge, i) => (
              <div
                key={i}
                className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-3 flex items-center gap-3 mb-2"
              >
                <div className="bg-yellow-500/20 p-2 rounded-full">
                  <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-yellow-400">Conquista desbloqueada!</p>
                  <p className="text-xs text-zinc-400">{badge}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-zinc-600 mt-2">Toque para fechar</p>
      </div>
    </div>
  );
}

function calculateDismissDelay(c) {
  let delay = 3000;
  if (c.streak > 1) delay += 1200;
  if (c.leveledUp) delay += 1200;
  if (c.badges?.length > 0) delay += 1200;
  return delay;
}
