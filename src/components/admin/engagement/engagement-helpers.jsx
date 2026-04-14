/** Shared helpers for AdminEngagementView subcomponents. */

export function rejectionReasonLabel(code) {
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

export function fmtPct(n) {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 1000) / 10}%`;
}

export function fmtNum(n, digits = 2) {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function fmtDateTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

export function pctChange(curr, prev) {
  if (curr == null || prev == null) return null;
  if (typeof curr !== 'number' || typeof prev !== 'number') return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / Math.abs(prev);
}

export function formatDayPtBR(iso) {
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

export function addDays(d, delta) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + delta);
  return x;
}

export function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export const KPI_TONE_CARD = {
  good: 'border-green-500/45 bg-green-950/20 ring-1 ring-inset ring-green-500/15',
  warn: 'border-amber-500/50 bg-amber-950/30 ring-1 ring-inset ring-amber-500/15',
  bad: 'border-red-500/45 bg-red-950/25 ring-1 ring-inset ring-red-500/15',
  neutral: 'border-zinc-800/90 bg-zinc-950/40 ring-1 ring-inset ring-zinc-800/50'
};

export function kpiCardClass(tone) {
  return KPI_TONE_CARD[tone] ?? KPI_TONE_CARD.neutral;
}

export function toneVolumeDelta(delta) {
  if (delta == null || typeof delta !== 'number' || !Number.isFinite(delta)) return 'neutral';
  if (delta >= 0.03) return 'good';
  if (delta <= -0.12) return 'bad';
  if (delta < 0) return 'warn';
  return 'neutral';
}

export function toneHigherIsBetter(rate, goodMin, warnMin) {
  if (rate == null || typeof rate !== 'number' || !Number.isFinite(rate)) return 'neutral';
  if (rate >= goodMin) return 'good';
  if (rate >= warnMin) return 'warn';
  return 'bad';
}

export function toneLowerIsBetter(rate, goodMax, warnMax) {
  if (rate == null || typeof rate !== 'number' || !Number.isFinite(rate)) return 'neutral';
  if (rate <= goodMax) return 'good';
  if (rate <= warnMax) return 'warn';
  return 'bad';
}

export function toneModerationHours(h) {
  if (h == null || typeof h !== 'number' || !Number.isFinite(h)) return 'neutral';
  if (h <= 12) return 'good';
  if (h <= 48) return 'warn';
  return 'bad';
}

export function deltaVisuals(delta, invert = false) {
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

export function DeltaInline({ delta, invert = false }) {
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

export function buildEngagementInsights({
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
    first?.code && mod >= 5 && rr != null && rr >= 0.08 && (rr >= 0.12 || (shareFirst != null && shareFirst >= 0.18));

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
    out.push({ id: `ins-rej-${first.code}`, severity: sev, headline, suggestion: rejectionInsightSuggestion(first.code) });
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

function csvEscape(cell) {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sanitizeFilenamePart(s) {
  return String(s ?? '').trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_').slice(0, 48) || 'export';
}

export const CSV_SECTION_KEYS = {
  meta: 'meta',
  summary: 'summary',
  rejectionRank: 'rejectionRank',
  seriesByDay: 'seriesByDay',
  topRejectionCodes: 'topRejectionCodes'
};

export const DEFAULT_CSV_SECTIONS = {
  [CSV_SECTION_KEYS.meta]: true,
  [CSV_SECTION_KEYS.summary]: true,
  [CSV_SECTION_KEYS.rejectionRank]: true,
  [CSV_SECTION_KEYS.seriesByDay]: true,
  [CSV_SECTION_KEYS.topRejectionCodes]: true
};

export const CSV_SECTION_LABELS = [
  { key: CSV_SECTION_KEYS.meta, label: 'Cabeçalho e período' },
  { key: CSV_SECTION_KEYS.summary, label: 'Resumo (KPIs)' },
  { key: CSV_SECTION_KEYS.rejectionRank, label: 'Ranking de motivos de rejeição' },
  { key: CSV_SECTION_KEYS.seriesByDay, label: 'Série diária (dia, check-ins, DAU, novos)' },
  { key: CSV_SECTION_KEYS.topRejectionCodes, label: 'Top motivos (código + contagem)' }
];

export function mergeCsvSectionsFromStorage(raw) {
  const out = { ...DEFAULT_CSV_SECTIONS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.values(CSV_SECTION_KEYS)) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

export function buildCsv(payload, sections, filterLines = []) {
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
      lines.push([csvEscape(row.day), csvEscape(row.checkins), csvEscape(row.dau), csvEscape(row.new_profiles)].join(','));
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

export function buildEngagementFilterLines({ tenantLabel, regionLabel, userTypeLabel, planLabel }) {
  return [
    `filtro_academia=${tenantLabel}`,
    `filtro_regiao=${regionLabel}`,
    `filtro_tipo_usuario=${userTypeLabel}`,
    `filtro_plano=${planLabel}`
  ];
}

export function buildEngagementExportFilename(startStr, endStr, { tenantSlug, regionPart, userTypePart, planPart }) {
  const seg = [tenantSlug, regionPart, userTypePart, planPart].map(sanitizeFilenamePart).filter(Boolean);
  const suffix = seg.length ? `_${seg.join('_')}` : '';
  return `fitrank-engajamento_${startStr}_${endStr}${suffix}.csv`;
}
