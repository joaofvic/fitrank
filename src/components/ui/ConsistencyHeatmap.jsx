import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';

const CELL = 13;
const GAP = 3;
const ROWS = 7;
const LABEL_W = 22;
const HEADER_H = 16;

const DAY_LABELS = ['', 'S', '', 'T', '', 'S', ''];
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getColor(count) {
  if (count === 0) return 'rgb(39 39 42)';
  if (count === 1) return 'rgb(34 197 94 / 0.3)';
  if (count === 2) return 'rgb(34 197 94 / 0.6)';
  return 'rgb(34 197 94)';
}

function buildGrid(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  const dayOffset = start.getDay();
  const weeks = [];
  let week = new Array(dayOffset).fill(null);

  const cur = new Date(start);
  while (cur <= end) {
    week.push(new Date(cur));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function getMonthPositions(weeks) {
  const positions = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const day = weeks[w].find((d) => d != null);
    if (day) {
      const m = day.getMonth();
      if (m !== lastMonth) {
        positions.push({ month: m, weekIdx: w });
        lastMonth = m;
      }
    }
  }
  return positions;
}

function formatDateBR(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function ConsistencyHeatmap({ userId, compact = false }) {
  const { supabase } = useAuth();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);

  const currentYear = new Date().getFullYear();
  const canGoNext = year < currentYear;

  const loadData = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase.rpc('get_checkin_heatmap', {
        p_user_id: userId,
        p_year: year,
      });
      if (error) throw error;
      const map = {};
      (rows || []).forEach((r) => { map[r.date] = r.count; });
      setData(map);
    } catch {
      setData({});
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, year]);

  useEffect(() => { loadData(); }, [loadData]);

  const weeks = useMemo(() => buildGrid(year), [year]);
  const monthPositions = useMemo(() => getMonthPositions(weeks), [weeks]);

  const totalDays = useMemo(() => {
    if (!data) return 0;
    return Object.values(data).filter((c) => c > 0).length;
  }, [data]);

  const colCount = weeks.length;
  const svgW = LABEL_W + colCount * (CELL + GAP);
  const svgH = HEADER_H + ROWS * (CELL + GAP);

  const handleCellClick = useCallback((d, count) => {
    if (!d) return;
    setTooltip((prev) => {
      if (prev && prev.key === d.toISOString()) return null;
      return {
        key: d.toISOString(),
        text: count > 0
          ? `${count} treino${count > 1 ? 's' : ''} em ${formatDateBR(d)}`
          : `Nenhum treino em ${formatDateBR(d)}`,
      };
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
        <div className="h-24 bg-zinc-900 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Consistência
          {totalDays > 0 && (
            <span className="ml-2 text-green-500 font-black">{totalDays} dias</span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white rounded transition-colors"
            aria-label="Ano anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-bold text-zinc-400 tabular-nums w-10 text-center">{year}</span>
          <button
            type="button"
            onClick={() => canGoNext && setYear((y) => y + 1)}
            disabled={!canGoNext}
            className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Próximo ano"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="block"
          role="img"
          aria-label={`Mapa de consistência de treinos em ${year}`}
        >
          {!compact && monthPositions.map(({ month, weekIdx }) => (
            <text
              key={`m-${month}`}
              x={LABEL_W + weekIdx * (CELL + GAP)}
              y={11}
              className="fill-zinc-600"
              fontSize="9"
              fontWeight="600"
            >
              {MONTH_LABELS[month]}
            </text>
          ))}

          {!compact && DAY_LABELS.map((label, i) =>
            label ? (
              <text
                key={`d-${i}`}
                x={0}
                y={HEADER_H + i * (CELL + GAP) + CELL - 2}
                className="fill-zinc-600"
                fontSize="9"
                fontWeight="500"
              >
                {label}
              </text>
            ) : null
          )}

          {weeks.map((week, wIdx) =>
            week.map((day, dIdx) => {
              if (!day) return null;
              const key = day.toISOString().split('T')[0];
              const count = data?.[key] || 0;
              const x = LABEL_W + wIdx * (CELL + GAP);
              const y = HEADER_H + dIdx * (CELL + GAP);
              return (
                <rect
                  key={key}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  fill={getColor(count)}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => handleCellClick(day, count)}
                />
              );
            })
          )}
        </svg>
      </div>

      {tooltip && (
        <p className="text-[11px] text-zinc-400 text-center animate-in-fade">
          {tooltip.text}
        </p>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-zinc-600">Menos</span>
        {[0, 1, 2, 3].map((level) => (
          <div
            key={level}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: getColor(level) }}
          />
        ))}
        <span className="text-[10px] text-zinc-600">Mais</span>
      </div>
    </div>
  );
}
