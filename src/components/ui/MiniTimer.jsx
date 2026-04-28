import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';

function formatCompact(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Mini timer flutuante (Epic C).
 *
 * C.1 — O valor exibido segue `ref.activeMode`: na aba Cronômetro mostra o tempo de treino;
 * na aba Descanso mostra o countdown (pausado ou em execução).
 *
 * C.2 — Permanece visível com descanso pausado / preset escolhido / vindo do plano, desde que
 * `isSessionActive()` (treino > 0, descanso rodando ou `hasRestSession`).
 */
export function MiniTimer({ timerHook, onClick }) {
  const { running, ref: timerRef, sessionGen, isSessionActive } = timerHook;
  const [display, setDisplay] = useState('0:00');
  const tickRef = useRef(null);

  const computeDisplaySeconds = () => {
    const s = timerRef.current;
    if (s.activeMode === 'countdown') {
      let rem = s.rest.baseRemaining;
      if (s.rest.running && s.rest.startedAt) {
        rem = Math.max(0, s.rest.baseRemaining - Math.floor((Date.now() - s.rest.startedAt) / 1000));
      }
      return rem;
    }
    let total = s.stopwatch.baseElapsed;
    if (s.stopwatch.running && s.stopwatch.startedAt) {
      total += Math.floor((Date.now() - s.stopwatch.startedAt) / 1000);
    }
    return total;
  };

  const active = isSessionActive();

  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (!active) return undefined;

    const tick = () => {
      setDisplay(formatCompact(computeDisplaySeconds()));
    };
    tick();

    if (running) {
      tickRef.current = setInterval(tick, 1000);
    }

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [active, running, sessionGen, timerRef]);

  if (!active) return null;

  const modeLabel = timerRef.current.activeMode === 'countdown' ? 'Descanso' : 'Treino';
  const aria = running
    ? `Abrir timer: ${modeLabel} ${display} (em execução)`
    : `Abrir timer: ${modeLabel} ${display} (pausado)`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full bg-green-600 shadow-lg shadow-green-600/35 text-zinc-950 font-bold text-sm tabular-nums active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 transition-transform animate-in-fade motion-reduce:animate-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
      aria-label={aria}
    >
      <Timer size={16} className={running ? 'animate-pulse motion-reduce:animate-none' : ''} aria-hidden="true" />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[9px] font-black uppercase tracking-wide opacity-80">{modeLabel}</span>
        <span>{display}</span>
      </span>
    </button>
  );
}
