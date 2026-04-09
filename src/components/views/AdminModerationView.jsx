import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

const STATUSES = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' }
];

export function AdminModerationView({ onBack }) {
  const { supabase, profile, session } = useAuth();

  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [quickOpen, setQuickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null);
  const [batchRejectConfirmOpen, setBatchRejectConfirmOpen] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('fitrank.admin.shortcuts');
      return v === null ? true : v !== '0';
    } catch {
      return true;
    }
  });

  const [status, setStatus] = useState('pending');
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tipo, setTipo] = useState('');
  const [sort, setSort] = useState('oldest'); // oldest | newest | risk
  const [stats, setStats] = useState(null);
  const [userContext, setUserContext] = useState(null);
  const [userContextLoading, setUserContextLoading] = useState(false);
  const [userContextError, setUserContextError] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tenantOptions = useMemo(() => {
    return [{ id: '', label: 'Todos os tenants' }].concat(
      (tenants ?? []).map((t) => ({ id: t.id, label: `${t.slug}${t.name ? ` · ${t.name}` : ''}` }))
    );
  }, [tenants]);

  const loadTenants = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    const { data: sData } = await supabase.auth.getSession();
    const token = sData?.session?.access_token ?? session?.access_token ?? null;
    const { data, error: fnError } = await invokeEdge('admin-tenants', token, {
      method: 'GET'
    });
    if (fnError) {
      console.error('FitRank: admin tenants', fnError.message);
      setTenants([]);
      return;
    }
    if (data?.error) {
      console.error('FitRank: admin tenants', data.error);
      setTenants([]);
      return;
    }
    setTenants(data?.tenants ?? []);
  }, [supabase, profile?.is_platform_master, session?.access_token]);

  const loadQueue = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);
    setBatchRejectConfirmOpen(false);

    const params = new URLSearchParams();
    params.set('status', status);
    if (tenantId) params.set('tenant_id', tenantId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (tipo) params.set('tipo', tipo);
    params.set('sort', sort);
    params.set('include_stats', status === 'pending' ? '1' : '0');
    params.set('limit', '30');
    params.set('offset', '0');

    const { data: sData } = await supabase.auth.getSession();
    const token = sData?.session?.access_token ?? session?.access_token ?? null;
    const { data, error: fnError } = await invokeEdge(
      `admin-moderation?${params.toString()}`,
      token,
      { method: 'GET' }
    );

    if (fnError) {
      setError(fnError.message);
      setItems([]);
      setLoading(false);
      return;
    }
    if (data?.error) {
      setError(data.error);
      setItems([]);
      setStats(null);
      setLoading(false);
      return;
    }

    setItems(Array.isArray(data?.items) ? data.items : []);
    setStats(data?.stats ?? null);
    setSelectedIds(new Set());
    setLastSelectedIdx(null);
    setFocusIdx((prev) => {
      const next = Array.isArray(data?.items) && data.items.length > 0 ? Math.min(prev, data.items.length - 1) : -1;
      return Number.isFinite(next) ? next : -1;
    });
    setLoading(false);
  }, [supabase, profile?.is_platform_master, status, tenantId, from, to, tipo, sort, session?.access_token]);

  const formatPendingAge = useCallback((createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const ms = now.getTime() - created.getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 1) return 'agora';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
  }, []);

  const pendingAgeTone = useCallback((createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const ms = now.getTime() - created.getTime();
    const hours = ms / (1000 * 60 * 60);
    if (!Number.isFinite(hours) || hours < 0) return 'zinc';
    if (hours >= 24) return 'red';
    if (hours >= 12) return 'yellow';
    return 'zinc';
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const focused = focusIdx >= 0 && focusIdx < items.length ? items[focusIdx] : null;

  useEffect(() => {
    if (!quickOpen || !focused?.user_id) {
      setUserContext(null);
      setUserContextLoading(false);
      setUserContextError(null);
      return;
    }
    if (!supabase || !profile?.is_platform_master) return;

    let cancelled = false;
    (async () => {
      try {
        setUserContextLoading(true);
        setUserContextError(null);

        const params = new URLSearchParams();
        params.set('mode', 'user-context');
        params.set('user_id', focused.user_id);
        if (focused?.tenant_id) params.set('tenant_id', focused.tenant_id);

        const { data: sData } = await supabase.auth.getSession();
        const token = sData?.session?.access_token ?? session?.access_token ?? null;
        const { data, error: fnError } = await invokeEdge(`admin-moderation?${params.toString()}`, token, {
          method: 'GET'
        });

        if (cancelled) return;
        if (fnError) {
          setUserContext(null);
          setUserContextError(fnError.message);
          setUserContextLoading(false);
          return;
        }
        if (data?.error) {
          setUserContext(null);
          setUserContextError(data.error);
          setUserContextLoading(false);
          return;
        }

        setUserContext(data?.context ?? null);
        setUserContextLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Erro ao carregar contexto';
        setUserContext(null);
        setUserContextError(msg);
        setUserContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quickOpen, focused?.user_id, focused?.tenant_id, supabase, profile?.is_platform_master, session?.access_token]);

  const pct = useCallback((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${Math.round(value * 100)}%`;
  }, []);

  const copyText = useCallback(async (text) => {
    try {
      if (!text) return;
      await navigator.clipboard.writeText(String(text));
    } catch {
      // ignore
    }
  }, []);

  if (!profile?.is_platform_master) {
    return null;
  }
  const focusedName =
    focused?.profiles?.display_name?.trim() || focused?.profiles?.nome?.trim() || 'Atleta';
  const focusedTenant = focused?.tenants?.slug || focused?.tenant_id || '—';

  const openQuick = (idx) => {
    setFocusIdx(idx);
    setQuickOpen(true);
    setZoom(false);
    setRejectConfirmOpen(false);
  };

  const nextItem = () => {
    const next = focusIdx + 1;
    if (next < items.length) {
      setFocusIdx(next);
      setZoom(false);
      setRejectConfirmOpen(false);
      return;
    }
    // fim da lista atual
    setQuickOpen(false);
    setRejectConfirmOpen(false);
  };

  const prevItem = () => {
    const prev = focusIdx - 1;
    if (prev >= 0) {
      setFocusIdx(prev);
      setZoom(false);
      setRejectConfirmOpen(false);
    }
  };

  const review = async (action) => {
    if (!focused?.id) return;
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { data: sData } = await supabase.auth.getSession();
      const token = sData?.session?.access_token ?? session?.access_token ?? null;
      const { error: fnError } = await invokeEdge('admin-moderation', token, {
        method: 'PATCH',
        body: { checkin_id: focused.id, action }
      });
      if (fnError) {
        setError(fnError.message);
        return;
      }
      // remove item da lista local para agilizar
      setItems((prev) => prev.filter((x) => x.id !== focused.id));
      setFocusIdx((prev) => Math.max(0, Math.min(prev, items.length - 2)));
      nextItem();
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = selectedIds.size;

  const toggleSelect = (id, idx, isRange) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const isSelected = next.has(id);

      if (isRange && lastSelectedIdx !== null) {
        const a = Math.min(lastSelectedIdx, idx);
        const b = Math.max(lastSelectedIdx, idx);
        for (let i = a; i <= b; i++) {
          const cid = items[i]?.id;
          if (cid) next.add(cid);
        }
        return next;
      }

      if (isSelected) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastSelectedIdx(idx);
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map((x) => x.id).filter(Boolean)));
    setLastSelectedIdx(items.length > 0 ? 0 : null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedIdx(null);
  };

  const batchReview = async (action) => {
    if (!supabase) return;
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { data: sData } = await supabase.auth.getSession();
      const token = sData?.session?.access_token ?? session?.access_token ?? null;
      const ids = Array.from(selectedIds);
      const { data, error: fnError } = await invokeEdge('admin-moderation', token, {
        method: 'PATCH',
        body: { checkin_ids: ids, action }
      });
      if (fnError) {
        setError(fnError.message);
        return;
      }
      const updatedIds = Array.isArray(data?.updated_ids) ? data.updated_ids : ids;
      setItems((prev) => prev.filter((x) => !updatedIds.includes(x.id)));
      clearSelection();
      setBatchRejectConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleShortcuts = () => {
    setShortcutsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('fitrank.admin.shortcuts', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    if (!quickOpen || !focused) return;
    if (!shortcutsEnabled) return;

    const onKeyDown = (e) => {
      if (busy) return;
      if (e.defaultPrevented) return;

      const target = e.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;

      const k = e.key;

      if (k === 'Escape') {
        e.preventDefault();
        if (rejectConfirmOpen) {
          setRejectConfirmOpen(false);
          return;
        }
        setQuickOpen(false);
        return;
      }

      if (k === 'ArrowRight') {
        e.preventDefault();
        nextItem();
        return;
      }
      if (k === 'ArrowLeft') {
        e.preventDefault();
        prevItem();
        return;
      }

      const key = k.length === 1 ? k.toLowerCase() : k;
      if (key === 'z') {
        e.preventDefault();
        setZoom((v) => !v);
        return;
      }
      if (key === 's' || key === 'p') {
        e.preventDefault();
        nextItem();
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        review('approve');
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        setRejectConfirmOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickOpen, focused?.id, shortcutsEnabled, busy, rejectConfirmOpen]);

  useEffect(() => {
    if (quickOpen) return;
    if (viewMode !== 'grid') return;
    if (!shortcutsEnabled) return;

    const onKeyDown = (e) => {
      if (busy) return;
      if (e.defaultPrevented) return;

      const target = e.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;

      // Ctrl/Cmd+A: selecionar tudo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (batchRejectConfirmOpen) {
          setBatchRejectConfirmOpen(false);
          return;
        }
        clearSelection();
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === 'g') {
        e.preventDefault();
        setViewMode('list');
        clearSelection();
        return;
      }

      if (key === 'a') {
        if (selectedCount === 0) return;
        e.preventDefault();
        batchReview('approve');
        return;
      }

      if (key === 'r') {
        if (selectedCount === 0) return;
        e.preventDefault();
        setBatchRejectConfirmOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickOpen, viewMode, shortcutsEnabled, busy, selectedCount, batchRejectConfirmOpen]);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Moderação</h2>
          <p className="text-xs text-zinc-500">Fila global de fotos (cross-tenant)</p>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        {status === 'pending' && stats ? (
          <div className="flex items-center justify-between gap-3 bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2">
            <div className="text-[10px] uppercase text-zinc-500 font-bold">
              Pendentes: <span className="text-zinc-200">{stats.pending_total ?? 0}</span>
            </div>
            <div className="text-[10px] uppercase text-zinc-500 font-bold">
              &gt;24h:{' '}
              <span className={(stats.pending_over_24h ?? 0) > 0 ? 'text-red-300' : 'text-zinc-200'}>
                {stats.pending_over_24h ?? 0}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <Button
              key={s.id}
              type="button"
              onClick={() => setStatus(s.id)}
              className={`text-xs py-2 px-3 ${
                status === s.id ? '' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            Modo rápido: <span className="text-zinc-300 font-bold">{quickOpen ? 'aberto' : 'fechado'}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setViewMode((m) => (m === 'grid' ? 'list' : 'grid'));
                clearSelection();
              }}
              className="text-[10px] font-bold uppercase px-2 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              aria-pressed={viewMode === 'grid'}
              title="Alternar visualização"
            >
              {viewMode === 'grid' ? 'Lista' : 'Grid'}
            </button>
            <button
              type="button"
              onClick={toggleShortcuts}
              className="text-[10px] font-bold uppercase px-2 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              aria-pressed={shortcutsEnabled}
              title="Atalhos de teclado"
            >
              Atalhos: {shortcutsEnabled ? 'ON' : 'OFF'}
            </button>
            <Button
              type="button"
              disabled={items.length === 0}
              onClick={() => openQuick(Math.max(0, focusIdx))}
              className="text-xs py-2 px-3 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              Abrir modo rápido
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Tenant</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            >
              {tenantOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Tipo de treino</span>
            <input
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="Ex: Superior"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Ordenação</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="oldest">Mais antigos</option>
              <option value="newest">Mais recentes</option>
              <option value="risk">Maior risco</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">De</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Até</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            {loading ? 'Carregando…' : `${items.length} itens`}
            {viewMode === 'grid' ? ` · ${selectedCount} selecionados` : ''}
          </p>
          <Button type="button" onClick={loadQueue} className="text-xs py-2 px-3">
            Atualizar
          </Button>
        </div>
      </div>

      {viewMode === 'grid' && items.length > 0 ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              Seleção: <span className="text-zinc-200 font-bold">{selectedCount}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || items.length === 0}
                onClick={selectAll}
                className="text-xs py-2 px-3"
              >
                Selecionar todos
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || selectedCount === 0}
                onClick={clearSelection}
                className="text-xs py-2 px-3"
              >
                Limpar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500 uppercase">
            <span className="border border-zinc-800 rounded-full px-2 py-1">Ctrl/Cmd+A selecionar tudo</span>
            <span className="border border-zinc-800 rounded-full px-2 py-1">A aprovar lote</span>
            <span className="border border-zinc-800 rounded-full px-2 py-1">R rejeitar lote</span>
            <span className="border border-zinc-800 rounded-full px-2 py-1">Esc limpar</span>
            <span className="border border-zinc-800 rounded-full px-2 py-1">G voltar lista</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={() => batchReview('approve')}
              className="text-xs py-3"
            >
              Aprovar selecionados
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || selectedCount === 0}
              onClick={() => setBatchRejectConfirmOpen(true)}
              className="text-xs py-3 border-red-500/40 text-red-300 hover:bg-red-500/10"
            >
              Rejeitar selecionados
            </Button>
          </div>

          {batchRejectConfirmOpen ? (
            <div className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950/40 space-y-3">
              <p className="text-sm text-white font-bold">Rejeitar {selectedCount} itens?</p>
              <p className="text-xs text-zinc-500">
                (Motivos padronizados entram no US-ADM-07. Por enquanto, isso apenas marca como rejeitado.)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setBatchRejectConfirmOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => batchReview('reject')}
                  className="bg-red-500/90 hover:bg-red-500 text-black font-bold"
                >
                  Rejeitar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando fila…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">
          Nenhum item encontrado.
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((it, idx) => {
            const isSelected = selectedIds.has(it.id);
            const nome =
              it?.profiles?.display_name?.trim() ||
              it?.profiles?.nome?.trim() ||
              'Atleta';
            const tenantLabel = it?.tenants?.slug || it.tenant_id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={(e) => toggleSelect(it.id, idx, e.shiftKey)}
                className={`text-left rounded-2xl border overflow-hidden transition-colors ${
                  isSelected
                    ? 'border-green-500/60 bg-green-500/10'
                    : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
                }`}
                title="Clique para selecionar (Shift para intervalo)"
              >
                <div className="relative">
                  {it.foto_url ? (
                    <img src={it.foto_url} alt="" className="w-full h-40 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-40 bg-black flex items-center justify-center text-zinc-700 text-xs">
                      Sem foto
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
                        isSelected
                          ? 'border-green-500/60 text-green-300 bg-black/50'
                          : 'border-zinc-700 text-zinc-300 bg-black/40'
                      }`}
                    >
                      {isSelected ? 'Selecionado' : 'Selecionar'}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  <p className="font-bold text-white truncate">{nome}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate">{tenantLabel}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {it.tipo_treino} · {it.checkin_local_date}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const nome =
              it?.profiles?.display_name?.trim() ||
              it?.profiles?.nome?.trim() ||
              'Atleta';
            const tenantLabel = it?.tenants?.slug || it.tenant_id;
            const age = status === 'pending' && it?.created_at ? formatPendingAge(it.created_at) : null;
            const tone = status === 'pending' && it?.created_at ? pendingAgeTone(it.created_at) : 'zinc';
            return (
              <li
                key={it.id}
                className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-3 cursor-pointer hover:border-zinc-700"
                onClick={() => openQuick(items.findIndex((x) => x.id === it.id))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openQuick(items.findIndex((x) => x.id === it.id));
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{nome}</p>
                    <p className="text-xs text-zinc-500 font-mono truncate">{tenantLabel}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {it.tipo_treino} · {it.checkin_local_date} · +{it.points_awarded} pts
                    </p>
                    {age ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`text-[10px] uppercase font-bold rounded-full px-2 py-1 border ${
                            tone === 'red'
                              ? 'border-red-900/60 text-red-300 bg-red-950/30'
                              : tone === 'yellow'
                                ? 'border-yellow-900/60 text-yellow-300 bg-yellow-950/30'
                                : 'border-zinc-800 text-zinc-400 bg-zinc-950/30'
                          }`}
                        >
                          Pendente há {age}
                        </span>
                        {typeof it.user_rejections_30d === 'number' ? (
                          <span className="text-[10px] uppercase font-bold rounded-full px-2 py-1 border border-zinc-800 text-zinc-400 bg-zinc-950/30">
                            Rejeições 30d: {it.user_rejections_30d}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">
                    {it.photo_review_status}
                  </span>
                </div>

                {it.foto_url ? (
                  <a
                    href={it.foto_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-zinc-800"
                  >
                    <img src={it.foto_url} alt="" className="w-full h-52 object-cover" loading="lazy" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {quickOpen && focused ? (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-end p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 w-full max-w-lg mx-auto space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 font-mono truncate">{focusedTenant}</p>
                <p className="text-lg font-black text-white truncate">{focusedName}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {focused.tipo_treino} · {focused.checkin_local_date} · +{focused.points_awarded} pts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickOpen(false)}
                className="text-sm text-zinc-500 hover:text-green-400"
              >
                Fechar
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500 uppercase">
              <span className="border border-zinc-800 rounded-full px-2 py-1">A aprovar</span>
              <span className="border border-zinc-800 rounded-full px-2 py-1">R rejeitar</span>
              <span className="border border-zinc-800 rounded-full px-2 py-1">S/P pular</span>
              <span className="border border-zinc-800 rounded-full px-2 py-1">←/→ navegar</span>
              <span className="border border-zinc-800 rounded-full px-2 py-1">Z zoom</span>
              <span className="border border-zinc-800 rounded-full px-2 py-1">Esc fechar</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                {focused.foto_url ? (
                  <img
                    src={focused.foto_url}
                    alt=""
                    className={`w-full h-80 object-contain transition-transform ${zoom ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'}`}
                    onClick={() => setZoom((z) => !z)}
                  />
                ) : (
                  <div className="h-80 flex items-center justify-center text-zinc-600 text-sm">Sem foto</div>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold uppercase text-zinc-500">Contexto do usuário</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(focused.user_id)}
                      className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      title="Copiar user_id"
                    >
                      Copiar user_id
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(focused.tenant_id)}
                      className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      title="Copiar tenant_id"
                    >
                      Copiar tenant_id
                    </button>
                  </div>
                </div>

                {userContextLoading ? (
                  <p className="text-xs text-zinc-500">Carregando contexto…</p>
                ) : userContextError ? (
                  <p className="text-xs text-red-400" role="alert">
                    {userContextError}
                  </p>
                ) : userContext ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Rejeição (30d)</p>
                        <p className="text-sm text-white font-black">
                          {pct(userContext?.stats?.rejection_rate_30d)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Check-ins (30d)</p>
                        <p className="text-sm text-white font-black">{userContext?.stats?.total_30d ?? 0}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Rejeitados (30d)</p>
                        <p className="text-sm text-white font-black">{userContext?.stats?.rejected_30d ?? 0}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Pendentes (30d)</p>
                        <p className="text-sm text-white font-black">{userContext?.stats?.pending_30d ?? 0}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase text-zinc-500 font-bold">Últimos check-ins</p>
                      <div className="space-y-2 max-h-56 overflow-auto pr-1">
                        {(userContext?.recent_checkins ?? []).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-black/20 p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs text-white font-bold truncate">{c.tipo_treino || 'Treino'}</p>
                              <p className="text-[11px] text-zinc-500 truncate">
                                {c.checkin_local_date} · +{c.points_awarded} pts
                              </p>
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                                c.photo_review_status === 'rejected'
                                  ? 'bg-red-500/10 text-red-300'
                                  : c.photo_review_status === 'approved'
                                    ? 'bg-green-500/10 text-green-300'
                                    : 'bg-yellow-500/10 text-yellow-300'
                              }`}
                            >
                              {c.photo_review_status}
                            </span>
                          </div>
                        ))}
                        {Array.isArray(userContext?.recent_checkins) && userContext.recent_checkins.length === 0 ? (
                          <p className="text-xs text-zinc-600">Sem histórico recente.</p>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-zinc-600">Sem dados.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={prevItem}
                className="text-xs py-3"
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={nextItem}
                className="text-xs py-3"
              >
                Pular
              </Button>
              <Button type="button" disabled={busy} onClick={() => review('approve')} className="text-xs py-3">
                Aprovar
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRejectConfirmOpen(true)}
              className="w-full text-xs py-3 border-red-500/40 text-red-300 hover:bg-red-500/10"
            >
              Rejeitar
            </Button>

            {rejectConfirmOpen ? (
              <div className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950/40 space-y-3">
                <p className="text-sm text-white font-bold">Confirmar rejeição?</p>
                <p className="text-xs text-zinc-500">
                  (Motivos padronizados entram no US-ADM-07. Por enquanto, isso apenas marca como rejeitado.)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setRejectConfirmOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRejectConfirmOpen(false);
                      review('reject');
                    }}
                    className="bg-red-500/90 hover:bg-red-500 text-black font-bold"
                  >
                    Rejeitar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

