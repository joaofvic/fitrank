import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '../auth/AuthProvider.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { logger } from '../../lib/logger.js';
import { DEFAULT_REJECTION_REASONS } from '../admin/moderation/moderation-constants.js';
import { ModerationToolbar } from '../admin/moderation/ModerationToolbar.jsx';
import { ModerationGridCard, ModerationListCard } from '../admin/moderation/ModerationItemCard.jsx';
import { BatchActions } from '../admin/moderation/BatchActions.jsx';
import { QuickReviewPanel } from '../admin/moderation/QuickReviewPanel.jsx';

function VirtualizedModerationList({ items, status, formatPendingAge, pendingAgeTone, openQuick }) {
  const listRef = useRef(null);
  const offsetRef = useRef(0);

  useLayoutEffect(() => {
    offsetRef.current = listRef.current?.offsetTop ?? 0;
  });

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 90,
    overscan: 6,
    scrollMargin: offsetRef.current,
    gap: 12,
  });

  return (
    <div
      ref={listRef}
      role="list"
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const it = items[virtualRow.index];
        return (
          <div
            key={it.id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <ModerationListCard
              item={it}
              status={status}
              formatPendingAge={formatPendingAge}
              pendingAgeTone={pendingAgeTone}
              onOpen={() => openQuick(items.findIndex((x) => x.id === it.id))}
            />
          </div>
        );
      })}
    </div>
  );
}

