import { useMemo, useRef, useState, useCallback } from 'react';

const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 24;

export function LineChart({
  data,
  xKey = 'date',
  yKey = 'count',
  width = 320,
  height = 160,
  color = 'rgb(34 197 94)',
  formatX,
  formatY,
  label = '',
}) {
  const svgRef = useRef(null);
  const [tip, setTip] = useState(null);

  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const { points, path, yTicks, maxY } = useMemo(() => {
    if (!data || data.length === 0) return { points: [], path: '', yTicks: [], maxY: 0 };
    const vals = data.map((d) => Number(d[yKey]) || 0);
    const mx = Math.max(1, ...vals);
    const pts = data.map((d, i) => {
      const x = PAD_L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const y = PAD_T + plotH - (vals[i] / mx) * plotH;
      return { x, y, raw: d, val: vals[i] };
    });
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const ticks = [0, Math.round(mx / 2), mx].map((v) => ({
      v,
      y: PAD_T + plotH - (v / mx) * plotH,
      label: formatY ? formatY(v) : String(v),
    }));
    return { points: pts, path: d, yTicks: ticks, maxY: mx };
  }, [data, yKey, plotW, plotH, formatY]);

  const handleMove = useCallback((e) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - mouseX);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    setTip(closest);
  }, [points]);

  if (!data || data.length === 0) return null;

  const tipPt = tip != null ? points[tip] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="block cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setTip(null)}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) handleMove({ clientX: touch.clientX, currentTarget: e.currentTarget });
        }}
        role="img"
        aria-label={label}
      >
        {yTicks.map((t) => (
          <g key={t.v}>
            <line x1={PAD_L} y1={t.y} x2={width - PAD_R} y2={t.y} stroke="rgb(39 39 42)" strokeWidth="1" />
            <text x={PAD_L - 4} y={t.y + 3} textAnchor="end" className="fill-zinc-600" fontSize="9">{t.label}</text>
          </g>
        ))}

        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {path && (
          <>
            <path
              d={`${path} L ${points[points.length - 1].x} ${PAD_T + plotH} L ${points[0].x} ${PAD_T + plotH} Z`}
              fill="url(#lineGrad)"
            />
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {tipPt && (
          <>
            <line x1={tipPt.x} y1={PAD_T} x2={tipPt.x} y2={PAD_T + plotH} stroke="rgb(161 161 170 / 0.3)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={tipPt.x} cy={tipPt.y} r="4" fill="rgb(22 101 52)" stroke={color} strokeWidth="2" />
          </>
        )}

        {data.length <= 12 && data.map((d, i) => {
          const x = PAD_L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
          return (
            <text key={i} x={x} y={height - 4} textAnchor="middle" className="fill-zinc-600" fontSize="8">
              {formatX ? formatX(d[xKey]) : d[xKey]}
            </text>
          );
        })}
      </svg>

      {tipPt && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-zinc-700 bg-zinc-950/95 px-2.5 py-1.5 text-[10px] shadow-xl"
          style={{
            left: Math.min(Math.max(tipPt.x - 40, 0), width - 120),
            top: Math.max(tipPt.y - 48, 0),
          }}
        >
          <p className="font-bold text-white">{formatX ? formatX(tipPt.raw[xKey]) : tipPt.raw[xKey]}</p>
          <p className="text-zinc-400">{label}: <span className="text-white font-mono">{tipPt.val}</span></p>
        </div>
      )}
    </div>
  );
}
