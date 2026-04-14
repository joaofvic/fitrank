import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';

function formatCompact(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MiniTimer({ timerHook, onClick }) {
  const { running, ref: timerRef } = timerHook;
  const [display, setDisplay] = useState('0:00');
  const tickRef = useRef(null);

  useEffect(() => {
    if (!running) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    const tick = () => {
      const r = timerRef.current;
      const isCountdown = r.mode === 'countdown';
      if (isCountdown) {
        let remaining = r.baseElapsed;
        if (r.running && r.startedAt) remaining -= Math.floor((Date.now() - r.startedAt) / 1000);
        setDisplay(formatCompact(Math.max(0, remaining)));
      } else {
        let total = r.baseElapsed;
        if (r.running && r.startedAt) total += Math.floor((Date.now() - r.startedAt) / 1000);
        setDisplay(formatCompact(total));
      }
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running, timerRef]);

  if (!running) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full bg-green-500 shadow-lg shadow-green-500/30 text-black font-bold text-sm tabular-nums active:scale-90 transition-transform animate-in-fade"
      aria-label="Abrir timer"
    >
      <Timer size={16} className="animate-pulse" />
      {display}
    </button>
  );
}
