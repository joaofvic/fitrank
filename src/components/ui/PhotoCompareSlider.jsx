import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';

export function PhotoCompareSlider({ left, right }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handleStart = useCallback((e) => {
    dragging.current = true;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    updatePosition(x);
  }, [updatePosition]);

  const handleMove = useCallback((e) => {
    if (!dragging.current) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    updatePosition(x);
  }, [updatePosition]);

  const handleEnd = useCallback(() => { dragging.current = false; }, []);

  const handleKeyDown = useCallback((e) => {
    const step = 2;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setPosition(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setPosition(100);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: true });
    document.addEventListener('touchend', handleEnd);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [handleMove, handleEnd]);

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Comparar antes e depois"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      className="relative w-full aspect-[3/4] rounded-xl overflow-hidden select-none cursor-col-resize bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50"
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onKeyDown={handleKeyDown}
    >
      <img src={right} alt="Depois" className="absolute inset-0 w-full h-full object-cover" />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img src={left} alt="Antes" className="w-full h-full object-cover" style={{ width: `${containerRef.current?.offsetWidth || 300}px` }} />
      </div>
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <ArrowLeftRight size={14} className="text-black" />
        </div>
      </div>
      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 rounded text-[10px] font-bold text-white">Antes</div>
      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 rounded text-[10px] font-bold text-white">Depois</div>
    </div>
  );
}
