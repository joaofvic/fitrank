import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

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

function buildCsv(payload) {
  const lines = [];
  const period = payload?.period ?? {};
  const summary = payload?.summary ?? {};
  const byDay = Array.isArray(payload?.series?.by_day) ? payload.series.by_day : [];

  lines.push('# FitRank — Export engajamento (admin)');
  lines.push(`# inicio,${period.start ?? ''},fim,${period.end ?? ''},tenant_id,${period.tenant_id ?? 'all'}`);
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
  lines.push('');
  lines.push('day,checkins,dau,novos_cadastros');
  for (const row of byDay) {
    lines.push(
      [csvEscape(row.day), csvEscape(row.checkins), csvEscape(row.dau), csvEscape(row.new_profiles)].join(',')
    );
  }
  lines.push('');
  lines.push('rejection_code,count');
  const top = Array.isArray(payload?.top_rejection_reasons) ? payload.top_rejection_reasons : [];
  for (const r of top) {
    lines.push(`${csvEscape(r.code)},${csvEscape(r.count)}`);
  }
  return lines.join('\r\n');
}

function SimpleBarChart({ title, data, valueKey, maxBars = 45 }) {
  const slice = data.length > maxBars ? data.slice(-maxBars) : data;
  const maxVal = Math.max(1, ...slice.map((d) => Number(d[valueKey]) || 0));
  const barMaxPx = 72;

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase font-black text-zinc-500">{title}</p>
      {data.length > maxBars ? (
        <p className="text-[10px] text-zinc-600">
          Mostrando últimos {maxBars} dias do período (export CSV contém série completa).
        </p>
      ) : null}
      <div className="flex items-end gap-0.5 h-24 overflow-x-auto pb-1">
        {slice.map((d) => {
          const v = Number(d[valueKey]) || 0;
          const hPx = Math.max(v > 0 ? 3 : 1, Math.round((v / maxVal) * barMaxPx));
          return (
            <div
              key={`${d.day}-${valueKey}`}
              className="flex flex-col items-center justify-end min-w-[6px] flex-1 max-w-[14px] h-full"
              title={`${d.day}: ${v}`}
            >
              <div className="w-full rounded-t bg-green-500/70 transition-all" style={{ height: `${hPx}px` }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
        <span>{slice[0]?.day ?? '—'}</span>
        <span>{slice[slice.length - 1]?.day ?? '—'}</span>
      </div>
    </div>
  );
}

export function AdminEngagementView({ onBack }) {
  const { supabase, profile, session } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [preset, setPreset] = useState('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTenants = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    const { data: sData } = await supabase.auth.getSession();
    const token = sData?.session?.access_token ?? session?.access_token ?? null;
    const { data: res, error: fnError } = await invokeEdge('admin-tenants', token, { method: 'GET' });
    if (!fnError && !res?.error) {
      setTenants(res?.tenants ?? []);
    }
  }, [supabase, profile?.is_platform_master, session?.access_token]);

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

  const loadMetrics = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);
    try {
      const args = {
        p_start: startStr,
        p_end: endStr,
        p_tenant_id: tenantId ? tenantId : null
      };
      const { data: row, error: rpcError } = await supabase.rpc('admin_engagement_metrics', args);
      if (rpcError) {
        setData(null);
        setError(rpcError.message ?? 'Falha ao carregar métricas');
        return;
      }
      setData(row);
    } catch (e) {
      setData(null);
      setError(e?.message ?? 'Falha ao carregar métricas');
    } finally {
      setLoading(false);
    }
  }, [supabase, profile?.is_platform_master, startStr, endStr, tenantId]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitrank-engajamento-${startStr}_${endStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!profile?.is_platform_master) {
    return null;
  }

  const summary = data?.summary ?? {};
  const byDay = Array.isArray(data?.series?.by_day) ? data.series.by_day : [];
  const topReasons = Array.isArray(data?.top_rejection_reasons) ? data.top_rejection_reasons : [];

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Engajamento</h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        KPIs por período e tenant (US-ADM-14). Datas de cadastro e moderação em UTC; check-ins usam data local do
        registro.
      </p>

      <Card className="space-y-3">
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

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="text-xs py-2" onClick={loadMetrics} disabled={loading}>
            Atualizar
          </Button>
          <Button type="button" className="text-xs py-2" onClick={exportCsv} disabled={!data || loading}>
            Exportar CSV
          </Button>
        </div>
      </Card>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {loading && !data ? <p className="text-zinc-500 text-sm">Carregando…</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-green-500/15">
              <p className="text-[10px] uppercase font-black text-zinc-500">Check-ins / dia</p>
              <p className="text-xl font-black text-white mt-1">{fmtNum(summary.checkins_per_day, 2)}</p>
            </Card>
            <Card className="border-green-500/15">
              <p className="text-[10px] uppercase font-black text-zinc-500">DAU médio</p>
              <p className="text-xl font-black text-white mt-1">{fmtNum(summary.dau_avg, 2)}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase font-black text-zinc-500">Novos cadastros</p>
              <p className="text-xl font-black text-white mt-1">{summary.new_profiles ?? 0}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase font-black text-zinc-500">Taxa com foto</p>
              <p className="text-xl font-black text-white mt-1">{fmtPct(summary.photo_rate)}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase font-black text-zinc-500">Tempo médio até moderação</p>
              <p className="text-xl font-black text-white mt-1">
                {summary.avg_moderation_hours != null ? `${fmtNum(summary.avg_moderation_hours, 2)} h` : '—'}
              </p>
              <p className="text-[9px] text-zinc-600 mt-1">Fotos moderadas no período (por data da decisão)</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase font-black text-zinc-500">Taxa de rejeição</p>
              <p className="text-xl font-black text-white mt-1">{fmtPct(summary.rejection_rate)}</p>
              <p className="text-[9px] text-zinc-600 mt-1">
                {summary.rejected_moderation_count ?? 0} / {summary.moderated_photo_count ?? 0} moderações
              </p>
            </Card>
          </div>

          <Card className="space-y-6">
            <h3 className="text-sm font-black text-zinc-300 uppercase">Gráficos</h3>
            <SimpleBarChart title="Check-ins por dia" data={byDay} valueKey="checkins" />
            <SimpleBarChart title="DAU por dia" data={byDay} valueKey="dau" />
            <SimpleBarChart title="Novos cadastros por dia" data={byDay} valueKey="new_profiles" />
          </Card>

          <Card>
            <h3 className="text-sm font-black text-zinc-300 uppercase mb-3">Top motivos de rejeição</h3>
            {topReasons.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhuma rejeição no período.</p>
            ) : (
              <ul className="space-y-2">
                {topReasons.map((r) => (
                  <li
                    key={r.code}
                    className="flex justify-between gap-2 text-sm border-b border-zinc-800/80 pb-2 last:border-0"
                  >
                    <span className="text-zinc-300 truncate">{rejectionReasonLabel(r.code)}</span>
                    <span className="text-zinc-500 font-mono shrink-0">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
