import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { logger } from '../../lib/logger.js';

const STATUSES = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' }
];

const DEFAULT_REJECTION_REASONS = [
  { code: 'illegible_dark', label: 'Foto ilegível/escura', requires_note: false },
  { code: 'not_proof', label: 'Não comprova atividade', requires_note: false },
  { code: 'duplicate_reused', label: 'Foto duplicada/reutilizada', requires_note: false },
  { code: 'inappropriate', label: 'Conteúdo impróprio', requires_note: false },
  { code: 'screenshot', label: 'Foto de tela/print', requires_note: false },
  { code: 'workout_mismatch', label: 'Tipo de treino não condizente', requires_note: false },
  { code: 'other', label: 'Outro (exige observação)', requires_note: true }
];

export function AdminModerationView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();

  /** Evita chamar Edge Functions antes da sessão JWT estar pronta (reduz 401 / Invalid JWT). */
  const edgeReady = useMemo(
    () =>
      Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
    [supabase, profile?.is_platform_master, authLoading, session?.access_token]
  );

  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [quickOpen, setQuickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectReasonCode, setRejectReasonCode] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [rejectSuspected, setRejectSuspected] = useState(false);
  const [rejectFormError, setRejectFormError] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null);
  const [batchRejectConfirmOpen, setBatchRejectConfirmOpen] = useState(false);
  const [batchRejectReasonCode, setBatchRejectReasonCode] = useState('');
  const [batchRejectNote, setBatchRejectNote] = useState('');
  const [batchRejectSuspected, setBatchRejectSuspected] = useState(false);
  const [batchRejectFormError, setBatchRejectFormError] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState(DEFAULT_REJECTION_REASONS);
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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('oldest'); // oldest | newest | risk
  const [stats, setStats] = useState(null);
  const [userContext, setUserContext] = useState(null);
  const [userContextLoading, setUserContextLoading] = useState(false);
  const [userContextError, setUserContextError] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [messageTemplateCode, setMessageTemplateCode] = useState('');
  const [messageBodyOverride, setMessageBodyOverride] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState(null);
  const [messageSentAt, setMessageSentAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tenantOptions = useMemo(() => {
    return [{ id: '', label: 'Todos os tenants' }].concat(
      (tenants ?? []).map((t) => ({ id: t.id, label: `${t.slug}${t.name ? ` · ${t.name}` : ''}` }))
    );
  }, [tenants]);

  const loadTenants = useCallback(async () => {
    if (!edgeReady) return;
    const { data, error: fnError } = await invokeEdge('admin-tenants', supabase, {
      method: 'GET'
    });
    if (fnError) {
      logger.error('admin tenants', fnError);
      setTenants([]);
      return;
    }
    if (data?.error) {
      logger.error('admin tenants', { message: data.error });
      setTenants([]);
      return;
    }
    setTenants(data?.tenants ?? []);
  }, [supabase, edgeReady]);

  const loadQueue = useCallback(async () => {
    if (!edgeReady) return;
    setLoading(true);
    setError(null);
    setBatchRejectConfirmOpen(false);

    const params = new URLSearchParams();
    params.set('status', status);
    if (tenantId) params.set('tenant_id', tenantId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (tipo) params.set('tipo', tipo);
    if (search) params.set('search', search);
    params.set('sort', sort);
    params.set('include_stats', status === 'pending' ? '1' : '0');
    params.set('limit', '30');
    params.set('offset', '0');

    const { data, error: fnError } = await invokeEdge(
      `admin-moderation?${params.toString()}`,
      supabase,
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
  }, [edgeReady, status, tenantId, from, to, tipo, search, sort]);

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

  useEffect(() => {
    if (!edgeReady) return;
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await invokeEdge('admin-moderation?mode=rejection-reasons', supabase, {
        method: 'GET'
      });
      if (cancelled) return;
      if (fnError || data?.error) {
        setRejectionReasons(DEFAULT_REJECTION_REASONS);
        return;
      }
      const rows = Array.isArray(data?.reasons) ? data.reasons : [];
      if (rows.length === 0) {
        setRejectionReasons(DEFAULT_REJECTION_REASONS);
        return;
      }
      setRejectionReasons(
        rows.map((r) => ({
          code: r.code,
          label: r.label,
          requires_note: Boolean(r.requires_note)
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, edgeReady]);

  useEffect(() => {
    if (!edgeReady) return;
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await invokeEdge('admin-moderation?mode=message-templates', supabase, {
        method: 'GET'
      });
      if (cancelled) return;
      if (fnError || data?.error) {
        setMessageTemplates([]);
        return;
      }
      const rows = Array.isArray(data?.templates) ? data.templates : [];
      setMessageTemplates(rows);
      if (rows.length > 0 && !messageTemplateCode) {
        setMessageTemplateCode(rows[0].code);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, edgeReady, messageTemplateCode]);

  const focused = focusIdx >= 0 && focusIdx < items.length ? items[focusIdx] : null;

  useEffect(() => {
    if (!quickOpen || !focused?.user_id) {
      setUserContext(null);
      setUserContextLoading(false);
      setUserContextError(null);
      setAudit([]);
      setAuditLoading(false);
      setAuditError(null);
      return;
    }
    if (!edgeReady) return;

    let cancelled = false;
    (async () => {
      try {
        setUserContextLoading(true);
        setUserContextError(null);

        const params = new URLSearchParams();
        params.set('mode', 'user-context');
        params.set('user_id', focused.user_id);
        if (focused?.tenant_id) params.set('tenant_id', focused.tenant_id);

        const { data, error: fnError } = await invokeEdge(`admin-moderation?${params.toString()}`, supabase, {
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
  }, [quickOpen, focused?.user_id, focused?.tenant_id, supabase, edgeReady]);

  useEffect(() => {
    if (!quickOpen || !focused?.id) return;
    if (!edgeReady) return;

    let cancelled = false;
    (async () => {
      try {
        setAuditLoading(true);
        setAuditError(null);
        const params = new URLSearchParams();
        params.set('mode', 'checkin-audit');
        params.set('checkin_id', focused.id);
        const { data, error: fnError } = await invokeEdge(`admin-moderation?${params.toString()}`, supabase, {
          method: 'GET'
        });
        if (cancelled) return;
        if (fnError) {
          setAudit([]);
          setAuditError(fnError.message);
          setAuditLoading(false);
          return;
        }
        if (data?.error) {
          setAudit([]);
          setAuditError(data.error);
          setAuditLoading(false);
          return;
        }
        setAudit(Array.isArray(data?.audit) ? data.audit : []);
        setAuditLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Erro ao carregar histórico';
        setAudit([]);
        setAuditError(msg);
        setAuditLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quickOpen, focused?.id, supabase, edgeReady]);

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

  const sendMessage = useCallback(async () => {
    if (!edgeReady) return;
    if (!focused?.user_id) return;
    const code = (messageTemplateCode ?? '').trim();
    if (!code) {
      setMessageError('Selecione um template.');
      return;
    }
    setMessageSending(true);
    setMessageError(null);
    setMessageSentAt(null);
    try {
      const { error: fnError } = await invokeEdge('admin-moderation', supabase, {
        method: 'PATCH',
        body: {
          action: 'send-message',
          user_id: focused.user_id,
          tenant_id: focused.tenant_id,
          checkin_id: focused.id,
          template_code: code,
          body_override: (messageBodyOverride ?? '').trim() ? messageBodyOverride.trim() : undefined
        }
      });
      if (fnError) {
        setMessageError(fnError.message);
        return;
      }
      setMessageSentAt(Date.now());
      setMessageBodyOverride('');
    } finally {
      setMessageSending(false);
    }
  }, [
    edgeReady,
    focused?.id,
    focused?.user_id,
    focused?.tenant_id,
    messageTemplateCode,
    messageBodyOverride
  ]);

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
    setRejectReasonCode('');
    setRejectNote('');
    setRejectSuspected(false);
    setRejectFormError(null);
  };

  const nextItem = () => {
    const next = focusIdx + 1;
    if (next < items.length) {
      setFocusIdx(next);
      setZoom(false);
      setRejectConfirmOpen(false);
      setRejectReasonCode('');
      setRejectNote('');
      setRejectSuspected(false);
      setRejectFormError(null);
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
      setRejectReasonCode('');
      setRejectNote('');
      setRejectSuspected(false);
      setRejectFormError(null);
    }
  };

  const review = async (action, extras = null) => {
    if (!focused?.id) return;
    if (!edgeReady) return;
    setBusy(true);
    setError(null);
    try {
      const { error: fnError } = await invokeEdge('admin-moderation', supabase, {
        method: 'PATCH',
        body: { checkin_id: focused.id, action, ...(extras ?? {}) }
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

  const batchReview = async (action, extras = null) => {
    if (!edgeReady) return;
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const { data, error: fnError } = await invokeEdge('admin-moderation', supabase, {
        method: 'PATCH',
        body: { checkin_ids: ids, action, ...(extras ?? {}) }
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

  const openRejectModal = useCallback(() => {
    setRejectConfirmOpen(true);
    setRejectReasonCode('');
    setRejectNote('');
    setRejectSuspected(false);
    setRejectFormError(null);
  }, []);

  const submitReject = useCallback(async () => {
    const code = rejectReasonCode?.trim();
    const note = rejectNote?.trim();
    if (!code) {
      setRejectFormError('Selecione um motivo.');
      return;
    }
    if (code === 'other' && !note) {
      setRejectFormError('Informe uma observação (obrigatório para “Outro”).');
      return;
    }
    setRejectFormError(null);
    setRejectConfirmOpen(false);
    await review('reject', {
      rejection_reason_code: code,
      rejection_note: note || undefined,
      is_suspected: rejectSuspected
    });
  }, [rejectReasonCode, rejectNote, rejectSuspected, review]);

  const openBatchRejectModal = useCallback(() => {
    setBatchRejectConfirmOpen(true);
    setBatchRejectReasonCode('');
    setBatchRejectNote('');
    setBatchRejectSuspected(false);
    setBatchRejectFormError(null);
  }, []);

  const submitBatchReject = useCallback(async () => {
    const code = batchRejectReasonCode?.trim();
    const note = batchRejectNote?.trim();
    if (!code) {
      setBatchRejectFormError('Selecione um motivo.');
      return;
    }
    if (code === 'other' && !note) {
      setBatchRejectFormError('Informe uma observação (obrigatório para “Outro”).');
      return;
    }
    setBatchRejectFormError(null);
    setBatchRejectConfirmOpen(false);
    await batchReview('reject', {
      rejection_reason_code: code,
      rejection_note: note || undefined,
      is_suspected: batchRejectSuspected
    });
  }, [batchRejectReasonCode, batchRejectNote, batchRejectSuspected, batchReview]);

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
        openRejectModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickOpen, focused?.id, shortcutsEnabled, busy, rejectConfirmOpen, openRejectModal]);

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
            <span className="text-[10px] uppercase font-bold text-zinc-500">Buscar usuário</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou user_id"
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
              <p className="text-sm text-white font-bold">Rejeitar {selectedCount} itens</p>
              <div className="space-y-2">
                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Motivo (obrigatório)</span>
                  <select
                    value={batchRejectReasonCode}
                    onChange={(e) => {
                      setBatchRejectReasonCode(e.target.value);
                      setBatchRejectFormError(null);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="">Selecione…</option>
                    {rejectionReasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 block">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">
                      Observação {batchRejectReasonCode === 'other' ? '(obrigatória)' : '(opcional)'}
                    </span>
                  <textarea
                    value={batchRejectNote}
                    onChange={(e) => {
                      setBatchRejectNote(e.target.value);
                      setBatchRejectFormError(null);
                    }}
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                    placeholder={batchRejectReasonCode === 'other' ? 'Descreva o motivo…' : 'Opcional'}
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs text-white font-bold truncate">Marcar como suspeito/fraude</p>
                    <p className="text-[11px] text-zinc-500 truncate">Ajuda a priorizar e auditar.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={batchRejectSuspected}
                    onChange={(e) => setBatchRejectSuspected(e.target.checked)}
                    className="h-4 w-4 accent-red-500"
                    aria-label="Marcar como suspeito/fraude"
                  />
                </label>

                {batchRejectFormError ? (
                  <p className="text-xs text-red-400" role="alert">
                    {batchRejectFormError}
                  </p>
                ) : null}
              </div>

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
                  onClick={submitBatchReject}
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
        <div className="fixed inset-0 z-50 bg-black/90 overflow-y-auto p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 w-full max-w-lg mx-auto space-y-4 my-4">
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

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
              <p className="text-[10px] uppercase font-bold text-zinc-500">Mensagem ao usuário</p>
              <div className="grid grid-cols-1 gap-2">
                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Template</span>
                  <select
                    value={messageTemplateCode}
                    onChange={(e) => setMessageTemplateCode(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    {messageTemplates.length === 0 ? <option value="">(sem templates)</option> : null}
                    {messageTemplates.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.title || t.code}
                      </option>
                    ))}
                  </select>
                </label>

                {(() => {
                  const selectedTpl = messageTemplates.find((t) => t.code === messageTemplateCode);
                  return selectedTpl?.body ? (
                    <div className="rounded-xl border border-zinc-800 bg-black/20 p-3 space-y-1">
                      <p className="text-[10px] uppercase font-bold text-zinc-500">Preview do template</p>
                      <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{selectedTpl.body}</p>
                    </div>
                  ) : null;
                })()}

                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Editar mensagem (opcional)</span>
                  <textarea
                    value={messageBodyOverride}
                    onChange={(e) => setMessageBodyOverride(e.target.value)}
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                    placeholder="Se vazio, usa o texto padrão do template."
                  />
                </label>

                {messageError ? (
                  <p className="text-xs text-red-400" role="alert">
                    {messageError}
                  </p>
                ) : null}
                {messageSentAt ? <p className="text-xs text-green-400">Mensagem enviada.</p> : null}

                <Button
                  type="button"
                  disabled={messageSending || messageTemplates.length === 0}
                  onClick={sendMessage}
                  className="text-xs py-2 px-3 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                >
                  {messageSending ? 'Enviando…' : 'Enviar mensagem'}
                </Button>
              </div>
            </div>

            {focused.photo_review_status === 'rejected' ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={prevItem} className="text-xs py-3">
                  Anterior
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => review('reapprove')}
                  className="text-xs py-3 bg-green-500/90 hover:bg-green-500 text-black font-bold"
                >
                  Reaprovar
                </Button>
              </div>
            ) : (
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
            )}

            {focused.photo_review_status !== 'rejected' ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={openRejectModal}
                className="w-full text-xs py-3 border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                Rejeitar
              </Button>
            ) : null}

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-2">
              <p className="text-[10px] uppercase font-bold text-zinc-500">Histórico de decisões</p>
              {auditLoading ? <p className="text-xs text-zinc-500">Carregando…</p> : null}
              {auditError ? (
                <p className="text-xs text-red-400" role="alert">
                  {auditError}
                </p>
              ) : null}
              {!auditLoading && !auditError ? (
                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {(audit ?? []).map((a) => (
                    <div key={a.id} className="text-xs text-zinc-400 border border-zinc-800 rounded-xl p-2">
                      <p className="font-mono text-[10px] text-zinc-500">{a.action}</p>
                      <p className="text-zinc-300">
                        Δ {a.points_delta ?? 0} pts · {new Date(a.decided_at).toLocaleString('pt-BR')}
                      </p>
                      {a.reason_code ? <p>Motivo: {a.reason_code}</p> : null}
                      {a.note ? <p>Obs: {a.note}</p> : null}
                    </div>
                  ))}
                  {Array.isArray(audit) && audit.length === 0 ? (
                    <p className="text-xs text-zinc-600">Sem histórico.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {rejectConfirmOpen ? (
              <div className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950/40 space-y-3">
                <p className="text-sm text-white font-bold">Rejeitar item</p>

                <div className="space-y-2">
                  <label className="space-y-1 block">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Motivo (obrigatório)</span>
                    <select
                      value={rejectReasonCode}
                      onChange={(e) => {
                        setRejectReasonCode(e.target.value);
                        setRejectFormError(null);
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                    >
                      <option value="">Selecione…</option>
                    {rejectionReasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                    </select>
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">
                      Observação {rejectReasonCode === 'other' ? '(obrigatória)' : '(opcional)'}
                    </span>
                    <textarea
                      value={rejectNote}
                      onChange={(e) => {
                        setRejectNote(e.target.value);
                        setRejectFormError(null);
                      }}
                      rows={3}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                      placeholder={rejectReasonCode === 'other' ? 'Descreva o motivo…' : 'Opcional'}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-bold truncate">Marcar como suspeito/fraude</p>
                      <p className="text-[11px] text-zinc-500 truncate">Ajuda a priorizar e auditar.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={rejectSuspected}
                      onChange={(e) => setRejectSuspected(e.target.checked)}
                      className="h-4 w-4 accent-red-500"
                      aria-label="Marcar como suspeito/fraude"
                    />
                  </label>

                  {rejectFormError ? (
                    <p className="text-xs text-red-400" role="alert">
                      {rejectFormError}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setRejectConfirmOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={submitReject}
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

