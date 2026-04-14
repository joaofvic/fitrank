import { useCallback, useMemo, useRef, useState } from 'react';

const COLORS = [
  'rgb(34 197 94)',
  'rgb(59 130 246)',
  'rgb(168 85 247)',
  'rgb(249 115 22)',
  'rgb(236 72 153)',
];

export function BarChart({ data, categories, labelKey = 'label', height = 180 }) {
  const [active, setActive] = useState(null);
  const containerRef = useRef(null);

  const maxVal = useMemo(() => {
    if (!data || !categories) return 1;
    let mx = 0;
    for (const d of data) {
      for (const cat of categories) {
        const v = Number(d[cat.key]) || 0;
        if (v > mx) mx = v;
      }
    }
    return mx || 1;
  }, [data, categories]);

  const handleTouch = useCallback((e) => {
    if (!containerRef.current || !data) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const idx = Math.floor((x / rect.width) * data.length);
    setActive(Math.max(0, Math.min(data.length - 1, idx)));
  }, [data]);

  const handleTouchEnd = useCallback(() => {
    setTimeout(() => setActive(null), 1500);
  }, []);

  if (!data || data.length === 0 || !categories) return null;

  const barH = height - 32;
  const groupW = 100 / data.length;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative"
        style={{ height }}
        onTouchMove={handleTouch}
        onTouchStart={handleTouch}
        onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-x-0 bottom-6 top-0 flex items-end">
          {data.map((d, gi) => (
            <div
              key={gi}
              className="flex items-end justify-center gap-1 flex-1"
              onMouseEnter={() => setActive(gi)}
              onMouseLeave={() => setActive(null)}
            >
              {categories.map((cat, ci) => {
                const val = Number(d[cat.key]) || 0;
                const pct = (val / maxVal) * 100;
                return (
                  <div key={ci} className="flex flex-col items-center gap-0.5 flex-1 max-w-8">
                    {active === gi && (
                      <span className="text-[9px] font-bold text-zinc-300 tabular-nums">{val}</span>
                    )}
                    <div
                      className="w-full rounded-t-md transition-all duration-200"
                      style={{
                        height: `${Math.max(val > 0 ? 4 : 0, (pct / 100) * barH)}px`,
                        backgroundColor: COLORS[ci % COLORS.length],
                        opacity: active != null && active !== gi ? 0.3 : 1,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex">
          {data.map((d, gi) => (
            <div key={gi} className="flex-1 text-center">
              <span className="text-[9px] text-zinc-600 truncate block">{d[labelKey]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        {categories.map((cat, ci) => (
          <div key={ci} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[ci % COLORS.length] }} />
            <span className="text-[10px] text-zinc-400">{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
