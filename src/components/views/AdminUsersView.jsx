import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

function pct(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

function auditLabel(action) {
  const a = String(action || '');
  if (a === 'reset_flags') return 'Reset de flags';
  if (a === 'set_under_review') return 'Sob revisão';
  if (a === 'ban') return 'Ban';
  if (a === 'unban') return 'Unban';
  return a || '—';
}

function fmtDateTime(v) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('pt-BR');
  } catch {
    return d.toISOString();
  }
}

export function AdminUsersView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();

  const edgeReady = useMemo(
    () =>
      Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
    [supabase, profile?.is_platform_master, authLoading, session?.access_token]
  );

  const [q, setQ] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [pointsDelta, setPointsDelta] = useState('');
  const [pointsReason, setPointsReason] = useState('');
  const [pointsReference, setPointsReference] = useState('');
  const [pointsEffectiveDate, setPointsEffectiveDate] = useState(() => {
    try {
      return new Date().toISOString().slice(0, 10);
    } catch {
      return '';
    }
  });
  const [pointsCategory, setPointsCategory] = useState('manual');

  const loadUsers = useCallback(async () => {
    if (!edgeReady) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (tenantId) params.set('tenant_id', tenantId);
      params.set('limit', '20');
      params.set('offset', '0');

      const { data, error: fnError } = await invokeEdge('admin-users', supabase, {
        method: 'GET',
        searchParams: Object.fromEntries(params.entries())
      });
      if (fnError) {
        setUsers([]);
        setError(fnError.message);
        return;
      }
      if (data?.error) {
        setUsers([]);
        setError(data.error);
        return;
      }
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } finally {
      setLoading(false);
    }
  }, [edgeReady, q, tenantId, supabase]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadDetail = useCallback(
    async (userId) => {
      if (!edgeReady) return;
      setSelectedUserId(userId);
      setDetailLoading(true);
      setDetailError(null);
      setActionError(null);
      setPointsDelta('');
      setPointsReason('');
      setPointsReference('');
      setPointsEffectiveDate(() => {
        try {
          return new Date().toISOString().slice(0, 10);
        } catch {
          return '';
        }
      });
      setPointsCategory('manual');
      try {
        const params = new URLSearchParams();
        params.set('mode', 'detail');
        params.set('user_id', userId);

        const { data, error: fnError } = await invokeEdge('admin-users', supabase, {
          method: 'GET',
          searchParams: Object.fromEntries(params.entries())
        });
        if (fnError) {
          setDetail(null);
          setDetailError(fnError.message);
          return;
        }
        if (data?.error) {
          setDetail(null);
          setDetailError(data.error);
          return;
        }
        setDetail(data ?? null);
        setBanReason('');
      } finally {
        setDetailLoading(false);
      }
    },
    [edgeReady, supabase]
  );

  const runAdminAction = useCallback(
    async (payload) => {
      if (!edgeReady) return;
      if (!payload?.user_id || typeof payload.user_id !== 'string') {
        setActionError('Selecione um usuário válido antes de executar ações.');
        return;
      }
      setActionLoading(true);
      setActionError(null);
      try {
        const { data, error: fnError } = await invokeEdge(`admin-users`, supabase, { method: 'PATCH', body: payload });
        if (fnError) {
          setActionError(fnError.message);
          return;
        }
        if (data?.error) {
          setActionError(data.error);
          return;
        }
        if (selectedUserId) await loadDetail(selectedUserId);
        await loadUsers();
      } finally {
        setActionLoading(false);
      }
    },
    [edgeReady, selectedUserId, loadDetail, loadUsers]
  );

  const selected = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);

  if (!profile?.is_platform_master) return null;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Usuários</h2>
          <p className="text-xs text-zinc-500">Busca e gestão cross-tenant</p>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      {error ? (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        <div className="grid grid-cols-1 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Buscar (nome, user_id ou email)</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: João / adc1a530-... / joao@email.com"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Tenant ID (opcional)</span>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="uuid do tenant"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 font-mono"
            />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">{loading ? 'Carregando…' : `${users.length} usuários`}</p>
          <Button type="button" onClick={loadUsers} className="text-xs py-2 px-3">
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-3">
          {users.length === 0 && !loading ? (
            <div className="text-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">
              Nenhum usuário encontrado.
            </div>
          ) : (
            users.map((u) => {
              const name = u.display_name?.trim() || u.nome?.trim() || 'Atleta';
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => loadDetail(u.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    u.id === selectedUserId ? 'border-green-500/50 bg-green-500/10' : 'border-zinc-800 bg-zinc-900/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-white truncate">{name}</p>
                    <div className="flex items-center gap-1">
                      {u.photo_under_review ? (
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
                          revisão
                        </span>
                      ) : null}
                      {u.is_banned ? (
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">
                          ban
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-mono truncate">{u.id}</p>
                  {u.email ? <p className="text-[11px] text-zinc-400 truncate">{u.email}</p> : null}
                  <p className="text-xs text-zinc-500 mt-1 truncate">
                    {(u.tenant?.slug || u.tenant_id || '—')} · {u.tenant?.name || '—'}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-xs uppercase font-bold text-zinc-500">Detalhes</p>

          {detailLoading ? <p className="text-sm text-zinc-500">Carregando…</p> : null}
          {detailError ? (
            <p className="text-sm text-red-400" role="alert">
              {detailError}
            </p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-red-400" role="alert">
              {actionError}
            </p>
          ) : null}

          {!detailLoading && !detailError && detail ? (
            <>
              <div className="space-y-1">
                <p className="text-lg font-black text-white">
                  {detail?.profile?.display_name || detail?.profile?.nome || selected?.display_name || 'Atleta'}
                </p>
                <p className="text-[11px] text-zinc-500 font-mono">{detail?.profile?.id}</p>
                {detail?.profile?.email ? <p className="text-xs text-zinc-400">{detail.profile.email}</p> : null}
                {typeof detail?.profile?.pontos === 'number' ? (
                  <p className="text-xs text-zinc-500">
                    Pontos atuais: <span className="text-zinc-200 font-black">{detail.profile.pontos}</span>
                  </p>
                ) : null}
                <p className="text-xs text-zinc-500">
                  Tenant: <span className="text-zinc-300 font-mono">{detail?.tenant?.slug || detail?.profile?.tenant_id}</span>
                  {detail?.tenant?.name ? ` · ${detail.tenant.name}` : ''}
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <p className="text-[10px] uppercase text-zinc-500 font-bold">Flags administrativas</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
                      detail?.profile?.moderation_auto_flag
                        ? 'bg-orange-500/15 text-orange-200 border-orange-500/25'
                        : detail?.profile?.photo_under_review
                          ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}
                  >
                    {detail?.profile?.moderation_auto_flag
                      ? 'Auto-flag (rejeições)'
                      : detail?.profile?.photo_under_review
                        ? 'Sob revisão'
                        : 'Sem revisão'}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
                      detail?.profile?.is_banned ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}
                  >
                    {detail?.profile?.is_banned ? 'Banido' : 'Ativo'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      disabled={actionLoading}
                      onClick={() =>
                        runAdminAction({
                          action: 'set-under-review',
                          user_id: selectedUserId,
                          under_review: !detail?.profile?.photo_under_review,
                          reason: !detail?.profile?.photo_under_review ? 'Marcado manualmente no painel admin' : 'Removido manualmente no painel admin'
                        })
                      }
                      className="text-xs py-2 px-3"
                    >
                      {detail?.profile?.photo_under_review ? 'Remover revisão' : 'Marcar sob revisão'}
                    </Button>

                    <Button
                      type="button"
                      disabled={actionLoading}
                      onClick={() =>
                        runAdminAction({
                          action: 'reset-flags',
                          user_id: selectedUserId,
                          reset_photo_suspected: true,
                          reset_under_review: true
                        })
                      }
                      className="text-xs py-2 px-3"
                    >
                      Resetar flags
                    </Button>
                  </div>

                  <label className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Motivo do ban (obrigatório para banir)</span>
                    <input
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Ex: fraude recorrente, abuso, etc."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    {detail?.profile?.is_banned ? (
                      <Button
                        type="button"
                        disabled={actionLoading}
                        onClick={() =>
                          runAdminAction({
                            action: 'unban-user',
                            user_id: selectedUserId,
                            reason: banReason.trim() || 'Unban manual no painel admin'
                          })
                        }
                        className="text-xs py-2 px-3"
                      >
                        Remover ban
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={actionLoading || !banReason.trim()}
                        onClick={() =>
                          runAdminAction({
                            action: 'ban-user',
                            user_id: selectedUserId,
                            reason: banReason.trim()
                          })
                        }
                        className="text-xs py-2 px-3"
                      >
                        Banir usuário
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <p className="text-[10px] uppercase text-zinc-500 font-bold">Ajustar pontos (ledger)</p>
                <div className="grid grid-cols-1 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Data efetiva</span>
                    <input
                      type="date"
                      value={pointsEffectiveDate}
                      onChange={(e) => setPointsEffectiveDate(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Categoria</span>
                    <select
                      value={pointsCategory}
                      onChange={(e) => setPointsCategory(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                    >
                      <option value="manual">Manual</option>
                      <option value="bonus">Bônus</option>
                      <option value="correction">Correção</option>
                      <option value="incident">Incidente</option>
                      <option value="refund">Estorno</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Delta (ex: 50 ou -50)</span>
                    <input
                      value={pointsDelta}
                      onChange={(e) => setPointsDelta(e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Motivo</span>
                    <input
                      value={pointsReason}
                      onChange={(e) => setPointsReason(e.target.value)}
                      placeholder="Ex: ajuste manual por incidente X"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Referência (opcional)</span>
                    <input
                      value={pointsReference}
                      onChange={(e) => setPointsReference(e.target.value)}
                      placeholder="Ex: checkin_id, link, ticket, etc."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      disabled={
                        actionLoading ||
                        !selectedUserId ||
                        !pointsReason.trim() ||
                        !Number.isFinite(Number(pointsDelta)) ||
                        Number(pointsDelta) === 0 ||
                        !/^\d{4}-\d{2}-\d{2}$/.test(pointsEffectiveDate)
                      }
                      onClick={() =>
                        runAdminAction({
                          action: 'adjust-points',
                          user_id: selectedUserId,
                          delta: Number(pointsDelta),
                          reason: pointsReason.trim(),
                          reference: pointsReference.trim() || undefined,
                          effective_date: pointsEffectiveDate,
                          category: pointsCategory
                        })
                      }
                      className="text-xs py-2 px-3"
                    >
                      Aplicar ajuste
                    </Button>
                    <p className="text-[11px] text-zinc-500">
                      Isso grava no ledger e recalcula o total em <span className="font-mono">profiles.pontos</span>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase text-zinc-500 font-bold">Extrato (ledger)</p>
                {Array.isArray(detail?.points_ledger) && detail.points_ledger.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-auto pr-1">
                    {detail.points_ledger.map((l) => (
                      <div key={l.id} className="rounded-xl border border-zinc-800 bg-black/20 p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-white font-bold">
                            {l.delta > 0 ? `+${l.delta}` : `${l.delta}`} · {l.category || 'manual'}
                          </p>
                          <span className="text-[10px] text-zinc-500">{fmtDateTime(l.created_at)}</span>
                        </div>
                        {l.effective_date ? <p className="text-[11px] text-zinc-400">Data efetiva: {l.effective_date}</p> : null}
                        {l.reason ? <p className="text-[11px] text-zinc-400">Motivo: {l.reason}</p> : null}
                        {l.reference ? <p className="text-[11px] text-zinc-500 truncate">Ref: {l.reference}</p> : null}
                        {typeof l.points_before === 'number' && typeof l.points_after === 'number' ? (
                          <p className="text-[11px] text-zinc-500">
                            {l.points_before} → <span className="text-zinc-300 font-bold">{l.points_after}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600">Sem lançamentos no ledger.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <p className="text-[10px] uppercase text-zinc-500 font-bold">Aprovação (30d)</p>
                  <p className="text-sm text-white font-black">{pct(detail?.stats?.approval_rate_30d)}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <p className="text-[10px] uppercase text-zinc-500 font-bold">Rejeição (30d)</p>
                  <p className="text-sm text-white font-black">{pct(detail?.stats?.rejection_rate_30d)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase text-zinc-500 font-bold">Histórico de auditoria</p>
                {Array.isArray(detail?.audit) && detail.audit.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-auto pr-1">
                    {detail.audit.map((a) => (
                      <div key={a.id} className="rounded-xl border border-zinc-800 bg-black/20 p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-white font-bold">{auditLabel(a.action)}</p>
                          <span className="text-[10px] text-zinc-500">{fmtDateTime(a.acted_at)}</span>
                        </div>
                        {a.actor_email ? (
                          <p className="text-[11px] text-zinc-400 truncate">
                            Por: <span className="font-mono text-zinc-300">{a.actor_email}</span>
                          </p>
                        ) : a.acted_by ? (
                          <p className="text-[11px] text-zinc-400 truncate">
                            Por: <span className="font-mono text-zinc-300">{a.acted_by}</span>
                          </p>
                        ) : null}
                        {a.reason ? <p className="text-[11px] text-zinc-400">Motivo: {a.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600">Sem eventos.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase text-zinc-500 font-bold">Motivos mais comuns (30d)</p>
                {Array.isArray(detail?.top_rejection_reasons) && detail.top_rejection_reasons.length > 0 ? (
                  <div className="space-y-2">
                    {detail.top_rejection_reasons.map((r) => (
                      <div key={r.reason_code} className="text-xs text-zinc-400 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-200 font-bold truncate">{r.reason_label || 'Motivo'}</p>
                          <p className="text-[11px] text-zinc-500 font-mono truncate">{r.reason_code ? `Código: ${r.reason_code}` : ''}</p>
                        </div>
                        <span className="text-zinc-200 font-bold">{r.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600">Sem dados.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase text-zinc-500 font-bold">Últimos check-ins</p>
                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                  {(detail?.recent_checkins ?? []).map((c) => (
                    <div key={c.id} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-white font-bold truncate">{c.tipo_treino || 'Treino'}</p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {c.checkin_local_date} · +{c.points_awarded} pts
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
                          {c.photo_review_status}
                        </span>
                      </div>
                      {c.photo_review_status === 'rejected' && (c.photo_rejection_reason_code || c.photo_rejection_note) ? (
                        <p className="text-[11px] text-zinc-400 mt-2">
                          {c.photo_rejection_reason_label
                            ? `Motivo: ${c.photo_rejection_reason_label}`
                            : c.photo_rejection_reason_code
                              ? `Motivo: ${c.photo_rejection_reason_code}`
                              : ''}
                          {c.photo_rejection_note ? ` · ${c.photo_rejection_note}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {Array.isArray(detail?.recent_checkins) && detail.recent_checkins.length === 0 ? (
                    <p className="text-xs text-zinc-600">Sem histórico recente.</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-600">Selecione um usuário para ver detalhes.</p>
          )}
        </div>
      </div>
    </div>
  );
}

