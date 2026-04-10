import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

/** Sugestão operacional por código de rejeição (US-ADM-14 insights). */
function rejectionInsightSuggestion(code) {
  const c = String(code ?? '').trim();
  const map = {
    illegible_dark: 'Melhorar instrução ao usuário: iluminação, foco e contraste na foto do comprovante.',
    not_proof: 'Reforçar no app o que conta como comprovação válida de treino.',
    duplicate_reused: 'Orientar a enviar foto nova a cada check-in; evitar reuso de imagens.',
    inappropriate: 'Revisar comunicação de políticas de conteúdo exibidas no fluxo de check-in.',
    screenshot: 'Deixar explícito que print de tela não é aceito; pedir foto do ambiente ou do papel.',
    workout_mismatch: 'Sincronizar tipo de treino registrado com o que o usuário deve fotografar.',
    other: 'Padronizar observações quando o motivo for «Outro» e dar exemplos no app.'
  };
  return map[c] ?? 'Revisar comunicação no app e critérios alinhados à moderação.';
}

/**
 * Insights automáticos a partir do período atual (e ranking de motivos).
 * @returns {{ id: string, severity: 'critical' | 'warning' | 'info', headline: string, suggestion: string }[]}
 */
function buildEngagementInsights({
  rejectionRanking,
  rejectionRate,
  moderatedPhotoCount,
  dCheckins,
  tonePhoto,
  toneMod,
  toneRej,
  approvalRate
}) {
  const out = [];
  const rr = typeof rejectionRate === 'number' && Number.isFinite(rejectionRate) ? rejectionRate : null;
  const mod = typeof moderatedPhotoCount === 'number' && Number.isFinite(moderatedPhotoCount) ? moderatedPhotoCount : 0;
  const first = rejectionRanking[0];
  const shareFirst =
    first && typeof first.pct === 'number' && Number.isFinite(first.pct) ? Number(first.pct) : null;

  const rejectionReasonInsight =
    first?.code &&
    mod >= 5 &&
    rr != null &&
    rr >= 0.08 &&
    (rr >= 0.12 || (shareFirst != null && shareFirst >= 0.18));

  if (rejectionReasonInsight) {
    const label = rejectionReasonLabel(first.code);
    const sev = rr >= 0.22 || (shareFirst != null && shareFirst >= 0.35) ? 'critical' : 'warning';
    let headline;
    if (first.code === 'illegible_dark' && rr >= 0.08) {
      headline = `Rejeições estão altas por «${label}».`;
    } else if (rr >= 0.2) {
      headline = `Rejeições muito altas; principal motivo: «${label}»${shareFirst != null ? ` (${fmtPct(shareFirst)} das rejeições)` : ''}.`;
    } else {
      headline = `Rejeições elevadas por «${label}»${shareFirst != null ? ` — ${fmtPct(shareFirst)} das rejeições` : ''}.`;
    }
    out.push({
      id: `ins-rej-${first.code}`,
      severity: sev,
      headline,
      suggestion: rejectionInsightSuggestion(first.code)
    });
  }

  if (typeof dCheckins === 'number' && Number.isFinite(dCheckins) && dCheckins <= -0.12) {
    out.push({
      id: 'ins-vol-checkins',
      severity: 'warning',
      headline: 'Check-ins por dia caíram forte em relação ao período anterior.',
      suggestion: 'Verificar campanhas, comunicação nas academias e possíveis causas sazonais.'
    });
  }

  if (tonePhoto === 'bad') {
    out.push({
      id: 'ins-photo-rate',
      severity: 'warning',
      headline: 'Taxa de check-ins com foto está baixa.',
      suggestion: 'Reforçar benefícios da foto no fluxo e facilitar captura (permissões e dicas na câmera).'
    });
  }

  if (toneMod === 'bad') {
    out.push({
      id: 'ins-mod-sla',
      severity: 'critical',
      headline: 'Tempo médio até a moderação está alto.',
      suggestion: 'Priorizar fila de moderação, revisar turnos ou ampliar capacidade de revisão.'
    });
  }

  if (toneRej === 'bad' && !rejectionReasonInsight && rr != null) {
    out.push({
      id: 'ins-rej-rate-only',
      severity: 'warning',
      headline: `Taxa de rejeição geral está alta (${fmtPct(rr)}).`,
      suggestion: 'Abrir o breakdown de motivos abaixo e alinhar comunicação no app aos principais códigos.'
    });
  }

  if (
    typeof approvalRate === 'number' &&
    Number.isFinite(approvalRate) &&
    approvalRate < 0.72 &&
    !out.some((x) => x.id.startsWith('ins-rej'))
  ) {
    out.push({
      id: 'ins-approval-low',
      severity: 'warning',
      headline: `Taxa de aprovação de fotos moderadas está baixa (${fmtPct(approvalRate)}).`,
      suggestion: 'Cruzar com motivos de rejeição e testar instruções mais claras no envio da foto.'
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out.slice(0, 6);
}

function rejectionReasonLabel(code) {
  const c = String(code ?? '').trim();
  if (!c || c === '(sem código)') return c === '(sem código)' ? 'Sem código' : '—';
  const map = {
    illegible_dark: 'Foto ilegível/escura',
    not_proof: 'Não comprova atividade',
    duplicate_reused: 'Foto duplicada/reutilizada',
    inappropriate: 'Conteúdo impróprio',
    screenshot: 'Foto de tela/print',
    workout_mismatch: 'Tipo de treino não condizente',
    other: 'Outro'
  };
  return map[c] ?? c;
}

function fmtPct(n) {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 1000) / 10}%`;
}

function fmtNum(n, digits = 2) {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function fmtDateTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function pctChange(curr, prev) {
  if (curr == null || prev == null) return null;
  if (typeof curr !== 'number' || typeof prev !== 'number') return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) {
    if (curr === 0) return 0;
    return null;
  }
  return (curr - prev) / Math.abs(prev);
}

/** Borda + fundo do card KPI (US-ADM-14: verde = bom, âmbar = atenção, vermelho = problema). */
const KPI_TONE_CARD = {
  good: 'border-green-500/45 bg-green-950/20 ring-1 ring-inset ring-green-500/15',
  warn: 'border-amber-500/50 bg-amber-950/30 ring-1 ring-inset ring-amber-500/15',
  bad: 'border-red-500/45 bg-red-950/25 ring-1 ring-inset ring-red-500/15',
  neutral: 'border-zinc-800/90 bg-zinc-950/40 ring-1 ring-inset ring-zinc-800/50'
};

function kpiCardClass(tone) {
  return KPI_TONE_CARD[tone] ?? KPI_TONE_CARD.neutral;
}

/** Métricas de volume: compara com período anterior (delta relativo). */
function toneVolumeDelta(delta) {
  if (delta == null || typeof delta !== 'number' || !Number.isFinite(delta)) return 'neutral';
  if (delta >= 0.03) return 'good';
  if (delta <= -0.12) return 'bad';
  if (delta < 0) return 'warn';
  return 'neutral';
}

function toneHigherIsBetter(rate, goodMin, warnMin) {
  if (rate == null || typeof rate !== 'number' || !Number.isFinite(rate)) return 'neutral';
  if (rate >= goodMin) return 'good';
  if (rate >= warnMin) return 'warn';
  return 'bad';
}

function toneLowerIsBetter(rate, goodMax, warnMax) {
  if (rate == null || typeof rate !== 'number' || !Number.isFinite(rate)) return 'neutral';
  if (rate <= goodMax) return 'good';
  if (rate <= warnMax) return 'warn';
  return 'bad';
}

/** Horas até moderação: menor é melhor. */
function toneModerationHours(h) {
  if (h == null || typeof h !== 'number' || !Number.isFinite(h)) return 'neutral';
  if (h <= 12) return 'good';
  if (h <= 48) return 'warn';
  return 'bad';
}

function deltaVisuals(delta, invert = false) {
  if (delta == null) return { arrow: null, pct: null, cls: 'text-zinc-600' };
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const pct = `${Math.round(delta * 1000) / 10}%`;
  let cls;
  if (!invert) {
    if (delta >= 0.02) cls = 'text-green-400';
    else if (delta <= -0.12) cls = 'text-red-400';
    else if (delta < 0) cls = 'text-amber-400';
    else cls = 'text-zinc-500';
  } else {
    if (delta <= -0.02) cls = 'text-green-400';
    else if (delta >= 0.12) cls = 'text-red-400';
    else if (delta > 0) cls = 'text-amber-400';
    else cls = 'text-zinc-500';
  }
  return { arrow, pct, cls };
}

/** Variação compacta para linha principal do card: (↓ 12%) */
function DeltaInline({ delta, invert = false }) {
  if (delta == null) {
    return <span className="text-sm font-semibold text-zinc-600">(—)</span>;
  }
  const { arrow, pct, cls } = deltaVisuals(delta, invert);
  return (
    <span className={`text-sm font-semibold whitespace-nowrap ${cls}`}>
      ({arrow} {pct})
    </span>
  );
}

function addDays(d, delta) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + delta);
  return x;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function csvEscape(cell) {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDayPtBR(iso) {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return String(iso ?? '—');
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return s;
  try {
    return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch {
    return s;
  }
}

/** Seções opcionais do CSV (US-ADM-14 exportação). */
const CSV_SECTION_KEYS = {
  meta: 'meta',
  summary: 'summary',
  rejectionRank: 'rejectionRank',
  seriesByDay: 'seriesByDay',
  topRejectionCodes: 'topRejectionCodes'
};

const DEFAULT_CSV_SECTIONS = {
  [CSV_SECTION_KEYS.meta]: true,
  [CSV_SECTION_KEYS.summary]: true,
  [CSV_SECTION_KEYS.rejectionRank]: true,
  [CSV_SECTION_KEYS.seriesByDay]: true,
  [CSV_SECTION_KEYS.topRejectionCodes]: true
};

/** Mescla objeto salvo com defaults; ignora chaves desconhecidas. */
function mergeCsvSectionsFromStorage(raw) {
  const out = { ...DEFAULT_CSV_SECTIONS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.values(CSV_SECTION_KEYS)) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

const CSV_SECTION_LABELS = [
  { key: CSV_SECTION_KEYS.meta, label: 'Cabeçalho e período' },
  { key: CSV_SECTION_KEYS.summary, label: 'Resumo (KPIs)' },
  { key: CSV_SECTION_KEYS.rejectionRank, label: 'Ranking de motivos de rejeição' },
  { key: CSV_SECTION_KEYS.seriesByDay, label: 'Série diária (dia, check-ins, DAU, novos)' },
  { key: CSV_SECTION_KEYS.topRejectionCodes, label: 'Top motivos (código + contagem)' }
];

function sanitizeFilenamePart(s) {
  return String(s ?? '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'export';
}

/**
 * @param {object} payload — resposta de admin_engagement_metrics (já filtrada pelo RPC)
 * @param {Record<string, boolean>} sections — quais blocos incluir
 * @param {string[]} [filterLines] — linhas humanas # descrevendo filtros ativos na UI
 */
function buildCsv(payload, sections, filterLines = []) {
  const s = { ...DEFAULT_CSV_SECTIONS, ...sections };
  const lines = [];
  const period = payload?.period ?? {};
  const summary = payload?.summary ?? {};
  const byDay = Array.isArray(payload?.series?.by_day) ? payload.series.by_day : [];
  const rb = payload?.rejection_breakdown;

  if (s[CSV_SECTION_KEYS.meta]) {
    lines.push('# FitRank — Export engajamento (admin)');
    lines.push('# Dados: período e segmentação conforme filtros ativos no painel (mesma consulta do dashboard).');
    for (const fl of filterLines) {
      if (String(fl).trim()) lines.push(`# ${String(fl).trim()}`);
    }
    lines.push(
      `# inicio,${period.start ?? ''},fim,${period.end ?? ''},tenant_id,${period.tenant_id ?? 'all'},region,${period.region ?? 'all'},user_type,${period.user_type ?? 'all'},plan,${period.plan ?? 'all'}`
    );
  }

  if (s[CSV_SECTION_KEYS.summary]) {
    if (lines.length) lines.push('');
    lines.push('metric,value');
    lines.push(`total_checkins,${summary.total_checkins ?? ''}`);
    lines.push(`checkins_por_dia,${summary.checkins_per_day ?? ''}`);
    lines.push(`dau_medio,${summary.dau_avg ?? ''}`);
    lines.push(`novos_cadastros,${summary.new_profiles ?? ''}`);
    lines.push(`checkins_com_foto,${summary.checkins_with_photo ?? ''}`);
    lines.push(`taxa_foto,${summary.photo_rate ?? ''}`);
    lines.push(`moderacoes_no_periodo,${summary.moderated_photo_count ?? ''}`);
    lines.push(`horas_medias_ate_moderacao,${summary.avg_moderation_hours ?? ''}`);
    lines.push(`rejeicoes,${summary.rejected_moderation_count ?? ''}`);
    lines.push(`taxa_rejeicao,${summary.rejection_rate ?? ''}`);
    if (rb && typeof rb.total_rejected === 'number') {
      lines.push(`rejeicoes_total_periodo,${rb.total_rejected}`);
    }
  }

  if (s[CSV_SECTION_KEYS.rejectionRank]) {
    if (lines.length) lines.push('');
    lines.push('rank,code,count,pct');
    const rrank = Array.isArray(rb?.reasons) ? rb.reasons : [];
    for (const r of rrank) {
      lines.push([csvEscape(r.rank), csvEscape(r.code), csvEscape(r.count), csvEscape(r.pct)].join(','));
    }
  }

  if (s[CSV_SECTION_KEYS.seriesByDay]) {
    if (lines.length) lines.push('');
    lines.push('day,checkins,dau,novos_cadastros');
    for (const row of byDay) {
      lines.push(
        [csvEscape(row.day), csvEscape(row.checkins), csvEscape(row.dau), csvEscape(row.new_profiles)].join(',')
      );
    }
  }

  if (s[CSV_SECTION_KEYS.topRejectionCodes]) {
    if (lines.length) lines.push('');
    lines.push('rejection_code,count');
    const top = Array.isArray(payload?.top_rejection_reasons) ? payload.top_rejection_reasons : [];
    for (const r of top) {
      lines.push(`${csvEscape(r.code)},${csvEscape(r.count)}`);
    }
  }

  return lines.join('\r\n');
}

