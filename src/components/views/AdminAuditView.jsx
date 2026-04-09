import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { AdminActorCombobox } from './AdminActorCombobox.jsx';

function actionLabelPt(action) {
  const a = String(action ?? '');
  const map = {
    'users.reset_flags': 'Usuário · reset de flags',
    'users.set_under_review': 'Usuário · sob revisão',
    'users.ban': 'Usuário · banimento',
    'users.unban': 'Usuário · desbanimento',
    'users.adjust_points': 'Usuário · ajuste de pontos',
    'moderation.approve': 'Moderação · aprovar foto',
    'moderation.reject': 'Moderação · rejeitar foto',
    'moderation.reapprove': 'Moderação · reaprovar',
    'moderation.batch_approve': 'Moderação · lote aprovar',
    'moderation.batch_reject': 'Moderação · lote rejeitar',
    'admin.message.send': 'Mensagem administrativa',
    'tenant.status_change': 'Tenant · status'
  };
  return map[a] ?? a;
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const toS = (x) => x.toISOString().slice(0, 10);
  return { from: toS(start), to: toS(end) };
}

export function AdminAuditView({ onBack }) {
  const { supabase, profile } = useAuth();
  const [tenants, setTenants] = useState([]);
  const dr = useMemo(() => defaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(dr.from);
  const [dateTo, setDateTo] = useState(dr.to);
  const [tenantFilter, setTenantFilter] = useState('');
  const [actorId, setActorId] = useState(null);
  const [actorLabel, setActorLabel] = useState('');
  const [rows, setRows] = useState([]);
  const [auditMetrics, setAuditMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTenants = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    const { data, error: rpcErr } = await supabase.rpc('admin_platform_tenants_list');
    if (rpcErr) return;
    setTenants(Array.isArray(data) ? data : []);
  }, [supabase, profile?.is_platform_master]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const loadAudit = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);
    try {
      const fromIso = dateFrom ? `${dateFrom}T00:00:00.000Z` : null;
      const toIso = dateTo ? `${dateTo}T23:59:59.999Z` : null;
      const tenantId = tenantFilter || null;
      const actor = actorId || null;

      const [listRes, metricsRes] = await Promise.all([
        supabase.rpc('admin_platform_audit_list', {
          p_actor_id: actor,
          p_tenant_id: tenantId,
          p_from: fromIso,
          p_to: toIso,
          p_limit: 100,
          p_offset: 0
        }),
        supabase.rpc('admin_platform_audit_metrics', {
          p_from: fromIso,
          p_to: toIso,
          p_tenant_id: tenantId,
          p_actor_id: actor
        })
      ]);

      if (listRes.error) {
        setRows([]);
        setAuditMetrics(null);
        setError(listRes.error.message ?? 'Falha ao carregar auditoria');
        return;
      }
      setRows(Array.isArray(listRes.data) ? listRes.data : []);

      if (!metricsRes.error && Array.isArray(metricsRes.data) && metricsRes.data[0]) {
        setAuditMetrics(metricsRes.data[0]);
      } else {
        setAuditMetrics(null);
      }
    } catch (e) {
      setRows([]);
      setAuditMetrics(null);
      setError(e?.message ?? 'Falha ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, [supabase, profile?.is_platform_master, dateFrom, dateTo, tenantFilter, actorId]);

  useEffect(() => {
    if (profile?.is_platform_master) {
      loadAudit();
    }
    // Carga inicial; filtros posteriores pelo botão "Aplicar filtros"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.is_platform_master]);

  /** US-ADM-15: alertas opcionais — métricas na janela inteira (não só as 100 linhas exibidas). */
  const volumeAlert = useMemo(() => {
    const m = auditMetrics;
    if (m && Number(m.top_actor_count) >= 20 && m.top_actor_id) {
      return { max: Number(m.top_actor_count), actorId: m.top_actor_id, source: 'metrics' };
    }
    const counts = new Map();
    for (const r of rows) {
      const id = r.actor_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let max = 0;
    let maxId = null;
    for (const [id, n] of counts) {
      if (n > max) {
        max = n;
        maxId = id;
      }
    }
    if (max >= 25 && maxId) {
      return { max, actorId: maxId, source: 'sample' };
    }
    return null;
  }, [rows, auditMetrics]);

  const rejectionSpikeAlert = useMemo(() => {
    const m = auditMetrics;
    if (!m) return null;
    const cur = Number(m.rejections_count ?? 0);
    const prev = Number(m.rejections_prev_window ?? 0);
    if (cur < 10) return null;
    if (cur >= 50) return { cur, prev, kind: 'absolute' };
    if (prev === 0 && cur >= 25) return { cur, prev, kind: 'cold' };
    if (prev > 0 && cur >= 15 && cur >= 2 * prev) return { cur, prev, kind: 'relative' };
    return null;
  }, [auditMetrics]);

  if (!profile?.is_platform_master) {
    return null;
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Auditoria</h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        US-ADM-15: log append-only (sem alterar ou apagar eventos), com filtros e alertas opcionais de volume e de
        rejeições. A lista abaixo mostra até 100 eventos; métricas de alerta consideram toda a janela de datas.
      </p>

      <Card className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-black text-zinc-500">De (data)</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-black text-zinc-500">Até (data)</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-[10px] uppercase font-black text-zinc-500">Tenant</label>
            <select
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </div>
          <AdminActorCombobox
            supabase={supabase}
            actorId={actorId}
            actorLabel={actorLabel}
            onChange={({ id, label }) => {
              setActorId(id);
              setActorLabel(label ?? '');
            }}
            disabled={loading}
          />
        </div>
        <Button type="button" variant="secondary" className="text-xs py-2" onClick={loadAudit} disabled={loading}>
          {loading ? 'Carregando…' : 'Aplicar filtros'}
        </Button>
      </Card>

      {rejectionSpikeAlert ? (
        <Card className="border-red-500/40 bg-red-950/25 flex gap-3 items-start">
          <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-100">Alerta: pico de rejeições (US-ADM-15)</p>
            <p className="text-xs text-red-200/90 mt-1">
              {rejectionSpikeAlert.kind === 'relative'
                ? `Rejeições na janela: ${rejectionSpikeAlert.cur}; janela anterior (mesma duração): ${rejectionSpikeAlert.prev}. Subiu de forma relevante — revise padrão operacional ou fraude.`
                : rejectionSpikeAlert.kind === 'cold'
                  ? `Rejeições na janela: ${rejectionSpikeAlert.cur}, sem histórico na janela anterior comparável.`
                  : `Rejeições na janela: ${rejectionSpikeAlert.cur} (volume alto).`}
            </p>
          </div>
        </Card>
      ) : null}

      {volumeAlert ? (
        <Card className="border-amber-500/35 bg-amber-950/20 flex gap-3 items-start">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-100">Alerta de volume por admin (opcional)</p>
            <p className="text-xs text-amber-200/90 mt-1">
              Um mesmo admin concentra {volumeAlert.max} ações na janela filtrada (id{' '}
              <span className="font-mono text-xs">{volumeAlert.actorId.slice(0, 8)}…</span>
              {volumeAlert.source === 'sample' ? '; baseado na amostra de 100 linhas' : ''}). Verifique se o padrão é
              esperado.
            </p>
          </div>
        </Card>
      ) : null}

      {error ? (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? <p className="text-zinc-500 text-sm">Carregando…</p> : null}

      {!loading && rows.length === 0 && !error ? (
        <p className="text-zinc-500 text-sm">Nenhum evento no período — ou ainda não há registros após a ativação.</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="border-zinc-800/90 py-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2 items-start">
                <div>
                  <p className="text-xs font-black text-green-400 uppercase">{actionLabelPt(r.action)}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {fmtWhen(r.created_at)} ·{' '}
                    <span className="text-zinc-400">
                      {r.actor_display_name ?? '—'}{' '}
                      <span className="font-mono text-zinc-600">{r.actor_id?.slice(0, 8)}…</span>
                    </span>
                  </p>
                </div>
                <div className="text-right text-[10px] text-zinc-500">
                  <p>
                    Alvo: <span className="text-zinc-300">{r.target_type}</span>
                    {r.target_id ? (
                      <>
                        {' '}
                        <span className="font-mono text-zinc-400">{r.target_id.slice(0, 8)}…</span>
                      </>
                    ) : null}
                  </p>
                  {r.tenant_slug ? (
                    <p className="mt-0.5">
                      Tenant: <span className="text-zinc-400">{r.tenant_slug}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              {r.payload && Object.keys(r.payload).length > 0 ? (
                <pre className="text-[10px] text-zinc-500 font-mono whitespace-pre-wrap break-all bg-black/30 rounded-lg p-2 border border-zinc-800/80 max-h-32 overflow-y-auto">
                  {JSON.stringify(r.payload)}
                </pre>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
