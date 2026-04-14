import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { logger } from '../../lib/logger.js';

import {
  addDays, toISODate, pctChange,
  toneVolumeDelta, toneHigherIsBetter, toneLowerIsBetter, toneModerationHours,
  buildEngagementInsights,
  DEFAULT_CSV_SECTIONS, mergeCsvSectionsFromStorage,
  buildCsv, buildEngagementFilterLines, buildEngagementExportFilename
} from '../admin/engagement/engagement-helpers.jsx';
import { EngagementFilters } from '../admin/engagement/EngagementFilters.jsx';
import { EngagementKpiGrid } from '../admin/engagement/EngagementKpiGrid.jsx';
import { EngagementAlerts, EngagementInsightsCard } from '../admin/engagement/EngagementInsights.jsx';
import { EngagementCharts } from '../admin/engagement/EngagementCharts.jsx';
import { RejectionAnalysis } from '../admin/engagement/RejectionAnalysis.jsx';
import { KpiGridSkeleton, AdminCardSkeleton } from '../ui/Skeleton.jsx';

function EngagementLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <KpiGridSkeleton count={7} />
      <AdminCardSkeleton lines={3} />
      <AdminCardSkeleton lines={3} />
    </div>
  );
}

export function AdminEngagementView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();
  const edgeReady = useMemo(
    () => Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
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
        logger.error('admin_ui_preferences', error);
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
    return () => { cancelled = true; };
  }, [supabase, profile?.id, profile?.is_platform_master]);

  useEffect(() => {
    if (!supabase || !profile?.id || !profile?.is_platform_master || !prefsHydrated) return;
    const t = window.setTimeout(async () => {
      const base = adminUiPrefsBaseRef.current && typeof adminUiPrefsBaseRef.current === 'object' ? { ...adminUiPrefsBaseRef.current } : {};
      const next = { ...base, engagement_csv_sections: csvSections };
      const { error } = await supabase.from('profiles').update({ admin_ui_preferences: next }).eq('id', profile.id);
      if (error) { logger.error('salvar colunas CSV (admin_ui_preferences)', error); return; }
      adminUiPrefsBaseRef.current = next;
    }, 500);
    return () => window.clearTimeout(t);
  }, [csvSections, prefsHydrated, supabase, profile?.id, profile?.is_platform_master]);

  const loadTenants = useCallback(async () => {
    if (!edgeReady) return;
    const { data: res, error: fnError } = await invokeEdge('admin-tenants', supabase, { method: 'GET' });
    if (!fnError && !res?.error) setTenants(res?.tenants ?? []);
  }, [edgeReady, supabase]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const { startStr, endStr } = useMemo(() => {
    const end = new Date();
    const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (useCustom && customStart && customEnd && customStart <= customEnd) return { startStr: customStart, endStr: customEnd };
    const days = preset === '7' ? 6 : preset === '90' ? 89 : 29;
    return { startStr: toISODate(addDays(endD, -days)), endStr: toISODate(endD) };
  }, [preset, useCustom, customStart, customEnd]);

  const regionOptions = useMemo(() => {
    const set = new Set();
    for (const t of tenants) { const r = String(t.region ?? '').trim(); if (r) set.add(r); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [tenants]);

  const segmentRpcParams = useMemo(
    () => ({ p_region: regionFilter.trim() || null, p_user_type: userType === 'all' ? null : userType, p_plan: planFilter === 'all' ? null : planFilter }),
    [regionFilter, userType, planFilter]
  );

  const { prevStartStr, prevEndStr } = useMemo(() => {
    const startD = new Date(`${startStr}T00:00:00.000Z`);
    const endD = new Date(`${endStr}T00:00:00.000Z`);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return { prevStartStr: null, prevEndStr: null };
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
      const args = { p_start: startStr, p_end: endStr, p_tenant_id: tenantId || null, ...segmentRpcParams };
      const prevArgs = prevStartStr && prevEndStr ? { p_start: prevStartStr, p_end: prevEndStr, p_tenant_id: tenantId || null, ...segmentRpcParams } : null;
      const [currRes, prevRes] = await Promise.all([
        supabase.rpc('admin_engagement_metrics', args),
        prevArgs ? supabase.rpc('admin_engagement_metrics', prevArgs) : Promise.resolve({ data: null, error: null })
      ]);
      if (currRes.error) { setData(null); setPrevData(null); setError(currRes.error.message ?? 'Falha ao carregar métricas'); return; }
      setPrevData(prevRes?.error ? null : (prevRes?.data ?? null));
      setData(currRes.data);
    } catch (e) { setData(null); setPrevData(null); setError(e?.message ?? 'Falha ao carregar métricas'); }
    finally { setLoading(false); }
  }, [supabase, profile?.is_platform_master, startStr, endStr, tenantId, prevStartStr, prevEndStr, segmentRpcParams]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const loadAlerts = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setAlerts([]); setAlertsLoading(true); setAlertsError(null);
    try {
      const { data: raw, error: rpcErr } = await supabase.rpc('admin_engagement_alerts', { p_tenant_id: tenantId || null, ...segmentRpcParams });
      if (rpcErr) { setAlerts([]); setAlertsError(rpcErr.message ?? 'Falha ao carregar alertas'); return; }
      setAlerts(Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []);
    } catch (err) { setAlerts([]); setAlertsError(err?.message ?? 'Falha ao carregar alertas'); }
    finally { setAlertsLoading(false); }
  }, [supabase, profile?.is_platform_master, tenantId, segmentRpcParams]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  useEffect(() => { setDrillDay(null); setChartHoverIdx(null); setRejectReasonCode(null); setRejectExamples([]); setRejectExamplesError(null); }, [startStr, endStr, tenantId, segmentRpcParams]);

  const loadRejectExamples = useCallback(async (code) => {
    if (!supabase || !profile?.is_platform_master || !code) return;
    setRejectExamples([]); setRejectExamplesLoading(true); setRejectExamplesError(null);
    try {
      const { data: rows, error: rpcErr } = await supabase.rpc('admin_rejection_examples', { p_start: startStr, p_end: endStr, p_tenant_id: tenantId || null, p_reason_code: code, p_limit: 15, ...segmentRpcParams });
      if (rpcErr) { setRejectExamples([]); setRejectExamplesError(rpcErr.message ?? 'Falha ao carregar exemplos'); return; }
      setRejectExamples(Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? Object.values(rows) : []);
    } catch (err) { setRejectExamples([]); setRejectExamplesError(err?.message ?? 'Falha ao carregar exemplos'); }
    finally { setRejectExamplesLoading(false); }
  }, [supabase, profile?.is_platform_master, startStr, endStr, tenantId, segmentRpcParams]);

  const onPickRejectionReason = (code) => {
    if (rejectReasonCode === code) { setRejectReasonCode(null); setRejectExamples([]); setRejectExamplesError(null); return; }
    setRejectReasonCode(code);
    loadRejectExamples(code);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (rejectReasonCode) { setRejectReasonCode(null); setRejectExamples([]); setRejectExamplesError(null); } else { setDrillDay(null); } } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rejectReasonCode]);

  const tenantExportLabel = useMemo(() => { if (!tenantId) return 'todas'; const t = tenants.find((x) => x.id === tenantId); return t?.slug ?? t?.name ?? tenantId.slice(0, 8); }, [tenantId, tenants]);
  const regionExportLabel = useMemo(() => String(regionFilter ?? '').trim() || 'todas', [regionFilter]);
  const userTypeExportLabel = useMemo(() => (userType === 'all' ? 'todos' : userType), [userType]);
  const planExportLabel = useMemo(() => (planFilter === 'all' ? 'todos' : planFilter === 'free' ? 'gratuito' : planFilter === 'paid' ? 'pago' : planFilter), [planFilter]);
  const csvSectionCount = useMemo(() => Object.values(csvSections).filter(Boolean).length, [csvSections]);

  const exportCsv = () => {
    if (!data || csvSectionCount === 0) return;
    const filterLines = buildEngagementFilterLines({ tenantLabel: tenantExportLabel, regionLabel: regionExportLabel, userTypeLabel: userTypeExportLabel, planLabel: planExportLabel });
    const csv = buildCsv(data, csvSections, filterLines);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildEngagementExportFilename(startStr, endStr, { tenantSlug: tenantExportLabel, regionPart: regionExportLabel === 'todas' ? '' : `reg-${regionExportLabel}`, userTypePart: `tipo-${userTypeExportLabel}`, planPart: `plano-${planExportLabel}` });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!profile?.is_platform_master) return null;

  const summary = data?.summary ?? {};
  const prevSummary = prevData?.summary ?? {};
  const byDay = Array.isArray(data?.series?.by_day) ? data.series.by_day : [];
  const topReasons = Array.isArray(data?.top_rejection_reasons) ? data.top_rejection_reasons : [];
  const rejectionBreakdown = data?.rejection_breakdown;
  const rejectionTotalKnown = typeof rejectionBreakdown?.total_rejected === 'number' ? rejectionBreakdown.total_rejected : null;
  let rejectionRanking = Array.isArray(rejectionBreakdown?.reasons) ? rejectionBreakdown.reasons : [];
  if (rejectionRanking.length === 0 && topReasons.length > 0) {
    const t = topReasons.reduce((acc, r) => acc + (Number(r.count) || 0), 0);
    rejectionRanking = topReasons.map((r, i) => ({ rank: i + 1, code: r.code, count: r.count, pct: t > 0 ? (Number(r.count) || 0) / t : null }));
  }

  const approvalRate = typeof summary?.rejection_rate === 'number' && Number.isFinite(summary.rejection_rate) ? Math.max(0, Math.min(1, 1 - summary.rejection_rate)) : null;
  const prevApprovalRate = typeof prevSummary?.rejection_rate === 'number' && Number.isFinite(prevSummary.rejection_rate) ? Math.max(0, Math.min(1, 1 - prevSummary.rejection_rate)) : null;

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
  const toneMod = summary.avg_moderation_hours != null ? toneModerationHours(summary.avg_moderation_hours) : 'neutral';
  const toneRej = toneLowerIsBetter(summary.rejection_rate, 0.08, 0.22);
  const toneAppr = toneHigherIsBetter(approvalRate, 0.85, 0.7);

  const engagementInsights = data ? buildEngagementInsights({ rejectionRanking, rejectionRate: summary.rejection_rate, moderatedPhotoCount: summary.moderated_photo_count, dCheckins, tonePhoto, toneMod, toneRej, approvalRate }) : [];

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Engajamento</h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">Voltar</button>
      </div>

      <p className="text-xs text-zinc-500">
        KPIs por período, tenant e segmentação (US-ADM-14). Datas derivadas de horários usam{' '}
        <span className="text-zinc-400">America/São Paulo</span>; séries de check-in usam{' '}
        <span className="text-zinc-400">checkin_local_date</span>.
      </p>

      <EngagementFilters
        tenants={tenants} tenantId={tenantId} onTenantId={setTenantId}
        regionFilter={regionFilter} onRegionFilter={setRegionFilter} regionOptions={regionOptions}
        userType={userType} onUserType={setUserType}
        planFilter={planFilter} onPlanFilter={setPlanFilter}
        preset={preset} onPreset={setPreset}
        useCustom={useCustom} onUseCustom={setUseCustom}
        customStart={customStart} onCustomStart={setCustomStart}
        customEnd={customEnd} onCustomEnd={setCustomEnd}
        loading={loading} hasData={!!data}
        csvSections={csvSections} onToggleCsvSection={(key) => setCsvSections((p) => ({ ...p, [key]: !p[key] }))} onSelectAllCsvSections={() => setCsvSections({ ...DEFAULT_CSV_SECTIONS })} csvSectionCount={csvSectionCount}
        csvOptionsOpen={csvOptionsOpen} onToggleCsvOptions={() => setCsvOptionsOpen((o) => !o)}
        onRefresh={() => { loadMetrics(); loadAlerts(); }} onExportCsv={exportCsv}
      />

      <EngagementAlerts alerts={alerts} alertsLoading={alertsLoading} alertsError={alertsError} onReload={loadAlerts} />

      {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
      {loading && !data ? <EngagementLoadingSkeleton /> : null}

      {data ? (
        <>
          <EngagementKpiGrid
            summary={summary}
            toneCheckins={toneCheckins} toneDau={toneDau} toneNew={toneNew} tonePhoto={tonePhoto} toneMod={toneMod} toneRej={toneRej} toneAppr={toneAppr}
            dCheckins={dCheckins} dDau={dDau} dNew={dNew} dPhoto={dPhoto} dModH={dModH} dRej={dRej} dAppr={dAppr}
            approvalRate={approvalRate}
          />

          <EngagementInsightsCard insights={engagementInsights} />

          <EngagementCharts byDay={byDay} chartHoverIdx={chartHoverIdx} onChartHoverIdx={setChartHoverIdx} drillDay={drillDay} onDrillDay={setDrillDay} />

          <RejectionAnalysis
            rejectionRanking={rejectionRanking} rejectionTotalKnown={rejectionTotalKnown}
            rejectReasonCode={rejectReasonCode} onPickRejectionReason={onPickRejectionReason}
            rejectExamples={rejectExamples} rejectExamplesLoading={rejectExamplesLoading} rejectExamplesError={rejectExamplesError}
          />
        </>
      ) : null}
    </div>
  );
}