function buildEngagementFilterLines({ tenantLabel, regionLabel, userTypeLabel, planLabel }) {
  return [
    `filtro_academia=${tenantLabel}`,
    `filtro_regiao=${regionLabel}`,
    `filtro_tipo_usuario=${userTypeLabel}`,
    `filtro_plano=${planLabel}`
  ];
}

function buildEngagementExportFilename(startStr, endStr, { tenantSlug, regionPart, userTypePart, planPart }) {
  const seg = [tenantSlug, regionPart, userTypePart, planPart].map(sanitizeFilenamePart).filter(Boolean);
  const suffix = seg.length ? `_${seg.join('_')}` : '';
  return `fitrank-engajamento_${startStr}_${endStr}${suffix}.csv`;
}

const CHART_PAD_X = 14;
const CHART_LINE_TOP = 10;
const CHART_LINE_BOT = 78;
const CHART_BAR_TOP = 84;
const CHART_BAR_BOT = 138;
const CHART_H = 152;
const MIN_COL_PX = 11;

function EngagementLineBarChart({
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
      setTip({
        x: e.clientX - outer.left,
        y: e.clientY - outer.top,
        idx
      });
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
            <line
              x1={CHART_PAD_X}
              y1={CHART_LINE_BOT}
              x2={vbW - CHART_PAD_X}
              y2={CHART_LINE_BOT}
              stroke="rgb(39 39 42)"
              strokeWidth="1"
            />
            <line
              x1={CHART_PAD_X}
              y1={CHART_BAR_BOT}
              x2={vbW - CHART_PAD_X}
              y2={CHART_BAR_BOT}
              stroke="rgb(39 39 42)"
              strokeWidth="1"
            />
            {layout.bars.map((b) => {
              const sel = selectedDay && data[b.i]?.day === selectedDay;
              const hov = hi === b.i;
              return (
                <rect
                  key={`bar-${b.i}`}
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={2}
                  fill={barColor}
                  stroke={sel ? 'rgb(74 222 128)' : hov ? 'rgb(161 161 170 / 0.6)' : 'none'}
                  strokeWidth={sel || hov ? 1.5 : 0}
                  className="transition-colors"
                />
              );
            })}
            {layout.linePathD ? (
              <path
                d={layout.linePathD}
                fill="none"
                stroke={lineColor}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {layout.linePts.map((p) => {
              const hov = hi === p.i;
              const sel = selectedDay && data[p.i]?.day === selectedDay;
              if (!hov && !sel) return null;
              return (
                <circle
                  key={`dot-${p.i}`}
                  cx={p.x}
                  cy={p.y}
                  r={sel ? 5 : 4}
                  fill="rgb(22 101 52)"
                  stroke="rgb(74 222 128)"
                  strokeWidth={2}
                />
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

export function AdminEngagementView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();
  const edgeReady = useMemo(
    () =>
      Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
    [supabase, profile?.is_platform_master, authLoading, session?.access_token]
  );
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [userType, setUserType] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [preset, setPreset] = useState('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartHoverIdx, setChartHoverIdx] = useState(null);
  const [drillDay, setDrillDay] = useState(null);
  const [rejectReasonCode, setRejectReasonCode] = useState(null);
  const [rejectExamples, setRejectExamples] = useState([]);
  const [rejectExamplesLoading, setRejectExamplesLoading] = useState(false);
  const [rejectExamplesError, setRejectExamplesError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);
  const [csvSections, setCsvSections] = useState(() => ({ ...DEFAULT_CSV_SECTIONS }));
  const [csvOptionsOpen, setCsvOptionsOpen] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const adminUiPrefsBaseRef = useRef(null);

  useEffect(() => {
    if (!supabase || !profile?.id || !profile?.is_platform_master) {
      setPrefsHydrated(false);
      adminUiPrefsBaseRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('admin_ui_preferences')
        .eq('id', profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('FitRank: admin_ui_preferences', error.message);
        adminUiPrefsBaseRef.current = {};
        setPrefsHydrated(true);
        return;
      }
      const raw = data?.admin_ui_preferences;
      const base = raw && typeof raw === 'object' ? { ...raw } : {};
      adminUiPrefsBaseRef.current = base;
      setCsvSections(mergeCsvSectionsFromStorage(base.engagement_csv_sections));
      setPrefsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profile?.id, profile?.is_platform_master]);

  useEffect(() => {
    if (!supabase || !profile?.id || !profile?.is_platform_master || !prefsHydrated) return;

    const t = window.setTimeout(async () => {
      const base =
        adminUiPrefsBaseRef.current && typeof adminUiPrefsBaseRef.current === 'object'
          ? { ...adminUiPrefsBaseRef.current }
          : {};
      const next = { ...base, engagement_csv_sections: csvSections };
      const { error } = await supabase
        .from('profiles')
        .update({ admin_ui_preferences: next })
        .eq('id', profile.id);
      if (error) {
        console.error('FitRank: salvar colunas CSV (admin_ui_preferences)', error.message);
        return;
      }
      adminUiPrefsBaseRef.current = next;
    }, 500);

    return () => window.clearTimeout(t);
  }, [csvSections, prefsHydrated, supabase, profile?.id, profile?.is_platform_master]);

  const loadTenants = useCallback(async () => {
    if (!edgeReady) return;
    const { data: res, error: fnError } = await invokeEdge('admin-tenants', supabase, { method: 'GET' });
    if (!fnError && !res?.error) {
      setTenants(res?.tenants ?? []);
    }
  }, [edgeReady, supabase]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const { startStr, endStr } = useMemo(() => {
    const end = new Date();
    const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (useCustom && customStart && customEnd && customStart <= customEnd) {
      return { startStr: customStart, endStr: customEnd };
    }
    const days = preset === '7' ? 6 : preset === '90' ? 89 : 29;
    const startD = addDays(endD, -days);
    return { startStr: toISODate(startD), endStr: toISODate(endD) };
  }, [preset, useCustom, customStart, customEnd]);

  const regionOptions = useMemo(() => {
    const set = new Set();
    for (const t of tenants) {
      const r = String(t.region ?? '').trim();
      if (r) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [tenants]);

  const segmentRpcParams = useMemo(
    () => ({
      p_region: regionFilter.trim() || null,
      p_user_type: userType === 'all' ? null : userType,
      p_plan: planFilter === 'all' ? null : planFilter
    }),
    [regionFilter, userType, planFilter]
  );

  const { prevStartStr, prevEndStr } = useMemo(() => {
    const startD = new Date(`${startStr}T00:00:00.000Z`);
    const endD = new Date(`${endStr}T00:00:00.000Z`);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
      return { prevStartStr: null, prevEndStr: null };
    }
    const days = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1);
    const prevEnd = addDays(startD, -1);
    const prevStart = addDays(prevEnd, -(days - 1));
    return { prevStartStr: toISODate(prevStart), prevEndStr: toISODate(prevEnd) };
  }, [startStr, endStr]);

  const loadMetrics = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);
    try {
      const args = {
        p_start: startStr,
        p_end: endStr,
        p_tenant_id: tenantId ? tenantId : null,
        ...segmentRpcParams
      };
      const prevArgs =
        prevStartStr && prevEndStr
          ? {
              p_start: prevStartStr,
              p_end: prevEndStr,
              p_tenant_id: tenantId ? tenantId : null,
              ...segmentRpcParams
            }
          : null;

      const [currRes, prevRes] = await Promise.all([
        supabase.rpc('admin_engagement_metrics', args),
        prevArgs ? supabase.rpc('admin_engagement_metrics', prevArgs) : Promise.resolve({ data: null, error: null })
      ]);

      if (currRes.error) {
        setData(null);
        setPrevData(null);
        setError(currRes.error.message ?? 'Falha ao carregar métricas');
        return;
      }
      if (prevRes?.error) {
        // Não bloqueia o dashboard, mas remove comparação
        setPrevData(null);
      } else {
        setPrevData(prevRes?.data ?? null);
      }
      setData(currRes.data);
    } catch (e) {
      setData(null);
      setPrevData(null);
      setError(e?.message ?? 'Falha ao carregar métricas');
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    profile?.is_platform_master,
    startStr,
    endStr,
    tenantId,
    prevStartStr,
    prevEndStr,
    segmentRpcParams
  ]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const loadAlerts = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setAlerts([]);
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const { data: raw, error: rpcErr } = await supabase.rpc('admin_engagement_alerts', {
        p_tenant_id: tenantId ? tenantId : null,
        ...segmentRpcParams
      });
      if (rpcErr) {
        setAlerts([]);
        setAlertsError(rpcErr.message ?? 'Falha ao carregar alertas');
        return;
      }
      const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
      setAlerts(list);
    } catch (err) {
      setAlerts([]);
      setAlertsError(err?.message ?? 'Falha ao carregar alertas');
    } finally {
      setAlertsLoading(false);
    }
  }, [supabase, profile?.is_platform_master, tenantId, segmentRpcParams]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    setDrillDay(null);
    setChartHoverIdx(null);
    setRejectReasonCode(null);
    setRejectExamples([]);
    setRejectExamplesError(null);
  }, [startStr, endStr, tenantId, segmentRpcParams]);

  const loadRejectExamples = useCallback(
    async (code) => {
      if (!supabase || !profile?.is_platform_master || !code) return;
      setRejectExamples([]);
      setRejectExamplesLoading(true);
      setRejectExamplesError(null);
      try {
        const { data: rows, error: rpcErr } = await supabase.rpc('admin_rejection_examples', {
          p_start: startStr,
          p_end: endStr,
          p_tenant_id: tenantId ? tenantId : null,
          p_reason_code: code,
          p_limit: 15,
          ...segmentRpcParams
        });
        if (rpcErr) {
          setRejectExamples([]);
          setRejectExamplesError(rpcErr.message ?? 'Falha ao carregar exemplos');
          return;
        }
        const list = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? Object.values(rows) : [];
        setRejectExamples(list);
      } catch (err) {
        setRejectExamples([]);
        setRejectExamplesError(err?.message ?? 'Falha ao carregar exemplos');
      } finally {
        setRejectExamplesLoading(false);
      }
    },
    [supabase, profile?.is_platform_master, startStr, endStr, tenantId, segmentRpcParams]
  );

  const onPickRejectionReason = (code) => {
    if (rejectReasonCode === code) {
      setRejectReasonCode(null);
      setRejectExamples([]);
      setRejectExamplesError(null);
      return;
    }
    setRejectReasonCode(code);
    loadRejectExamples(code);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (rejectReasonCode) {
          setRejectReasonCode(null);
          setRejectExamples([]);
          setRejectExamplesError(null);
        } else {
          setDrillDay(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rejectReasonCode]);

  const userTypeExportLabel = useMemo(() => {
    if (userType === 'all') return 'todos';
    if (userType === 'free') return 'free';
    if (userType === 'pro') return 'pro';
    return userType;
  }, [userType]);

  const planExportLabel = useMemo(() => {
    if (planFilter === 'all') return 'todos';
    if (planFilter === 'free') return 'gratuito';
    if (planFilter === 'paid') return 'pago';
    return planFilter;
  }, [planFilter]);

  const tenantExportLabel = useMemo(() => {
    if (!tenantId) return 'todas';
    const t = tenants.find((x) => x.id === tenantId);
    return t?.slug ?? t?.name ?? tenantId.slice(0, 8);
  }, [tenantId, tenants]);

  const regionExportLabel = useMemo(() => {
    const r = String(regionFilter ?? '').trim();
    return r || 'todas';
  }, [regionFilter]);

  const csvSectionCount = useMemo(
    () => Object.values(csvSections).filter(Boolean).length,
    [csvSections]
  );

  const exportCsv = () => {
    if (!data) return;
    if (csvSectionCount === 0) return;
    const filterLines = buildEngagementFilterLines({
      tenantLabel: tenantExportLabel,
      regionLabel: regionExportLabel,
      userTypeLabel: userTypeExportLabel,
      planLabel: planExportLabel
    });
    const csv = buildCsv(data, csvSections, filterLines);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildEngagementExportFilename(startStr, endStr, {
      tenantSlug: tenantExportLabel,
      regionPart: regionExportLabel === 'todas' ? '' : `reg-${regionExportLabel}`,
      userTypePart: `tipo-${userTypeExportLabel}`,
      planPart: `plano-${planExportLabel}`
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCsvSection = (key) => {
    setCsvSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllCsvSections = () => {
    setCsvSections({ ...DEFAULT_CSV_SECTIONS });
  };

  if (!profile?.is_platform_master) {
    return null;
  }

  const summary = data?.summary ?? {};
  const prevSummary = prevData?.summary ?? {};
  const byDay = Array.isArray(data?.series?.by_day) ? data.series.by_day : [];
  const topReasons = Array.isArray(data?.top_rejection_reasons) ? data.top_rejection_reasons : [];
  const rejectionBreakdown = data?.rejection_breakdown;
  const rejectionTotalKnown =
    typeof rejectionBreakdown?.total_rejected === 'number' ? rejectionBreakdown.total_rejected : null;
  let rejectionRanking = Array.isArray(rejectionBreakdown?.reasons) ? rejectionBreakdown.reasons : [];
  if (rejectionRanking.length === 0 && topReasons.length > 0) {
    const t = topReasons.reduce((acc, r) => acc + (Number(r.count) || 0), 0);
    rejectionRanking = topReasons.map((r, i) => ({
      rank: i + 1,
      code: r.code,
      count: r.count,
      pct: t > 0 ? (Number(r.count) || 0) / t : null
    }));
  }
  const drillIdx = drillDay ? byDay.findIndex((d) => d.day === drillDay) : -1;
  const drillRow = drillIdx >= 0 ? byDay[drillIdx] : null;
  const drillPrevRow = drillIdx > 0 ? byDay[drillIdx - 1] : null;
  const approvalRate =
    typeof summary?.rejection_rate === 'number' && Number.isFinite(summary.rejection_rate)
      ? Math.max(0, Math.min(1, 1 - summary.rejection_rate))
      : null;
  const prevApprovalRate =
    typeof prevSummary?.rejection_rate === 'number' && Number.isFinite(prevSummary.rejection_rate)
      ? Math.max(0, Math.min(1, 1 - prevSummary.rejection_rate))
      : null;

  const dCheckins = pctChange(summary.checkins_per_day, prevSummary.checkins_per_day);
  const dDau = pctChange(summary.dau_avg, prevSummary.dau_avg);
  const dNew = pctChange(summary.new_profiles ?? 0, prevSummary.new_profiles ?? 0);
  const dPhoto = pctChange(summary.photo_rate, prevSummary.photo_rate);
  const dModH = pctChange(summary.avg_moderation_hours, prevSummary.avg_moderation_hours);
  const dRej = pctChange(summary.rejection_rate, prevSummary.rejection_rate);
  const dAppr = pctChange(approvalRate, prevApprovalRate);

  const toneCheckins = toneVolumeDelta(dCheckins);
  const toneDau = toneVolumeDelta(dDau);
  const toneNew = toneVolumeDelta(dNew);
  const tonePhoto = toneHigherIsBetter(summary.photo_rate, 0.6, 0.35);
  const toneMod =
    summary.avg_moderation_hours != null
      ? toneModerationHours(summary.avg_moderation_hours)
      : 'neutral';
  const toneRej = toneLowerIsBetter(summary.rejection_rate, 0.08, 0.22);
  const toneAppr = toneHigherIsBetter(approvalRate, 0.85, 0.7);

  const engagementInsights = data
    ? buildEngagementInsights({
        rejectionRanking,
        rejectionRate: summary.rejection_rate,
        moderatedPhotoCount: summary.moderated_photo_count,
        dCheckins,
        tonePhoto,
        toneMod,
        toneRej,
        approvalRate
      })
    : [];

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Engajamento</h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        KPIs por período, tenant e segmentação (US-ADM-14). Datas derivadas de horários (cadastro, moderação) usam{' '}
        <span className="text-zinc-400">America/São Paulo</span>; séries de check-in usam{' '}
        <span className="text-zinc-400">checkin_local_date</span> (data local do registro).
      </p>

      <Card className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase font-black text-zinc-500">Academia (tenant)</label>
            <select
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            >
              <option value="">Todas</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase font-black text-zinc-500">Região (tenant)</label>
            <select
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-50"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              disabled={regionOptions.length === 0}
              title={
                regionOptions.length === 0
                  ? 'Nenhuma região cadastrada em tenants.region; defina no banco para habilitar o filtro.'
                  : undefined
              }
            >
              <option value="">Todas</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {regionOptions.length === 0 ? (
              <p className="text-[9px] text-zinc-600 leading-snug">
                Coluna <span className="font-mono text-zinc-500">tenants.region</span> vazia — preencha no Supabase para
                filtrar por região.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase font-black text-zinc-500">Tipo de usuário</label>
            <select
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="free">Free (não Pro)</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase font-black text-zinc-500">Plano (cobrança)</label>
            <select
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="free">Gratuito (sem assinatura Stripe)</option>
              <option value="paid">Pago (Pro ou assinatura)</option>
            </select>
            <p className="text-[9px] text-zinc-600 leading-snug">
              Pago considera <span className="font-mono text-zinc-500">is_pro</span> ou{' '}
              <span className="font-mono text-zinc-500">stripe_subscription_id</span> preenchido.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => {
                const on = e.target.checked;
                setUseCustom(on);
                if (on) {
                  const now = new Date();
                  const endD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  setCustomEnd(toISODate(endD));
                  setCustomStart(toISODate(addDays(endD, -29)));
                }
              }}
              className="rounded border-zinc-600"
            />
            Datas customizadas
          </label>
        </div>

        {!useCustom ? (
          <div className="flex flex-wrap gap-2">
            {[
              { id: '7', label: '7 dias' },
              { id: '30', label: '30 dias' },
              { id: '90', label: '90 dias' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`text-xs px-3 py-2 rounded-xl border ${
                  preset === p.id
                    ? 'border-green-500/60 bg-green-500/10 text-green-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-zinc-500 block mb-1">Início</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-zinc-500 block mb-1">Fim</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Button
            type="button"
            variant="secondary"
            className="text-xs py-2"
            onClick={() => {
              loadMetrics();
              loadAlerts();
            }}
            disabled={loading}
          >
            Atualizar
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="text-xs py-2"
            onClick={() => setCsvOptionsOpen((o) => !o)}
            disabled={!data || loading}
            aria-expanded={csvOptionsOpen}
          >
            Colunas do CSV
          </Button>
          <Button type="button" className="text-xs py-2" onClick={exportCsv} disabled={!data || loading || csvSectionCount === 0}>
            Exportar CSV
          </Button>
        </div>

        {csvOptionsOpen && data ? (
          <div
            className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-3"
            role="region"
            aria-label="Opções de exportação CSV"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] uppercase font-black text-zinc-500">Incluir no arquivo CSV</p>
              <button
                type="button"
                className="text-[10px] text-green-500 hover:text-green-400"
                onClick={selectAllCsvSections}
              >
                Marcar todas
              </button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CSV_SECTION_LABELS.map(({ key, label }) => (
                <li key={key}>
                  <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!csvSections[key]}
                      onChange={() => toggleCsvSection(key)}
                      className="rounded border-zinc-600 mt-0.5 shrink-0"
                    />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-[9px] text-zinc-500 leading-snug">
              O arquivo usa os <span className="text-zinc-400">mesmos filtros e período</span> do painel (academia,
              região, tipo de usuário, plano) — é a visão atual dos KPIs, não um histórico global.
            </p>
            <p className="text-[9px] text-zinc-600 italic border-t border-zinc-800/80 pt-2">
              Exportação automática agendada (e-mail / storage) — previsto para evolução futura; por enquanto use o
              download manual.
            </p>
          </div>
        ) : null}
      </Card>

      <Card className="border-amber-500/20 bg-zinc-950/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" aria-hidden />
            <div>
              <h3 className="text-sm font-black text-zinc-200 uppercase">Alertas inteligentes</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Últimas <span className="text-zinc-400">24h</span> vs <span className="text-zinc-400">24h anteriores</span>{' '}
                (janelas alinhadas a <span className="text-zinc-400">America/São Paulo</span>; respeitam os filtros de
                segmentação acima).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-[10px] text-zinc-500 hover:text-green-400 shrink-0"
            onClick={() => loadAlerts()}
            disabled={alertsLoading}
          >
            {alertsLoading ? '…' : 'Recarregar'}
          </button>
        </div>
        {alertsError ? (
          <p className="text-red-400 text-xs mt-3" role="alert">
            {alertsError}
            <span className="block text-[10px] text-zinc-600 mt-1">
              Aplique a migration <span className="font-mono">admin_engagement_alerts</span> se ainda não estiver no
              banco.
            </span>
          </p>
        ) : null}
        {alertsLoading && alerts.length === 0 && !alertsError ? (
          <p className="text-xs text-zinc-500 mt-3">Analisando sinais…</p>
        ) : null}
        {!alertsLoading && !alertsError && alerts.length === 0 ? (
          <p className="text-xs text-zinc-500 mt-3">Nenhum alerta no momento — tudo dentro dos limiares.</p>
        ) : null}
        {alerts.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {alerts.map((a, idx) => {
              const crit = a?.severity === 'critical';
              return (
                <li
                  key={`${a?.id ?? 'alert'}-${idx}`}
                  className={`rounded-xl border px-3 py-2.5 text-sm leading-snug ${
                    crit
                      ? 'border-red-500/40 bg-red-950/25 text-red-100'
                      : 'border-amber-500/30 bg-amber-950/20 text-amber-50'
                  }`}
                >
                  {a?.message ?? '—'}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {loading && !data ? <p className="text-zinc-500 text-sm">Carregando…</p> : null}

      {data ? (
        <>
          <p className="text-[10px] text-zinc-500 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-zinc-400">Indicadores:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" aria-hidden />
              Verde = bom
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" aria-hidden />
              Amarelo = atenção
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]" aria-hidden />
              Vermelho = problema
            </span>
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Card className={kpiCardClass(toneCheckins)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">Check-ins / dia</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {fmtNum(summary.checkins_per_day, 2)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> check-ins/dia</span>
                </span>
                <DeltaInline delta={dCheckins} />
              </p>
            </Card>
            <Card className={kpiCardClass(toneDau)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">DAU médio</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {fmtNum(summary.dau_avg, 2)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> usuários ativos/dia</span>
                </span>
                <DeltaInline delta={dDau} />
              </p>
            </Card>
            <Card className={kpiCardClass(toneNew)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">Novos cadastros</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {fmtNum(summary.new_profiles ?? 0, 0)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> novos no período</span>
                </span>
                <DeltaInline delta={dNew} />
              </p>
            </Card>
            <Card className={kpiCardClass(tonePhoto)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">Taxa com foto</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {fmtPct(summary.photo_rate)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> com foto</span>
                </span>
                <DeltaInline delta={dPhoto} />
              </p>
            </Card>
            <Card className={kpiCardClass(toneMod)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">Tempo médio até moderação</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {summary.avg_moderation_hours != null ? (
                    <>
                      {fmtNum(summary.avg_moderation_hours, 2)}
                      <span className="text-sm font-semibold text-zinc-400 font-sans"> h até moderação</span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                {summary.avg_moderation_hours != null ? (
                  <DeltaInline delta={dModH} invert />
                ) : (
                  <span className="text-sm font-semibold text-zinc-600">(—)</span>
                )}
              </p>
              <p className="text-[9px] text-zinc-600 mt-1">Fotos moderadas no período (por data da decisão)</p>
            </Card>
            <Card className={kpiCardClass(toneRej)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">Taxa de rejeição</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {fmtPct(summary.rejection_rate)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> rejeição</span>
                </span>
                <DeltaInline delta={dRej} invert />
              </p>
              <p className="text-[9px] text-zinc-600 mt-1">
                {summary.rejected_moderation_count ?? 0} / {summary.moderated_photo_count ?? 0} moderações
              </p>
            </Card>
            <Card className={kpiCardClass(toneAppr)}>
              <p className="text-[10px] uppercase font-black text-zinc-500">Taxa de aprovação</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xl font-black text-white tabular-nums">
                  {fmtPct(approvalRate)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> aprovação</span>
                </span>
                <DeltaInline delta={dAppr} />
              </p>
              <p className="text-[9px] text-zinc-600 mt-1">Aprovação = 1 − rejeição (somente fotos moderadas)</p>
            </Card>
          </div>

          {engagementInsights.length > 0 ? (
            <Card className="border-violet-500/35 bg-gradient-to-br from-violet-950/40 to-zinc-950/80 ring-1 ring-inset ring-violet-500/20 space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25">
                  <Lightbulb className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-tight text-white">Insights</h3>
                  <p className="text-[10px] text-zinc-500 leading-snug">
                    Gerados automaticamente com base nos KPIs, no período anterior e no breakdown de rejeições (US-ADM-14).
                  </p>
                </div>
              </div>
              <ul className="space-y-3" role="list">
                {engagementInsights.map((ins) => (
                  <li
                    key={ins.id}
                    role="listitem"
                    className={`rounded-xl py-3 pr-3 ${
                      ins.severity === 'critical'
                        ? 'border-l-[3px] border-red-500 bg-red-950/30 pl-3'
                        : ins.severity === 'warning'
                          ? 'border-l-[3px] border-amber-500 bg-amber-950/25 pl-3'
                          : 'border-l-[3px] border-sky-500/90 bg-sky-950/20 pl-3'
                    }`}
                  >
                    <p className="text-sm font-semibold text-zinc-100 leading-snug">{ins.headline}</p>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      <span className="text-amber-200/90 font-semibold">Sugestão: </span>
                      {ins.suggestion}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <h3 className="text-sm font-black text-zinc-300 uppercase">Gráficos interativos</h3>
              <p className="text-[10px] text-zinc-500">
                Passe o mouse para ver o dia · clique para drill-down · <span className="text-zinc-400">Esc</span> fecha
                o painel
              </p>
            </div>
            <EngagementLineBarChart
              title="Check-ins por dia"
              data={byDay}
              valueKey="checkins"
              valueLabel="Check-ins"
              hoverIdx={chartHoverIdx}
              onHoverIdx={setChartHoverIdx}
              selectedDay={drillDay}
              onSelectDay={setDrillDay}
            />
            <EngagementLineBarChart
              title="DAU por dia"
              data={byDay}
              valueKey="dau"
              valueLabel="Usuários ativos"
              hoverIdx={chartHoverIdx}
              onHoverIdx={setChartHoverIdx}
              selectedDay={drillDay}
              onSelectDay={setDrillDay}
              lineColor="rgb(96 165 250 / 0.95)"
              barColor="rgb(96 165 250 / 0.4)"
            />
            <EngagementLineBarChart
              title="Novos cadastros por dia"
              data={byDay}
              valueKey="new_profiles"
              valueLabel="Novos cadastros"
              hoverIdx={chartHoverIdx}
              onHoverIdx={setChartHoverIdx}
              selectedDay={drillDay}
              onSelectDay={setDrillDay}
              lineColor="rgb(251 191 36 / 0.95)"
              barColor="rgb(251 191 36 / 0.38)"
            />
            {drillRow ? (
              <div
                className="rounded-xl border border-green-500/25 bg-zinc-950/80 p-4 space-y-3"
                role="region"
                aria-label="Detalhes do dia selecionado"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase font-black text-zinc-500">Drill-down do dia</p>
                    <p className="text-lg font-black text-white">{formatDayPtBR(drillRow.day)}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{drillRow.day}</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-zinc-500 hover:text-green-400 shrink-0"
                    onClick={() => setDrillDay(null)}
                  >
                    Fechar
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Check-ins</p>
                    <p className="text-xl font-black text-white mt-1">{drillRow.checkins ?? 0}</p>
                    {drillPrevRow ? (
                      <p className="text-[10px] text-zinc-600 mt-1">
                        dia anterior: {drillPrevRow.checkins ?? 0}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                    <p className="text-[10px] text-zinc-500 uppercase font-black">DAU</p>
                    <p className="text-xl font-black text-white mt-1">{drillRow.dau ?? 0}</p>
                    {drillPrevRow ? (
                      <p className="text-[10px] text-zinc-600 mt-1">dia anterior: {drillPrevRow.dau ?? 0}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Novos cadastros</p>
                    <p className="text-xl font-black text-white mt-1">{drillRow.new_profiles ?? 0}</p>
                    {drillPrevRow ? (
                      <p className="text-[10px] text-zinc-600 mt-1">
                        dia anterior: {drillPrevRow.new_profiles ?? 0}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Os totais vêm da agregação diária do período (sem lista de check-ins individuais). Se quiser drill-down
                  até cada check-in, precisamos de endpoint/RPC admin com filtro por dia e tenant.
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-zinc-300 uppercase">Análise de rejeições</h3>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Usa o mesmo período e tenant dos filtros acima (data da decisão em America/São Paulo). Clique em um
                  motivo para ver exemplos reais.
                </p>
              </div>
              {rejectionTotalKnown != null ? (
                <p className="text-xs text-zinc-400 font-mono shrink-0">
                  Total: <span className="text-white font-black">{rejectionTotalKnown}</span> rejeições
                </p>
              ) : null}
            </div>
            {rejectionRanking.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhuma rejeição no período.</p>
            ) : (
              <ul className="space-y-2">
                {rejectionRanking.map((r) => {
                  const pct = typeof r.pct === 'number' && Number.isFinite(r.pct) ? r.pct : null;
                  const active = rejectReasonCode === r.code;
                  return (
                    <li key={r.code}>
                      <button
                        type="button"
                        onClick={() => onPickRejectionReason(r.code)}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                          active
                            ? 'border-green-500/50 bg-green-500/10'
                            : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-zinc-500 w-6 shrink-0">#{r.rank}</span>
                            <span className="text-sm text-zinc-100 truncate font-bold">
                              {rejectionReasonLabel(r.code)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-zinc-500 font-mono">{r.count}</span>
                            <span className="text-xs text-green-400 font-mono w-14 text-right">
                              {pct != null ? fmtPct(pct) : '—'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500/70"
                            style={{ width: pct != null ? `${Math.min(100, Math.round(pct * 1000) / 10)}%` : '0%' }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {rejectReasonCode ? (
              <div
                className="rounded-xl border border-zinc-800 bg-black/30 p-3 space-y-3"
                role="region"
                aria-label="Exemplos rejeitados do motivo selecionado"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black text-white">
                    Exemplos: {rejectionReasonLabel(rejectReasonCode)}
                  </p>
                  <button
                    type="button"
                    className="text-[10px] text-zinc-500 hover:text-green-400"
                    onClick={() => onPickRejectionReason(rejectReasonCode)}
                  >
                    Fechar
                  </button>
                </div>
                {rejectExamplesLoading ? (
                  <p className="text-xs text-zinc-500">Carregando exemplos…</p>
                ) : null}
                {rejectExamplesError ? (
                  <p className="text-xs text-red-400" role="alert">
                    {rejectExamplesError}
                    <span className="block text-[10px] text-zinc-600 mt-1">
                      Confirme se a migration <span className="font-mono">admin_rejection_examples</span> foi aplicada
                      no projeto.
                    </span>
                  </p>
                ) : null}
                {!rejectExamplesLoading && !rejectExamplesError && rejectExamples.length === 0 ? (
                  <p className="text-xs text-zinc-500">Nenhum exemplo encontrado para esse motivo no período.</p>
                ) : null}
                <div className="grid grid-cols-1 gap-3">
                  {rejectExamples.map((ex) => (
                    <div
                      key={ex.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden flex flex-col sm:flex-row gap-3 p-3"
                    >
                      <div className="sm:w-36 shrink-0">
                        {ex.foto_url ? (
                          <a
                            href={ex.foto_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg overflow-hidden border border-zinc-800"
                          >
                            <img
                              src={ex.foto_url}
                              alt=""
                              className="w-full h-32 sm:h-28 object-cover"
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <div className="h-32 sm:h-28 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
                            Sem foto
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1 text-xs">
                        <p className="text-zinc-500 font-mono text-[10px]">{ex.id}</p>
                        <p className="text-white font-bold">
                          {ex.tipo_treino ?? '—'}{' '}
                          <span className="text-zinc-500 font-normal">· {ex.checkin_local_date ?? '—'}</span>
                        </p>
                        <p className="text-zinc-500">
                          {ex.tenant_name || ex.tenant_slug ? (
                            <>
                              Academia:{' '}
                              <span className="text-zinc-300">{ex.tenant_name ?? ex.tenant_slug}</span>
                              {ex.tenant_slug ? (
                                <span className="text-zinc-600 font-mono ml-1">({ex.tenant_slug})</span>
                              ) : null}
                            </>
                          ) : (
                            'Academia: —'
                          )}
                        </p>
                        <p className="text-zinc-500">
                          Rejeitado em <span className="text-zinc-300">{fmtDateTime(ex.photo_reviewed_at)}</span>
                        </p>
                        {ex.photo_rejection_note ? (
                          <p className="text-zinc-400 border-l-2 border-zinc-700 pl-2 mt-2">
                            {ex.photo_rejection_note}
                          </p>
                        ) : null}
                        <p className="text-[10px] text-zinc-600 font-mono">user_id: {ex.user_id ?? '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
