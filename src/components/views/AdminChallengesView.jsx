import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronLeft, Users, Calendar, Search, X, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { WorkoutTypeMultiSelect } from '../ui/WorkoutTypeMultiSelect.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

const STATUS_LABELS = {
  rascunho: 'Rascunho',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado'
};

const STATUS_COLORS = {
  rascunho: 'bg-zinc-700/30 text-zinc-300 border-zinc-600',
  ativo: 'bg-green-500/20 text-green-400 border-green-500/30',
  encerrado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelado: 'bg-red-500/20 text-red-400 border-red-500/30'
};

function StatusBadge({ status }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${STATUS_COLORS[status] ?? STATUS_COLORS.rascunho}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function daysRemaining(dataFim) {
  if (!dataFim) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dataFim + 'T23:59:59');
  const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  return diff;
}

function durationDays(inicio, fim) {
  if (!inicio || !fim) return null;
  const a = new Date(inicio);
  const b = new Date(fim);
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24)) + 1;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function AdminChallengesView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();
  const edgeReady = useMemo(
    () => Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
    [supabase, profile?.is_platform_master, authLoading, session?.access_token]
  );

  const [desafios, setDesafios] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // filters
  const [filterTenant, setFilterTenant] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // sub-views: 'list' | 'form' | 'detail'
  const [subView, setSubView] = useState('list');
  const [editingDesafio, setEditingDesafio] = useState(null);
  const [detailDesafio, setDetailDesafio] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // form state
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    tenant_id: '',
    tipo_treino: [],
    data_inicio: '',
    data_fim: '',
    max_participantes: '',
    status: 'rascunho'
  });

  // -------------------------------------------------------------------------
  // Load helpers
  // -------------------------------------------------------------------------
  const loadTenants = useCallback(async () => {
    if (!edgeReady) return;
    const { data } = await invokeEdge('admin-tenants', supabase, { method: 'GET' });
    if (data?.tenants) setTenants(data.tenants);
  }, [edgeReady, supabase]);

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc('admin_tipo_treino_catalog');
    if (Array.isArray(data)) setCatalog(data);
  }, [supabase]);

  const loadDesafios = useCallback(async () => {
    if (!edgeReady) return;
    setLoading(true);
    setError(null);
    const searchParams = {};
    if (filterTenant) searchParams.tenant_id = filterTenant;
    if (filterStatus) searchParams.status = filterStatus;
    if (filterSearch.trim()) searchParams.search = filterSearch.trim();

    const { data, error: fnError } = await invokeEdge('admin-challenges', supabase, {
      method: 'GET',
      searchParams: { mode: 'list', ...searchParams, limit: 100 }
    });
    if (fnError) {
      setError(fnError.message);
      setDesafios([]);
    } else if (data?.error) {
      setError(data.error);
      setDesafios([]);
    } else {
      setDesafios(data?.desafios ?? []);
    }
    setLoading(false);
  }, [edgeReady, supabase, filterTenant, filterStatus, filterSearch]);

  useEffect(() => {
    loadTenants();
    loadCatalog();
  }, [loadTenants, loadCatalog]);

  useEffect(() => {
    if (subView === 'list') loadDesafios();
  }, [loadDesafios, subView]);

  // -------------------------------------------------------------------------
  // CRUD actions
  // -------------------------------------------------------------------------
  const handleCreate = async () => {
    if (!edgeReady) return;
    setBusy(true);
    setError(null);
    const body = {
      tenant_id: formData.tenant_id,
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim(),
      tipo_treino: formData.tipo_treino,
      data_inicio: formData.data_inicio,
      data_fim: formData.data_fim,
      max_participantes: formData.max_participantes ? Number(formData.max_participantes) : null,
      status: formData.status
    };
    const { data, error: fnError } = await invokeEdge('admin-challenges', supabase, {
      method: 'POST',
      body
    });
    setBusy(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setSubView('list');
  };

  const handleUpdate = async () => {
    if (!edgeReady || !editingDesafio) return;
    setBusy(true);
    setError(null);
    const body = {
      action: 'update',
      id: editingDesafio.id,
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim(),
      tipo_treino: formData.tipo_treino,
      data_inicio: formData.data_inicio,
      data_fim: formData.data_fim,
      max_participantes: formData.max_participantes ? Number(formData.max_participantes) : null
    };
    const { data, error: fnError } = await invokeEdge('admin-challenges', supabase, {
      method: 'PATCH',
      body
    });
    setBusy(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setSubView('list');
    setEditingDesafio(null);
  };

  const handleLifecycle = async (id, action, motivo) => {
    if (!edgeReady) return;
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await invokeEdge('admin-challenges', supabase, {
      method: 'PATCH',
      body: { action, id, motivo }
    });
    setBusy(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    if (subView === 'detail' && detailDesafio) {
      await loadDetail(id);
    } else {
      await loadDesafios();
    }
  };

  const loadDetail = async (id) => {
    if (!edgeReady) return;
    setError(null);
    const { data, error: fnError } = await invokeEdge('admin-challenges', supabase, {
      method: 'GET',
      searchParams: { mode: 'detail', id }
    });
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setDetailDesafio(data?.desafio ?? null);

    setParticipantsLoading(true);
    const { data: pData } = await invokeEdge('admin-challenges', supabase, {
      method: 'GET',
      searchParams: { mode: 'participants', id, limit: 200 }
    });
    setParticipants(pData?.participants ?? []);
    setParticipantsLoading(false);
  };

  const handleRemoveParticipant = async (desafioId, userId, nome) => {
    const motivo = prompt(`Motivo para remover "${nome}" do desafio:`);
    if (!motivo?.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await invokeEdge('admin-challenges', supabase, {
      method: 'PATCH',
      body: { action: 'remove_participant', desafio_id: desafioId, user_id: userId, motivo: motivo.trim() }
    });
    setBusy(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    await loadDetail(desafioId);
  };

  // -------------------------------------------------------------------------
  // Navigation helpers
  // -------------------------------------------------------------------------
  const openCreate = () => {
    setEditingDesafio(null);
    setFormData({
      nome: '',
      descricao: '',
      tenant_id: tenants[0]?.id ?? '',
      tipo_treino: [],
      data_inicio: todayISO(),
      data_fim: '',
      max_participantes: '',
      status: 'rascunho'
    });
    setError(null);
    setSubView('form');
  };

  const openEdit = (d) => {
    setEditingDesafio(d);
    setFormData({
      nome: d.nome ?? '',
      descricao: d.descricao ?? '',
      tenant_id: d.tenant_id ?? '',
      tipo_treino: d.tipo_treino ?? [],
      data_inicio: d.data_inicio ?? '',
      data_fim: d.data_fim ?? '',
      max_participantes: d.max_participantes ?? '',
      status: d.status ?? 'rascunho'
    });
    setError(null);
    setSubView('form');
  };

  const openDetail = async (d) => {
    setSubView('detail');
    await loadDetail(d.id);
  };

  if (!profile?.is_platform_master) return null;

  const isEditing = Boolean(editingDesafio);
  const canEditDates = !isEditing || (editingDesafio.status === 'rascunho' || (editingDesafio.status === 'ativo' && (editingDesafio.participantes_count ?? 0) === 0));
  const canEditFields = !isEditing || (editingDesafio.status !== 'cancelado' && editingDesafio.status !== 'encerrado');

  // -------------------------------------------------------------------------
  // Render: form
  // -------------------------------------------------------------------------
  if (subView === 'form') {
    const dur = durationDays(formData.data_inicio, formData.data_fim);
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-black uppercase tracking-tight text-white">
            {isEditing ? 'Editar desafio' : 'Novo desafio'}
          </h2>
          <button type="button" onClick={() => { setSubView('list'); setError(null); }} className="text-sm text-zinc-500 hover:text-green-400">
            Cancelar
          </button>
        </div>

        {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

        <div className="space-y-4">
          <div>
            <label htmlFor="ch-nome" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Nome</label>
            <input
              id="ch-nome"
              type="text"
              maxLength={200}
              value={formData.nome}
              disabled={!canEditFields}
              onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-green-500/50 focus:outline-none disabled:opacity-40"
              placeholder="Ex: 30 Dias de Foco"
            />
          </div>

          <div>
            <label htmlFor="ch-desc" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Descrição</label>
            <textarea
              id="ch-desc"
              maxLength={2000}
              rows={3}
              value={formData.descricao}
              disabled={!canEditFields}
              onChange={(e) => setFormData((p) => ({ ...p, descricao: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-green-500/50 focus:outline-none resize-none disabled:opacity-40"
              placeholder="Descrição opcional do desafio"
            />
          </div>

          <div>
            <label htmlFor="ch-tenant" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Tenant</label>
            <select
              id="ch-tenant"
              value={formData.tenant_id}
              disabled={isEditing}
              onChange={(e) => setFormData((p) => ({ ...p, tenant_id: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white focus:border-green-500/50 focus:outline-none disabled:opacity-40"
            >
              <option value="">Selecione…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name ?? t.slug}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-bold uppercase block mb-1">Tipo(s) de treino</label>
            <WorkoutTypeMultiSelect
              catalogOptions={catalog}
              value={formData.tipo_treino}
              onChange={(v) => setFormData((p) => ({ ...p, tipo_treino: v }))}
              disabled={!canEditFields}
              addButtonLabel="Adicionar tipo…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ch-inicio" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Início</label>
              <input
                id="ch-inicio"
                type="date"
                value={formData.data_inicio}
                disabled={!canEditDates}
                onChange={(e) => setFormData((p) => ({ ...p, data_inicio: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white focus:border-green-500/50 focus:outline-none disabled:opacity-40"
              />
            </div>
            <div>
              <label htmlFor="ch-fim" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Fim</label>
              <input
                id="ch-fim"
                type="date"
                value={formData.data_fim}
                disabled={!canEditDates}
                onChange={(e) => setFormData((p) => ({ ...p, data_fim: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white focus:border-green-500/50 focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>
          {dur && (
            <p className="text-xs text-zinc-500">Duração: <span className="text-green-400 font-bold">{dur} dia{dur !== 1 ? 's' : ''}</span></p>
          )}

          <div>
            <label htmlFor="ch-max" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Max participantes (opcional)</label>
            <input
              id="ch-max"
              type="number"
              min={1}
              value={formData.max_participantes}
              disabled={!canEditFields}
              onChange={(e) => setFormData((p) => ({ ...p, max_participantes: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-green-500/50 focus:outline-none disabled:opacity-40"
              placeholder="Sem limite"
            />
          </div>

          {!isEditing && (
            <div>
              <label htmlFor="ch-status" className="text-xs text-zinc-400 font-bold uppercase block mb-1">Status inicial</label>
              <select
                id="ch-status"
                value={formData.status}
                onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white focus:border-green-500/50 focus:outline-none"
              >
                <option value="rascunho">Rascunho</option>
                <option value="ativo">Ativo (publicar agora)</option>
              </select>
            </div>
          )}

          <Button
            onClick={isEditing ? handleUpdate : handleCreate}
            disabled={busy || !formData.nome.trim() || !formData.tenant_id || !formData.data_inicio || !formData.data_fim}
            className="w-full py-3"
          >
            {busy ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar desafio'}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: detail
  // -------------------------------------------------------------------------
  if (subView === 'detail' && detailDesafio) {
    const d = detailDesafio;
    const rem = d.status === 'ativo' ? daysRemaining(d.data_fim) : null;
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => { setSubView('list'); setDetailDesafio(null); setError(null); }} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-green-400">
            <ChevronLeft size={16} /> Voltar
          </button>
          <StatusBadge status={d.status} />
        </div>

        {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

        <Card className="space-y-3">
          <h3 className="text-xl font-black text-white">{d.nome}</h3>
          {d.descricao && <p className="text-sm text-zinc-400">{d.descricao}</p>}
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
            <span>Tenant: <span className="text-zinc-300 font-mono">{d.tenant_slug}</span></span>
            {d.criado_por_nome && <span>Criado por: <span className="text-zinc-300">{d.criado_por_nome}</span></span>}
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(d.data_inicio)} — {formatDate(d.data_fim)}</span>
            {rem !== null && rem >= 0 && (
              <span className="text-green-400 font-bold">{rem} dia{rem !== 1 ? 's' : ''} restante{rem !== 1 ? 's' : ''}</span>
            )}
          </div>
          {d.tipo_treino?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {d.tipo_treino.map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">{t}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><Users size={12} /> {d.participantes_count ?? 0} participante{(d.participantes_count ?? 0) !== 1 ? 's' : ''}</span>
            {d.max_participantes && <span>Max: {d.max_participantes}</span>}
          </div>
        </Card>

        {/* lifecycle actions */}
        <div className="flex flex-wrap gap-2">
          {d.status === 'rascunho' && (
            <>
              <Button className="text-xs py-2 px-3" disabled={busy} onClick={() => handleLifecycle(d.id, 'activate')}>
                Ativar
              </Button>
              <Button variant="secondary" className="text-xs py-2 px-3" disabled={busy} onClick={() => openEdit(d)}>
                Editar
              </Button>
              <Button variant="ghost" className="text-xs py-2 px-3 text-red-400" disabled={busy} onClick={() => { if (confirm('Cancelar este desafio?')) handleLifecycle(d.id, 'cancel'); }}>
                Cancelar
              </Button>
            </>
          )}
          {d.status === 'ativo' && (
            <>
              <Button variant="secondary" className="text-xs py-2 px-3" disabled={busy} onClick={() => openEdit(d)}>
                Editar
              </Button>
              <Button variant="outline" className="text-xs py-2 px-3" disabled={busy} onClick={() => { if (confirm('Encerrar este desafio?')) handleLifecycle(d.id, 'close'); }}>
                Encerrar
              </Button>
              <Button variant="ghost" className="text-xs py-2 px-3 text-red-400" disabled={busy} onClick={() => { if (confirm('Cancelar este desafio?')) handleLifecycle(d.id, 'cancel'); }}>
                Cancelar
              </Button>
            </>
          )}
          {d.status === 'encerrado' && (
            <Button variant="ghost" className="text-xs py-2 px-3 text-red-400" disabled={busy} onClick={() => { if (confirm('Cancelar este desafio?')) handleLifecycle(d.id, 'cancel'); }}>
              Cancelar
            </Button>
          )}
        </div>

        {/* participants */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wide">Participantes e ranking</h4>
          {participantsLoading ? (
            <p className="text-zinc-500 text-sm">Carregando…</p>
          ) : participants.length === 0 ? (
            <p className="text-zinc-600 text-sm">Nenhum participante inscrito.</p>
          ) : (
            <ul className="space-y-2">
              {participants.map((p, idx) => (
                <li key={p.participante_id} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-zinc-600 font-black w-6 shrink-0 text-sm">#{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{p.nome_exibicao}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{p.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-green-400 font-black text-sm">{p.pontos_desafio} pts</span>
                    {d.status !== 'cancelado' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveParticipant(d.id, p.user_id, p.nome_exibicao)}
                        className="p-1 rounded text-zinc-600 hover:text-red-400 disabled:opacity-40"
                        aria-label={`Remover ${p.nome_exibicao}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: list (default)
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Desafios</h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterTenant}
          onChange={(e) => setFilterTenant(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-green-500/50 focus:outline-none"
          aria-label="Filtrar por tenant"
        >
          <option value="">Todos tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name ?? t.slug}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-green-500/50 focus:outline-none"
          aria-label="Filtrar por status"
        >
          <option value="">Todos status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[140px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-8 pr-8 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-green-500/50 focus:outline-none"
          />
          {filterSearch && (
            <button type="button" onClick={() => setFilterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <Button onClick={openCreate} className="w-full py-3 text-sm">
        <Plus size={18} /> Novo desafio
      </Button>

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando…</p>
      ) : desafios.length === 0 ? (
        <Card className="text-zinc-500 text-sm text-center py-8">Nenhum desafio encontrado.</Card>
      ) : (
        <ul className="space-y-3">
          {desafios.map((d) => (
            <li
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(d)}
              onKeyDown={(e) => { if (e.key === 'Enter') openDetail(d); }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2 cursor-pointer hover:border-green-500/30 transition-colors"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{d.nome}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{d.tenant_slug}</p>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(d.data_inicio)} — {formatDate(d.data_fim)}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {d.participantes_count ?? 0}</span>
              </div>
              {d.tipo_treino?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {d.tipo_treino.slice(0, 4).map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{t}</span>
                  ))}
                  {d.tipo_treino.length > 4 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">+{d.tipo_treino.length - 4}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
