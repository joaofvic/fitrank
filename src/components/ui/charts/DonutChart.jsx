import { useMemo, useState } from 'react';

const COLORS = [
  'rgb(34 197 94)',
  'rgb(59 130 246)',
  'rgb(168 85 247)',
  'rgb(249 115 22)',
  'rgb(236 72 153)',
  'rgb(234 179 8)',
  'rgb(20 184 166)',
  'rgb(239 68 68)',
];

export function DonutChart({ data, nameKey = 'type', valueKey = 'count', size = 160 }) {
  const [active, setActive] = useState(null);
  const center = size / 2;
  const radius = size / 2 - 16;
  const strokeW = 24;

  const { slices, total } = useMemo(() => {
    if (!data || data.length === 0) return { slices: [], total: 0 };
    const tot = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0);
    if (tot === 0) return { slices: [], total: 0 };

    let cumAngle = -90;
    const sl = data.map((d, i) => {
      const val = Number(d[valueKey]) || 0;
      const pct = val / tot;
      const angle = pct * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      const endAngle = cumAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);
      const largeArc = angle > 180 ? 1 : 0;

      const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
      return {
        path,
        color: COLORS[i % COLORS.length],
        name: d[nameKey],
        value: val,
        pct: Math.round(pct * 100),
      };
    });
    return { slices: sl, total: tot };
  }, [data, nameKey, valueKey, center, radius]);

  if (slices.length === 0) return null;

  const activeSlice = active != null ? slices[active] : null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill="none"
              stroke={s.color}
              strokeWidth={active === i ? strokeW + 4 : strokeW}
              strokeLinecap="round"
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive((prev) => prev === i ? null : i)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {activeSlice ? (
            <>
              <span className="text-lg font-black text-white">{activeSlice.pct}%</span>
              <span className="text-[10px] text-zinc-400 max-w-[60px] text-center truncate">{activeSlice.name}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-black text-white">{total}</span>
              <span className="text-[10px] text-zinc-500">Total</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        {slices.map((s, i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={`flex items-center gap-2 text-left transition-opacity ${active != null && active !== i ? 'opacity-40' : ''}`}
          >
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-zinc-300 truncate">{s.name}</span>
            <span className="text-xs text-zinc-500 font-mono ml-auto">{s.pct}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