function VirtualizedModerationGrid({ items, selectedIds, onToggleSelect }) {
  const gridRef = useRef(null);
  const offsetRef = useRef(0);

  const rowCount = Math.ceil(items.length / 2);

  useLayoutEffect(() => {
    offsetRef.current = gridRef.current?.offsetTop ?? 0;
  });

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 220,
    overscan: 4,
    scrollMargin: offsetRef.current,
    gap: 12,
  });

  return (
    <div
      ref={gridRef}
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const i0 = virtualRow.index * 2;
        const i1 = i0 + 1;
        return (
          <div
            key={virtualRow.index}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="grid grid-cols-2 gap-3"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <ModerationGridCard item={items[i0]} idx={i0} isSelected={selectedIds.has(items[i0].id)} onToggleSelect={onToggleSelect} />
            {i1 < items.length && (
              <ModerationGridCard item={items[i1]} idx={i1} isSelected={selectedIds.has(items[i1].id)} onToggleSelect={onToggleSelect} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AdminModerationView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();
  const edgeReady = useMemo(
    () => Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
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
  const [viewMode, setViewMode] = useState('list');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState(null);
  const [batchRejectConfirmOpen, setBatchRejectConfirmOpen] = useState(false);
  const [batchRejectReasonCode, setBatchRejectReasonCode] = useState('');
  const [batchRejectNote, setBatchRejectNote] = useState('');
  const [batchRejectSuspected, setBatchRejectSuspected] = useState(false);
  const [batchRejectFormError, setBatchRejectFormError] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState(DEFAULT_REJECTION_REASONS);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => {
    try { const v = localStorage.getItem('fitrank.admin.shortcuts'); return v === null ? true : v !== '0'; } catch { return true; }
  });
  const [status, setStatus] = useState('pending');
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tipo, setTipo] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('oldest');
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

  const tenantOptions = useMemo(
    () => [{ id: '', label: 'Todos os tenants' }].concat((tenants ?? []).map((t) => ({ id: t.id, label: `${t.slug}${t.name ? ` · ${t.name}` : ''}` }))),
    [tenants]
  );

  const loadTenants = useCallback(async () => {
    if (!edgeReady) return;
    const { data, error: fnError } = await invokeEdge('admin-tenants', supabase, { method: 'GET' });
    if (fnError) { logger.error('admin tenants', fnError); setTenants([]); return; }
    if (data?.error) { logger.error('admin tenants', { message: data.error }); setTenants([]); return; }
    setTenants(data?.tenants ?? []);
  }, [supabase, edgeReady]);

  const loadQueue = useCallback(async () => {
    if (!edgeReady) return;
    setLoading(true); setError(null); setBatchRejectConfirmOpen(false);
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
    const { data, error: fnError } = await invokeEdge(`admin-moderation?${params.toString()}`, supabase, { method: 'GET' });
    if (fnError) { setError(fnError.message); setItems([]); setLoading(false); return; }
    if (data?.error) { setError(data.error); setItems([]); setStats(null); setLoading(false); return; }
    setItems(Array.isArray(data?.items) ? data.items : []);
    setStats(data?.stats ?? null);
    setSelectedIds(new Set()); setLastSelectedIdx(null);
    setFocusIdx((prev) => { const next = Array.isArray(data?.items) && data.items.length > 0 ? Math.min(prev, data.items.length - 1) : -1; return Number.isFinite(next) ? next : -1; });
    setLoading(false);
  }, [edgeReady, status, tenantId, from, to, tipo, search, sort]);

  const formatPendingAge = useCallback((createdAt) => {
    const ms = new Date().getTime() - new Date(createdAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 1) return 'agora';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
  }, []);

  const pendingAgeTone = useCallback((createdAt) => {
    const hours = (new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(hours) || hours < 0) return 'zinc';
    if (hours >= 24) return 'red';
    if (hours >= 12) return 'yellow';
    return 'zinc';
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  useEffect(() => {
    if (!edgeReady) return;
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await invokeEdge('admin-moderation?mode=rejection-reasons', supabase, { method: 'GET' });
      if (cancelled) return;
      if (fnError || data?.error) { setRejectionReasons(DEFAULT_REJECTION_REASONS); return; }
      const rows = Array.isArray(data?.reasons) ? data.reasons : [];
      if (rows.length === 0) { setRejectionReasons(DEFAULT_REJECTION_REASONS); return; }
      setRejectionReasons(rows.map((r) => ({ code: r.code, label: r.label, requires_note: Boolean(r.requires_note) })));
    })();
    return () => { cancelled = true; };
  }, [supabase, edgeReady]);

  useEffect(() => {
    if (!edgeReady) return;
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await invokeEdge('admin-moderation?mode=message-templates', supabase, { method: 'GET' });
      if (cancelled) return;
      if (fnError || data?.error) { setMessageTemplates([]); return; }
      const rows = Array.isArray(data?.templates) ? data.templates : [];
      setMessageTemplates(rows);
      if (rows.length > 0 && !messageTemplateCode) setMessageTemplateCode(rows[0].code);
    })();
    return () => { cancelled = true; };
  }, [supabase, edgeReady, messageTemplateCode]);

  const focused = focusIdx >= 0 && focusIdx < items.length ? items[focusIdx] : null;

  useEffect(() => {
    if (!quickOpen || !focused?.user_id) { setUserContext(null); setUserContextLoading(false); setUserContextError(null); setAudit([]); setAuditLoading(false); setAuditError(null); return; }
    if (!edgeReady) return;
    let cancelled = false;
    (async () => {
      try {
        setUserContextLoading(true); setUserContextError(null);
        const params = new URLSearchParams(); params.set('mode', 'user-context'); params.set('user_id', focused.user_id);
        if (focused?.tenant_id) params.set('tenant_id', focused.tenant_id);
        const { data, error: fnError } = await invokeEdge(`admin-moderation?${params.toString()}`, supabase, { method: 'GET' });
        if (cancelled) return;
        if (fnError) { setUserContext(null); setUserContextError(fnError.message); setUserContextLoading(false); return; }
        if (data?.error) { setUserContext(null); setUserContextError(data.error); setUserContextLoading(false); return; }
        setUserContext(data?.context ?? null); setUserContextLoading(false);
      } catch (e) { if (cancelled) return; setUserContext(null); setUserContextError(e instanceof Error ? e.message : 'Erro ao carregar contexto'); setUserContextLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [quickOpen, focused?.user_id, focused?.tenant_id, supabase, edgeReady]);

  useEffect(() => {
    if (!quickOpen || !focused?.id || !edgeReady) return;
    let cancelled = false;
    (async () => {
      try {
        setAuditLoading(true); setAuditError(null);
        const params = new URLSearchParams(); params.set('mode', 'checkin-audit'); params.set('checkin_id', focused.id);
        const { data, error: fnError } = await invokeEdge(`admin-moderation?${params.toString()}`, supabase, { method: 'GET' });
        if (cancelled) return;
        if (fnError) { setAudit([]); setAuditError(fnError.message); setAuditLoading(false); return; }
        if (data?.error) { setAudit([]); setAuditError(data.error); setAuditLoading(false); return; }
        setAudit(Array.isArray(data?.audit) ? data.audit : []); setAuditLoading(false);
      } catch (e) { if (cancelled) return; setAudit([]); setAuditError(e instanceof Error ? e.message : 'Erro ao carregar histórico'); setAuditLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [quickOpen, focused?.id, supabase, edgeReady]);

  const pct = useCallback((value) => (typeof value !== 'number' || !Number.isFinite(value) ? '—' : `${Math.round(value * 100)}%`), []);
  const copyText = useCallback(async (text) => { try { if (text) await navigator.clipboard.writeText(String(text)); } catch { /* ignore */ } }, []);

  const sendMessage = useCallback(async () => {
    if (!edgeReady || !focused?.user_id) return;
    const code = (messageTemplateCode ?? '').trim();
    if (!code) { setMessageError('Selecione um template.'); return; }
    setMessageSending(true); setMessageError(null); setMessageSentAt(null);
    try {
      const { error: fnError } = await invokeEdge('admin-moderation', supabase, {
        method: 'PATCH',
        body: { action: 'send-message', user_id: focused.user_id, tenant_id: focused.tenant_id, checkin_id: focused.id, template_code: code, body_override: (messageBodyOverride ?? '').trim() || undefined }
      });
      if (fnError) { setMessageError(fnError.message); return; }
      setMessageSentAt(Date.now()); setMessageBodyOverride('');
    } finally { setMessageSending(false); }
  }, [edgeReady, focused?.id, focused?.user_id, focused?.tenant_id, messageTemplateCode, messageBodyOverride]);

  if (!profile?.is_platform_master) return null;

  const focusedName = focused?.profiles?.display_name?.trim() || focused?.profiles?.nome?.trim() || 'Atleta';
  const focusedTenant = focused?.tenants?.slug || focused?.tenant_id || '—';

  const resetRejectForm = () => { setRejectReasonCode(''); setRejectNote(''); setRejectSuspected(false); setRejectFormError(null); };

  const openQuick = (idx) => { setFocusIdx(idx); setQuickOpen(true); setZoom(false); setRejectConfirmOpen(false); resetRejectForm(); };

  const nextItem = () => {
    const next = focusIdx + 1;
    if (next < items.length) { setFocusIdx(next); setZoom(false); setRejectConfirmOpen(false); resetRejectForm(); return; }
    setQuickOpen(false); setRejectConfirmOpen(false);
  };

  const prevItem = () => {
    const prev = focusIdx - 1;
    if (prev >= 0) { setFocusIdx(prev); setZoom(false); setRejectConfirmOpen(false); resetRejectForm(); }
  };

  const review = async (action, extras = null) => {
    if (!focused?.id || !edgeReady) return;
    setBusy(true); setError(null);
    try {
      const { error: fnError } = await invokeEdge('admin-moderation', supabase, { method: 'PATCH', body: { checkin_id: focused.id, action, ...(extras ?? {}) } });
      if (fnError) { setError(fnError.message); return; }
      setItems((prev) => prev.filter((x) => x.id !== focused.id));
      setFocusIdx((prev) => Math.max(0, Math.min(prev, items.length - 2)));
      nextItem();
    } finally { setBusy(false); }
  };

  const selectedCount = selectedIds.size;

  const toggleSelect = (id, idx, isRange) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isRange && lastSelectedIdx !== null) { const a = Math.min(lastSelectedIdx, idx); const b = Math.max(lastSelectedIdx, idx); for (let i = a; i <= b; i++) { const cid = items[i]?.id; if (cid) next.add(cid); } return next; }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastSelectedIdx(idx);
  };

  const selectAll = () => { setSelectedIds(new Set(items.map((x) => x.id).filter(Boolean))); setLastSelectedIdx(items.length > 0 ? 0 : null); };
  const clearSelection = () => { setSelectedIds(new Set()); setLastSelectedIdx(null); };

  const batchReview = async (action, extras = null) => {
    if (!edgeReady || selectedIds.size === 0) return;
    setBusy(true); setError(null);
    try {
      const ids = Array.from(selectedIds);
      const { data, error: fnError } = await invokeEdge('admin-moderation', supabase, { method: 'PATCH', body: { checkin_ids: ids, action, ...(extras ?? {}) } });
      if (fnError) { setError(fnError.message); return; }
      const updatedIds = Array.isArray(data?.updated_ids) ? data.updated_ids : ids;
      setItems((prev) => prev.filter((x) => !updatedIds.includes(x.id)));
      clearSelection(); setBatchRejectConfirmOpen(false);
    } finally { setBusy(false); }
  };

  const openRejectModal = useCallback(() => { setRejectConfirmOpen(true); resetRejectForm(); }, []);

  const submitReject = useCallback(async () => {
    const code = rejectReasonCode?.trim(); const note = rejectNote?.trim();
    if (!code) { setRejectFormError('Selecione um motivo.'); return; }
    if (code === 'other' && !note) { setRejectFormError('Informe uma observação (obrigatório para "Outro").'); return; }
    setRejectFormError(null); setRejectConfirmOpen(false);
    await review('reject', { rejection_reason_code: code, rejection_note: note || undefined, is_suspected: rejectSuspected });
  }, [rejectReasonCode, rejectNote, rejectSuspected, review]);

  const submitBatchReject = useCallback(async () => {
    const code = batchRejectReasonCode?.trim(); const note = batchRejectNote?.trim();
    if (!code) { setBatchRejectFormError('Selecione um motivo.'); return; }
    if (code === 'other' && !note) { setBatchRejectFormError('Informe uma observação (obrigatório para "Outro").'); return; }
    setBatchRejectFormError(null); setBatchRejectConfirmOpen(false);
    await batchReview('reject', { rejection_reason_code: code, rejection_note: note || undefined, is_suspected: batchRejectSuspected });
  }, [batchRejectReasonCode, batchRejectNote, batchRejectSuspected, batchReview]);

  const toggleShortcuts = () => {
    setShortcutsEnabled((prev) => { const next = !prev; try { localStorage.setItem('fitrank.admin.shortcuts', next ? '1' : '0'); } catch { /* ignore */ } return next; });
  };

  // Keyboard shortcuts: quick review mode
  useEffect(() => {
    if (!quickOpen || !focused || !shortcutsEnabled) return;
    const onKeyDown = (e) => {
      if (busy || e.defaultPrevented) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); if (rejectConfirmOpen) { setRejectConfirmOpen(false); return; } setQuickOpen(false); return; }
      if (k === 'ArrowRight') { e.preventDefault(); nextItem(); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); prevItem(); return; }
      const key = k.length === 1 ? k.toLowerCase() : k;
      if (key === 'z') { e.preventDefault(); setZoom((v) => !v); return; }
      if (key === 's' || key === 'p') { e.preventDefault(); nextItem(); return; }
      if (key === 'a') { e.preventDefault(); review('approve'); return; }
      if (key === 'r') { e.preventDefault(); openRejectModal(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickOpen, focused?.id, shortcutsEnabled, busy, rejectConfirmOpen, openRejectModal]);

  // Keyboard shortcuts: grid mode
  useEffect(() => {
    if (quickOpen || viewMode !== 'grid' || !shortcutsEnabled) return;
    const onKeyDown = (e) => {
      if (busy || e.defaultPrevented) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
      if (e.key === 'Escape') { e.preventDefault(); if (batchRejectConfirmOpen) { setBatchRejectConfirmOpen(false); return; } clearSelection(); return; }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'g') { e.preventDefault(); setViewMode('list'); clearSelection(); return; }
      if (key === 'a') { if (selectedCount === 0) return; e.preventDefault(); batchReview('approve'); return; }
      if (key === 'r') { if (selectedCount === 0) return; e.preventDefault(); setBatchRejectConfirmOpen(true); }
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
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">Voltar</button>
      </div>

      {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

      <ModerationToolbar
        status={status} onStatus={setStatus}
        tenantOptions={tenantOptions} tenantId={tenantId} onTenantId={setTenantId}
        tipo={tipo} onTipo={setTipo}
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort}
        from={from} onFrom={setFrom}
        to={to} onTo={setTo}
        stats={stats}
        loading={loading} itemCount={items.length}
        viewMode={viewMode} onToggleViewMode={() => { setViewMode((m) => (m === 'grid' ? 'list' : 'grid')); clearSelection(); }}
        shortcutsEnabled={shortcutsEnabled} onToggleShortcuts={toggleShortcuts}
        quickOpen={quickOpen} focusIdx={focusIdx}
        onOpenQuick={openQuick} onRefresh={loadQueue}
        selectedCount={selectedCount}
      />

      {viewMode === 'grid' && items.length > 0 ? (
        <BatchActions
          selectedCount={selectedCount} busy={busy}
          onSelectAll={selectAll} onClearSelection={clearSelection}
          onBatchApprove={() => batchReview('approve')}
          batchRejectConfirmOpen={batchRejectConfirmOpen}
          onOpenBatchReject={() => setBatchRejectConfirmOpen(true)}
          onCloseBatchReject={() => setBatchRejectConfirmOpen(false)}
          batchRejectReasonCode={batchRejectReasonCode} onBatchRejectReasonCode={setBatchRejectReasonCode}
          batchRejectNote={batchRejectNote} onBatchRejectNote={setBatchRejectNote}
          batchRejectSuspected={batchRejectSuspected} onBatchRejectSuspected={setBatchRejectSuspected}
          batchRejectFormError={batchRejectFormError} onBatchRejectFormError={setBatchRejectFormError}
          rejectionReasons={rejectionReasons}
          onSubmitBatchReject={submitBatchReject}
        />
      ) : null}

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando fila…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">Nenhum item encontrado.</div>
      ) : viewMode === 'grid' ? (
        <VirtualizedModerationGrid items={items} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      ) : (
        <VirtualizedModerationList items={items} status={status} formatPendingAge={formatPendingAge} pendingAgeTone={pendingAgeTone} openQuick={openQuick} />
      )}

      {quickOpen && focused ? (
        <QuickReviewPanel
          focused={focused} focusedName={focusedName} focusedTenant={focusedTenant}
          busy={busy} zoom={zoom} onToggleZoom={() => setZoom((z) => !z)}
          onClose={() => setQuickOpen(false)} onNext={nextItem} onPrev={prevItem}
          onApprove={() => review('approve')} onReapprove={() => review('reapprove')} onOpenReject={openRejectModal}
          rejectConfirmOpen={rejectConfirmOpen}
          rejectReasonCode={rejectReasonCode} onRejectReasonCode={setRejectReasonCode}
          rejectNote={rejectNote} onRejectNote={setRejectNote}
          rejectSuspected={rejectSuspected} onRejectSuspected={setRejectSuspected}
          rejectFormError={rejectFormError} onClearRejectFormError={() => setRejectFormError(null)}
          onCloseReject={() => setRejectConfirmOpen(false)} onSubmitReject={submitReject}
          rejectionReasons={rejectionReasons}
          userContext={userContext} userContextLoading={userContextLoading} userContextError={userContextError} pct={pct} copyText={copyText}
          audit={audit} auditLoading={auditLoading} auditError={auditError}
          messageTemplates={messageTemplates} messageTemplateCode={messageTemplateCode} onMessageTemplateCode={setMessageTemplateCode}
          messageBodyOverride={messageBodyOverride} onMessageBodyOverride={setMessageBodyOverride}
          messageError={messageError} messageSentAt={messageSentAt} messageSending={messageSending} onSendMessage={sendMessage}
        />
      ) : null}
    </div>
  );
}
