import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bug,
  Clock,
  Gauge,
  RefreshCw,
  Users
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { logger } from '../../lib/logger.js';
import { Skeleton } from '../ui/Skeleton.jsx';

function SkeletonBar({ className = '' }) {
  return <Skeleton className={className} />;
}

function DeltaBadge({ current, previous }) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs text-zinc-500">→ 0%</span>;
  const isUp = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

function MetricCard({ label, value, previous, icon: Icon, suffix = '' }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 shrink-0">
        <Icon className="w-5 h-5 text-green-400" />
      </div>
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">
            {value != null ? `${value}${suffix}` : '—'}
          </span>
          <DeltaBadge current={value} previous={previous} />
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ name, count, rate, isLast }) {
  const barWidth = rate != null ? `${rate}%` : '0%';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-zinc-300 truncate">{name}</span>
          <span className="text-sm font-medium text-white">{count ?? 0}</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: barWidth }}
          />
        </div>
        {rate != null && (
          <p className="text-xs text-zinc-500 mt-0.5">{rate}% conversão</p>
        )}
      </div>
      {!isLast && <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />}
    </div>
  );
}

function VitalBadge({ rating }) {
  const colors = {
    good: 'bg-green-500/20 text-green-400',
    'needs-improvement': 'bg-yellow-500/20 text-yellow-400',
    poor: 'bg-red-500/20 text-red-400'
  };
  const labels = { good: 'Bom', 'needs-improvement': 'Regular', poor: 'Ruim' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[rating] ?? colors.poor}`}>
      {labels[rating] ?? rating}
    </span>
  );
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function AdminObservabilityView({ onBack }) {
  const { supabase, profile, session } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    setError(null);

    const { data: result, error: err } = await invokeEdge('admin-observability', supabase, {
      method: 'POST',
      body: { action: 'all' }
    });

    if (err) {
      logger.error('admin-observability', err);
      setError(err.message ?? 'Falha ao carregar dados');
    } else {
      setData(result);
    }
    setLoading(false);
  }, [supabase, session]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (!profile?.is_platform_master) return null;

  const metrics = data?.metrics;
  const funnel = data?.funnel;
  const errors = data?.errors;
  const vitals = data?.vitals;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Observabilidade</h2>
          <p className="text-xs text-zinc-500">Sentry + PostHog · Atualizado em tempo real</p>
        </div>
        <Button
          variant="ghost"
          onClick={fetchAll}
          disabled={loading}
          className="!px-2 !py-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && !data && (
        <Card className="border-red-500/30">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      {/* Card 1: Usuarios Ativos */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-semibold text-white">Usuários Ativos</h3>
        </div>
        {loading && !metrics ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonBar className="h-3 w-12" />
                <SkeletonBar className="h-7 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              label="DAU"
              value={metrics?.dau?.current}
              previous={metrics?.dau?.previous}
              icon={Activity}
            />
            <MetricCard
              label="WAU"
              value={metrics?.wau?.current}
              previous={metrics?.wau?.previous}
              icon={BarChart3}
            />
            <MetricCard
              label="MAU"
              value={metrics?.mau?.current}
              previous={metrics?.mau?.previous}
              icon={Users}
            />
          </div>
        )}
      </Card>

      {/* Card 2: Funnel de Check-in */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Funnel de Check-in</h3>
          <span className="text-xs text-zinc-500 ml-auto">últimos 7 dias</span>
        </div>
        {loading && !funnel ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <SkeletonBar className="h-3 w-24" />
                <SkeletonBar className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : funnel?.error ? (
          <p className="text-xs text-zinc-500">{funnel.error}</p>
        ) : (
          <div className="space-y-3">
            {(funnel?.steps ?? []).map((step, i, arr) => (
              <FunnelStep
                key={step.name}
                name={step.name}
                count={step.count}
                rate={step.conversionRate}
                isLast={i === arr.length - 1}
              />
            ))}
            {(funnel?.steps ?? []).length === 0 && (
              <p className="text-xs text-zinc-500">Sem dados de funnel no período</p>
            )}
          </div>
        )}
      </Card>

      {/* Card 3: Erros Recentes (Sentry) */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-white">Erros Recentes</h3>
          <span className="text-xs text-zinc-500 ml-auto">últimas 24h</span>
        </div>
        {loading && !errors ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <SkeletonBar className="h-3 w-48" />
                <SkeletonBar className="h-2 w-32" />
              </div>
            ))}
          </div>
        ) : errors?.error ? (
          <p className="text-xs text-zinc-500">{errors.error}</p>
        ) : (errors?.issues ?? []).length === 0 ? (
          <div className="flex items-center gap-2 text-green-400">
            <Activity className="w-4 h-4" />
            <p className="text-sm">Nenhum erro nas últimas 24h</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(errors?.issues ?? []).map((issue) => (
              <div
                key={issue.id}
                className="flex items-start gap-3 p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
              >
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${issue.level === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{issue.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{issue.culprit}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-white">{issue.count}x</p>
                  <p className="text-xs text-zinc-500">{timeAgo(issue.lastSeen)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Card 4: Web Vitals */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Web Vitals</h3>
          <span className="text-xs text-zinc-500 ml-auto">média 7 dias</span>
        </div>
        {loading && !vitals ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonBar className="h-3 w-10" />
                <SkeletonBar className="h-6 w-14" />
              </div>
            ))}
          </div>
        ) : vitals?.error ? (
          <p className="text-xs text-zinc-500">{vitals.error}</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {['LCP', 'INP', 'CLS'].map((key) => {
              const v = vitals?.vitals?.[key];
              const unit = key === 'CLS' ? '' : 'ms';
              const display = v ? (key === 'CLS' ? (v.value / 1000).toFixed(2) : v.value) : '—';
              return (
                <div key={key}>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">{key}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-white">{display}{v ? unit : ''}</span>
                  </div>
                  {v && (
                    <div className="mt-1">
                      <VitalBadge rating={v.rating} />
                      <span className="text-xs text-zinc-600 ml-1">{v.samples} amostras</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
