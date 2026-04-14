import { useMemo, useRef, useState } from 'react';
import { formatDayPtBR } from './engagement-helpers.jsx';

const CHART_PAD_X = 14;
const CHART_LINE_TOP = 10;
const CHART_LINE_BOT = 78;
const CHART_BAR_TOP = 84;
const CHART_BAR_BOT = 138;
const CHART_H = 152;
const MIN_COL_PX = 11;

export function EngagementLineBarChart({
  title,
  data,
  valueKey,
  valueLabel,
  hoverIdx,
  onHoverIdx,
  selectedDay,
  onSelectDay,
  lineColor = 'rgb(34 197 94 / 0.95)',
  barColor = 'rgb(34 197 94 / 0.45)'
}) {
  const outerRef = useRef(null);
  const n = data.length;
  const values = useMemo(() => data.map((d) => Number(d[valueKey]) || 0), [data, valueKey]);
  const maxV = useMemo(() => Math.max(1, ...values), [values]);

  const innerW = Math.max(260, n * MIN_COL_PX);
  const vbW = innerW + CHART_PAD_X * 2;

  const layout = useMemo(() => {
    const cell = n > 0 ? innerW / n : 0;
    const linePts = [];
    const bars = [];
    for (let i = 0; i < n; i++) {
      const cx = CHART_PAD_X + i * cell + cell / 2;
      const v = values[i];
      const ny = CHART_LINE_TOP + (1 - v / maxV) * (CHART_LINE_BOT - CHART_LINE_TOP);
      linePts.push({ x: cx, y: ny, i });
      const bh = ((CHART_BAR_BOT - CHART_BAR_TOP) * v) / maxV;
      const bw = Math.max(2, cell * 0.62);
      bars.push({
        i,
        x: cx - bw / 2,
        y: CHART_BAR_BOT - bh,
        w: bw,
        h: Math.max(v > 0 ? 2 : 0, bh)
      });
    }
    const linePathD =
      linePts.length === 0
        ? ''
        : linePts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return { cell, linePts, linePathD, bars };
  }, [n, innerW, values, maxV]);

  const [tip, setTip] = useState(null);

  const indexFromClientX = (clientX, scrollEl) => {
    if (n <= 0 || !scrollEl) return 0;
    const rect = scrollEl.getBoundingClientRect();
    const xInContent = clientX - rect.left + scrollEl.scrollLeft;
    const total = scrollEl.scrollWidth || rect.width;
    const ratio = total > 0 ? Math.min(1, Math.max(0, xInContent / total)) : 0;
    return Math.min(n - 1, Math.max(0, Math.floor(ratio * n)));
  };

  const onLeave = () => {
    onHoverIdx(null);
    setTip(null);
  };

  const onMove = (e) => {
    if (n <= 0) return;
    const scrollEl = e.currentTarget;
    const idx = indexFromClientX(e.clientX, scrollEl);
    onHoverIdx(idx);
    const outer = outerRef.current?.getBoundingClientRect();
    if (outer) {
      setTip({ x: e.clientX - outer.left, y: e.clientY - outer.top, idx });
    } else {
      const rect = scrollEl.getBoundingClientRect();
      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, idx });
    }
  };

  const onClickScroll = (e) => {
    if (n <= 0) return;
    const scrollEl = e.currentTarget;
    const idx = indexFromClientX(e.clientX, scrollEl);
    const day = data[idx]?.day;
    if (!day) return;
    onSelectDay(selectedDay === day ? null : day);
  };

  const hi = hoverIdx;
  const tipRow = tip && data[tip.idx] ? data[tip.idx] : null;
  const tipVal = tipRow ? Number(tipRow[valueKey]) || 0 : null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase font-black text-zinc-500">{title}</p>
        <p className="text-[9px] text-zinc-600 text-right">
          Linha = tendência · Barras = volume · Clique para fixar o dia
        </p>
      </div>
      <div ref={outerRef} className="relative rounded-xl border border-zinc-800 bg-black/30 overflow-hidden">
        <div
          className="overflow-x-auto cursor-crosshair"
          role="presentation"
          onMouseLeave={onLeave}
          onMouseMove={onMove}
          onClick={onClickScroll}
        >
          <svg
            width={vbW}
            height={CHART_H}
            viewBox={`0 0 ${vbW} ${CHART_H}`}
            className="block touch-none select-none pointer-events-none"
            role="img"
            aria-label={`Gráfico ${title}: linha e barras por dia`}
          >
            <line x1={CHART_PAD_X} y1={CHART_LINE_BOT} x2={vbW - CHART_PAD_X} y2={CHART_LINE_BOT} stroke="rgb(39 39 42)" strokeWidth="1" />
            <line x1={CHART_PAD_X} y1={CHART_BAR_BOT} x2={vbW - CHART_PAD_X} y2={CHART_BAR_BOT} stroke="rgb(39 39 42)" strokeWidth="1" />
            {layout.bars.map((b) => {
              const sel = selectedDay && data[b.i]?.day === selectedDay;
              const hov = hi === b.i;
              return (
                <rect
                  key={`bar-${b.i}`}
                  x={b.x} y={b.y} width={b.w} height={b.h} rx={2}
                  fill={barColor}
                  stroke={sel ? 'rgb(74 222 128)' : hov ? 'rgb(161 161 170 / 0.6)' : 'none'}
                  strokeWidth={sel || hov ? 1.5 : 0}
                  className="transition-colors"
                />
              );
            })}
            {layout.linePathD ? (
              <path d={layout.linePathD} fill="none" stroke={lineColor} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            {layout.linePts.map((p) => {
              const hov = hi === p.i;
              const sel = selectedDay && data[p.i]?.day === selectedDay;
              if (!hov && !sel) return null;
              return (
                <circle key={`dot-${p.i}`} cx={p.x} cy={p.y} r={sel ? 5 : 4} fill="rgb(22 101 52)" stroke="rgb(74 222 128)" strokeWidth={2} />
              );
            })}
          </svg>
        </div>
        {tip && tipRow ? (
          <div
            className="pointer-events-none absolute z-20 min-w-[140px] max-w-[220px] rounded-lg border border-zinc-700 bg-zinc-950/95 px-2 py-1.5 text-[10px] text-zinc-200 shadow-xl"
            style={{
              left: Math.min(Math.max(tip.x + 10, 6), (outerRef.current?.clientWidth ?? 300) - 156),
              top: Math.max(tip.y - 54, 6)
            }}
          >
            <p className="font-black text-white">{formatDayPtBR(tipRow.day)}</p>
            <p className="text-zinc-400 mt-0.5">
              {valueLabel}: <span className="text-zinc-100 font-mono">{tipVal}</span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-600 font-mono px-0.5">
        <span>{data[0]?.day ?? '—'}</span>
        <span>{data[data.length - 1]?.day ?? '—'}</span>
      </div>
    </div>
  );
}
