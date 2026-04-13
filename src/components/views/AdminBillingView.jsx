import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Plus, Pencil, Archive, X, CreditCard, Users, TrendingDown,
  DollarSign, Pause, Play, RefreshCw, ArrowUpDown, Search, Loader2, Check,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

const SUB_STATUS_LABELS = {
  active: 'Ativo',
  trialing: 'Trial',
  past_due: 'Pendente',
  canceled: 'Cancelado',
  paused: 'Pausado',
  unpaid: 'Não pago',
  incomplete: 'Incompleto'
};

const SUB_STATUS_COLORS = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  trialing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  past_due: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  canceled: 'bg-red-500/20 text-red-400 border-red-500/30',
  paused: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  unpaid: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  incomplete: 'bg-zinc-600/20 text-zinc-500 border-zinc-600/30'
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${SUB_STATUS_COLORS[status] ?? SUB_STATUS_COLORS.incomplete}`}>
      {SUB_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatCurrency(cents, currency = 'brl') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(cents / 100);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function intervalLabel(interval, count) {
  if (interval === 'year') return count === 1 ? 'Anual' : `A cada ${count} anos`;
  if (count === 1) return 'Mensal';
  return `A cada ${count} meses`;
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function AdminBillingView({ onBack }) {
  const { supabase, profile, session, loading: authLoading } = useAuth();
  const edgeReady = useMemo(
    () => Boolean(supabase && profile?.is_platform_master && !authLoading && session?.access_token),
    [supabase, profile?.is_platform_master, authLoading, session?.access_token]
  );

  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const [subView, setSubView] = useState('list');
  const [editingPlan, setEditingPlan] = useState(null);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterTenant, setFilterTenant] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const [confirmAction, setConfirmAction] = useState(null);

  const defaultForm = {
    name: '',
    description: '',
    price_amount: '',
    currency: 'brl',
    interval: 'month',
    interval_count: 1,
    features: [''],
    limits: '{}',
    sort_order: 0
  };
  const [formData, setFormData] = useState(defaultForm);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // -------------------------------------------------------------------------
  // Loaders
  // -------------------------------------------------------------------------
  const loadPlans = useCallback(async () => {
    if (!edgeReady) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await invokeEdge('admin-billing', supabase, {
      method: 'GET',
      searchParams: { action: 'list-plans' }
    });
    if (err) setError(err.message);
    else if (data?.error) setError(data.error);
    else setPlans(data?.plans ?? []);
    setLoading(false);
  }, [edgeReady, supabase]);

  const loadSubscriptions = useCallback(async () => {
    if (!edgeReady) return;
    setLoading(true);
    setError(null);
    const searchParams = { action: 'list-subscriptions', limit: 100 };
    if (filterStatus) searchParams.status = filterStatus;
    if (filterTenant) searchParams.tenant_id = filterTenant;
    const { data, error: err } = await invokeEdge('admin-billing', supabase, {
      method: 'GET',
      searchParams
    });
    if (err) setError(err.message);
    else if (data?.error) setError(data.error);
    else setSubscriptions(data?.subscriptions ?? []);
    setLoading(false);
  }, [edgeReady, supabase, filterStatus, filterTenant]);

  const loadMetrics = useCallback(async () => {
    if (!edgeReady) return;
    const { data } = await invokeEdge('admin-billing', supabase, {
      method: 'GET',
      searchParams: { action: 'metrics' }
    });
    if (data?.metrics) setMetrics(data.metrics);
  }, [edgeReady, supabase]);

  const loadTenants = useCallback(async () => {
    if (!edgeReady) return;
    const { data } = await invokeEdge('admin-tenants', supabase, { method: 'GET' });
    if (data?.tenants) setTenants(data.tenants);
  }, [edgeReady, supabase]);

  useEffect(() => {
    loadMetrics();
    loadTenants();
  }, [loadMetrics, loadTenants]);

  useEffect(() => {
    if (tab === 'plans' && subView === 'list') loadPlans();
    if (tab === 'subscriptions') loadSubscriptions();
  }, [tab, subView, loadPlans, loadSubscriptions]);

  // -------------------------------------------------------------------------
  // Plan CRUD
  // -------------------------------------------------------------------------
  const openCreatePlan = () => {
    setEditingPlan(null);
    setFormData(defaultForm);
    setSubView('form');
    setError(null);
  };

  const openEditPlan = (plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      price_amount: String(plan.price_amount),
      currency: plan.currency,
      interval: plan.interval,
      interval_count: plan.interval_count,
      features: plan.features?.length ? plan.features : [''],
      limits: JSON.stringify(plan.limits || {}, null, 2),
      sort_order: plan.sort_order ?? 0
    });
    setSubView('form');
    setError(null);
  };

  const handleSavePlan = async () => {
    if (!edgeReady) return;
    setBusy(true);
    setError(null);

    const features = formData.features.map(f => f.trim()).filter(Boolean);
    let limits = {};
    try { limits = JSON.parse(formData.limits || '{}'); } catch { /* keep empty */ }

    if (editingPlan) {
      const body = {
        plan_id: editingPlan.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price_amount: Number(formData.price_amount),
        currency: formData.currency,
        interval: formData.interval,
        interval_count: Number(formData.interval_count),
        features,
        limits,
        sort_order: Number(formData.sort_order)
      };
      const { data, error: err } = await invokeEdge('admin-billing', supabase, {
        method: 'PATCH',
        searchParams: { action: 'update-plan' },
        body
      });
      setBusy(false);
      if (err) { setError(err.message); return; }
      if (data?.error) { setError(data.error); return; }
      showToast('Plano atualizado');
    } else {
      const body = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price_amount: Number(formData.price_amount),
        currency: formData.currency,
        interval: formData.interval,
        interval_count: Number(formData.interval_count),
        features,
        limits,
        sort_order: Number(formData.sort_order)
      };
      const { data, error: err } = await invokeEdge('admin-billing', supabase, {
        method: 'POST',
        searchParams: { action: 'create-plan' },
        body
      });
      setBusy(false);
      if (err) { setError(err.message); return; }
      if (data?.error) { setError(data.error); return; }
      showToast('Plano criado');
    }
    setSubView('list');
    setEditingPlan(null);
  };

  const handleArchivePlan = async (plan) => {
    if (!edgeReady) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await invokeEdge('admin-billing', supabase, {
      method: 'DELETE',
      searchParams: { action: 'archive-plan' },
      body: { plan_id: plan.id }
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (data?.error) { setError(data.error); return; }
    showToast('Plano arquivado');
    loadPlans();
  };

  const handleReactivatePlan = async (plan) => {
    if (!edgeReady) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await invokeEdge('admin-billing', supabase, {
      method: 'PATCH',
      searchParams: { action: 'update-plan' },
      body: { plan_id: plan.id, is_active: true }
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (data?.error) { setError(data.error); return; }
    showToast('Plano reativado');
    loadPlans();
  };

  // -------------------------------------------------------------------------
  // Subscription actions
  // -------------------------------------------------------------------------
  const executeConfirmAction = async () => {
    if (!confirmAction || !edgeReady) return;
    setBusy(true);
    setError(null);
    const { actionType, sub } = confirmAction;

    let result;
    if (actionType === 'cancel') {
      result = await invokeEdge('admin-billing', supabase, {
        method: 'POST',
        searchParams: { action: 'cancel-subscription' },
        body: { subscription_id: sub.id, immediate: false }
      });
    } else if (actionType === 'cancel-now') {
      result = await invokeEdge('admin-billing', supabase, {
        method: 'POST',
        searchParams: { action: 'cancel-subscription' },
        body: { subscription_id: sub.id, immediate: true }
      });
    } else if (actionType === 'pause') {
      result = await invokeEdge('admin-billing', supabase, {
        method: 'POST',
        searchParams: { action: 'pause-subscription' },
        body: { subscription_id: sub.id }
      });
    } else if (actionType === 'resume') {
      result = await invokeEdge('admin-billing', supabase, {
        method: 'POST',
        searchParams: { action: 'resume-subscription' },
        body: { subscription_id: sub.id }
      });
    }

    setBusy(false);
    setConfirmAction(null);

    if (result?.error) { setError(result.error.message); return; }
    if (result?.data?.error) { setError(result.data.error); return; }

    const labels = { cancel: 'Cancelamento agendado', 'cancel-now': 'Assinatura cancelada', pause: 'Assinatura pausada', resume: 'Assinatura resumida' };
    showToast(labels[actionType] || 'Ação realizada');
    loadSubscriptions();
    loadMetrics();
  };

  const handleChangePlan = async (sub, newPriceId) => {
    if (!edgeReady) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await invokeEdge('admin-billing', supabase, {
      method: 'PATCH',
      searchParams: { action: 'change-plan' },
      body: { subscription_id: sub.id, new_price_id: newPriceId }
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (data?.error) { setError(data.error); return; }
    showToast(`Plano alterado para ${data?.new_plan ?? 'novo plano'}`);
    loadSubscriptions();
  };

  // -------------------------------------------------------------------------
  // Feature list helpers
  // -------------------------------------------------------------------------
  const addFeature = () => setFormData(p => ({ ...p, features: [...p.features, ''] }));
  const removeFeature = (idx) => setFormData(p => ({
    ...p,
    features: p.features.filter((_, i) => i !== idx)
  }));
  const updateFeature = (idx, val) => setFormData(p => ({
    ...p,
    features: p.features.map((f, i) => i === idx ? val : f)
  }));

  // -------------------------------------------------------------------------
  // Filtered subscriptions
  // -------------------------------------------------------------------------
  const filteredSubs = useMemo(() => {
    if (!filterSearch.trim()) return subscriptions;
    const q = filterSearch.toLowerCase();
    return subscriptions.filter(s =>
      (s.user_display_name || '').toLowerCase().includes(q) ||
      (s.user_email || '').toLowerCase().includes(q) ||
      (s.plan_name || '').toLowerCase().includes(q)
    );
  }, [subscriptions, filterSearch]);

  if (!profile?.is_platform_master) return null;

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="space-y-6 pb-24 animate-in-fade">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">
          Admin · Assinaturas
        </h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="flex flex-col items-center py-3 border-green-500/20">
            <CreditCard className="w-5 h-5 text-green-500 mb-1" />
            <span className="text-lg font-black tabular-nums">{metrics.active_subscriptions ?? 0}</span>
            <span className="text-[10px] text-zinc-500 uppercase">Ativos</span>
          </Card>
          <Card className="flex flex-col items-center py-3 border-emerald-500/20">
            <DollarSign className="w-5 h-5 text-emerald-400 mb-1" />
            <span className="text-lg font-black tabular-nums">{formatCurrency(metrics.mrr_cents ?? 0)}</span>
            <span className="text-[10px] text-zinc-500 uppercase">MRR</span>
          </Card>
          <Card className="flex flex-col items-center py-3 border-yellow-500/20">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mb-1" />
            <span className="text-lg font-black tabular-nums">{metrics.past_due_subscriptions ?? 0}</span>
            <span className="text-[10px] text-zinc-500 uppercase">Pendentes</span>
          </Card>
          <Card className="flex flex-col items-center py-3 border-red-500/20">
            <TrendingDown className="w-5 h-5 text-red-400 mb-1" />
            <span className="text-lg font-black tabular-nums">{metrics.canceled_last_30d ?? 0}</span>
            <span className="text-[10px] text-zinc-500 uppercase">Churn 30d</span>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'plans', label: 'Planos' },
          { key: 'subscriptions', label: 'Assinaturas' }
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setSubView('list'); setError(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              tab === t.key
                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">{error}</p>
      )}

      {/* ================================================================= */}
      {/* PLANS TAB */}
      {/* ================================================================= */}
      {tab === 'plans' && subView === 'list' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-zinc-500">{plans.length} plano(s) cadastrado(s)</p>
            <Button onClick={openCreatePlan} className="text-sm py-2">
              <Plus className="w-4 h-4" />
              Novo Plano
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <Card className="text-center py-10 text-zinc-500">
              Nenhum plano cadastrado. Crie o primeiro plano para começar.
            </Card>
          ) : (
            <div className="space-y-3">
              {plans.map(plan => (
                <Card
                  key={plan.id}
                  className={`space-y-3 ${!plan.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-white truncate">{plan.name}</h4>
                        {!plan.is_active && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-zinc-700/30 text-zinc-400 border-zinc-600">
                            Inativo
                          </span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="text-xs text-zinc-500 line-clamp-2">{plan.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-green-400 tabular-nums">
                        {formatCurrency(plan.price_amount, plan.currency)}
                      </p>
                      <p className="text-[10px] text-zinc-500 uppercase">
                        {intervalLabel(plan.interval, plan.interval_count)}
                      </p>
                    </div>
                  </div>

                  {plan.features?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.features.map((f, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openEditPlan(plan)}
                      disabled={busy}
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    {plan.is_active ? (
                      <button
                        type="button"
                        onClick={() => handleArchivePlan(plan)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        <Archive className="w-3.5 h-3.5" /> Arquivar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivatePlan(plan)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-green-400 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Reativar
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* PLAN FORM */}
      {/* ================================================================= */}
      {tab === 'plans' && subView === 'form' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setSubView('list'); setEditingPlan(null); }}>
              <ChevronLeft className="w-5 h-5 text-zinc-400 hover:text-white" />
            </button>
            <h3 className="font-bold text-white">
              {editingPlan ? 'Editar Plano' : 'Novo Plano'}
            </h3>
          </div>

          <Card className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Nome</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                placeholder="ex: PRO Mensal"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Descrição</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50 min-h-[60px]"
                placeholder="Descrição do plano..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Valor (centavos)</label>
                <input
                  type="number"
                  min="100"
                  value={formData.price_amount}
                  onChange={e => setFormData(p => ({ ...p, price_amount: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                  placeholder="2990"
                />
                {formData.price_amount && Number(formData.price_amount) >= 100 && (
                  <p className="text-[10px] text-zinc-500 mt-1">
                    = {formatCurrency(Number(formData.price_amount), formData.currency)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Moeda</label>
                <select
                  value={formData.currency}
                  onChange={e => setFormData(p => ({ ...p, currency: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                >
                  <option value="brl">BRL</option>
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Intervalo</label>
                <select
                  value={formData.interval}
                  onChange={e => setFormData(p => ({ ...p, interval: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                >
                  <option value="month">Mensal</option>
                  <option value="year">Anual</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">A cada</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={formData.interval_count}
                  onChange={e => setFormData(p => ({ ...p, interval_count: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">
                Features do plano
              </label>
              <div className="space-y-2">
                {formData.features.map((f, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={f}
                      onChange={e => updateFeature(idx, e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
                      placeholder={`Feature ${idx + 1}`}
                    />
                    {formData.features.length > 1 && (
                      <button type="button" onClick={() => removeFeature(idx)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addFeature}
                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar feature
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Limites (JSON)</label>
              <textarea
                value={formData.limits}
                onChange={e => setFormData(p => ({ ...p, limits: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-green-500/50 min-h-[60px]"
                placeholder='{"max_checkins_day": 5}'
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-black text-zinc-500 block mb-1">Ordem de exibição</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={e => setFormData(p => ({ ...p, sort_order: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
              />
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleSavePlan}
              disabled={busy || !formData.name.trim() || !formData.price_amount}
              className="flex-1 py-3"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingPlan ? 'Salvar alterações' : 'Criar plano'}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setSubView('list'); setEditingPlan(null); }}
              disabled={busy}
              className="py-3"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUBSCRIPTIONS TAB */}
      {/* ================================================================= */}
      {tab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
            >
              <option value="">Todos os status</option>
              {Object.entries(SUB_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filterTenant}
              onChange={e => setFilterTenant(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
            >
              <option value="">Todos os tenants</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name || t.slug}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="Buscar usuário/plano..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
              />
            </div>
          </div>

          <p className="text-xs text-zinc-500">{filteredSubs.length} assinatura(s)</p>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          ) : filteredSubs.length === 0 ? (
            <Card className="text-center py-10 text-zinc-500">
              Nenhuma assinatura encontrada.
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredSubs.map(sub => (
                <SubscriptionCard
                  key={sub.id}
                  sub={sub}
                  plans={plans}
                  busy={busy}
                  onCancel={() => setConfirmAction({ actionType: 'cancel', sub })}
                  onCancelNow={() => setConfirmAction({ actionType: 'cancel-now', sub })}
                  onPause={() => setConfirmAction({ actionType: 'pause', sub })}
                  onResume={() => setConfirmAction({ actionType: 'resume', sub })}
                  onChangePlan={(priceId) => handleChangePlan(sub, priceId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* CONFIRM MODAL */}
      {/* ================================================================= */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
          <Card className="relative z-10 max-w-sm w-full space-y-4">
            <h4 className="font-bold text-white">Confirmar ação</h4>
            <p className="text-sm text-zinc-400">
              {confirmAction.actionType === 'cancel' && 'A assinatura será cancelada ao fim do período atual. O usuário mantém acesso até lá.'}
              {confirmAction.actionType === 'cancel-now' && 'A assinatura será cancelada imediatamente. O acesso PRO será removido agora.'}
              {confirmAction.actionType === 'pause' && 'A assinatura será pausada. O acesso PRO será removido até que seja retomada.'}
              {confirmAction.actionType === 'resume' && 'A assinatura será retomada e o acesso PRO restaurado.'}
            </p>
            <p className="text-xs text-zinc-500">
              Usuário: {confirmAction.sub.user_display_name || confirmAction.sub.user_email || '—'}
            </p>
            <div className="flex gap-3">
              <Button
                onClick={executeConfirmAction}
                disabled={busy}
                variant={confirmAction.actionType.includes('cancel') ? 'secondary' : 'primary'}
                className="flex-1 py-2.5"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
              </Button>
              <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={busy} className="py-2.5">
                Voltar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full font-bold shadow-xl flex items-center gap-2 animate-in-toast ${
          toast.type === 'error'
            ? 'bg-red-500 text-white shadow-red-500/20'
            : 'bg-green-500 text-black shadow-green-500/20'
        }`}>
          <Check size={18} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription Card sub-component
// ---------------------------------------------------------------------------
function SubscriptionCard({ sub, plans, busy, onCancel, onCancelNow, onPause, onResume, onChangePlan }) {
  const [showActions, setShowActions] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);

  const activePlans = plans.filter(p => p.is_active && p.stripe_price_id !== sub.stripe_price_id);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm text-white truncate">
            {sub.user_display_name || sub.user_email || 'Usuário'}
          </p>
          {sub.user_email && sub.user_display_name && (
            <p className="text-[11px] text-zinc-500 truncate">{sub.user_email}</p>
          )}
          <p className="text-[11px] text-zinc-600 mt-0.5">
            {sub.tenant_name || '—'}
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <StatusBadge status={sub.status} />
          {sub.cancel_at_period_end && sub.status === 'active' && (
            <p className="text-[10px] text-yellow-400">Cancela ao fim do período</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <div>
          <span className="text-zinc-500">Plano:</span>{' '}
          <span className="text-zinc-300">{sub.plan_name || '—'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Valor:</span>{' '}
          <span className="text-zinc-300">{sub.plan_price_amount ? formatCurrency(sub.plan_price_amount) : '—'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Início período:</span>{' '}
          <span className="text-zinc-300">{formatDate(sub.current_period_start)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Fim período:</span>{' '}
          <span className="text-zinc-300">{formatDate(sub.current_period_end)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Desde:</span>{' '}
          <span className="text-zinc-300">{formatDate(sub.created_at)}</span>
        </div>
        {sub.canceled_at && (
          <div>
            <span className="text-zinc-500">Cancelado em:</span>{' '}
            <span className="text-zinc-300">{formatDate(sub.canceled_at)}</span>
          </div>
        )}
      </div>

      {/* Actions toggle */}
      {sub.status !== 'canceled' && (
        <div>
          <button
            type="button"
            onClick={() => setShowActions(a => !a)}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
          >
            <ArrowUpDown className="w-3 h-3" />
            {showActions ? 'Ocultar ações' : 'Ações'}
          </button>

          {showActions && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(sub.status === 'active' || sub.status === 'trialing') && !sub.cancel_at_period_end && (
                <>
                  <button type="button" onClick={onCancel} disabled={busy}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 disabled:opacity-50">
                    <X className="w-3 h-3" /> Cancelar (fim período)
                  </button>
                  <button type="button" onClick={onCancelNow} disabled={busy}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50">
                    <X className="w-3 h-3" /> Cancelar agora
                  </button>
                  <button type="button" onClick={onPause} disabled={busy}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/20 disabled:opacity-50">
                    <Pause className="w-3 h-3" /> Pausar
                  </button>
                </>
              )}

              {sub.status === 'paused' && (
                <button type="button" onClick={onResume} disabled={busy}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50">
                  <Play className="w-3 h-3" /> Resumir
                </button>
              )}

              {(sub.status === 'active' || sub.status === 'trialing') && activePlans.length > 0 && (
                <div>
                  <button type="button" onClick={() => setChangePlanOpen(o => !o)} disabled={busy}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50">
                    <ArrowUpDown className="w-3 h-3" /> Trocar plano
                  </button>
                  {changePlanOpen && (
                    <div className="mt-2 space-y-1">
                      {activePlans.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { onChangePlan(p.stripe_price_id); setChangePlanOpen(false); }}
                          disabled={busy}
                          className="block w-full text-left text-[11px] px-3 py-1.5 rounded-lg bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-50"
                        >
                          {p.name} — {formatCurrency(p.price_amount, p.currency)}/{p.interval === 'year' ? 'ano' : 'mês'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
