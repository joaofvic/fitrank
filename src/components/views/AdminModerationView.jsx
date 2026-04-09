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

    const params = new URLSearchParams();
    params.set('status', status);
    if (tenantId) params.set('tenant_id', tenantId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (tipo) params.set('tipo', tipo);
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
      setLoading(false);
      return;
    }

    setItems(Array.isArray(data?.items) ? data.items : []);
    setFocusIdx((prev) => {
      const next = Array.isArray(data?.items) && data.items.length > 0 ? Math.min(prev, data.items.length - 1) : -1;
      return Number.isFinite(next) ? next : -1;
    });
    setLoading(false);
  }, [supabase, profile?.is_platform_master, status, tenantId, from, to, tipo, session?.access_token]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  if (!profile?.is_platform_master) {
    return null;
  }

  const focused = focusIdx >= 0 && focusIdx < items.length ? items[focusIdx] : null;
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
          <p className="text-xs text-zinc-500">{loading ? 'Carregando…' : `${items.length} itens`}</p>
          <Button type="button" onClick={loadQueue} className="text-xs py-2 px-3">
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando fila…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">
          Nenhum item encontrado.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const nome =
              it?.profiles?.display_name?.trim() ||
              it?.profiles?.nome?.trim() ||
              'Atleta';
            const tenantLabel = it?.tenants?.slug || it.tenant_id;
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

