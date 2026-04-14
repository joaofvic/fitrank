import { AlertTriangle, Lightbulb } from 'lucide-react';
import { Card } from '../../ui/Card.jsx';

export function EngagementAlerts({ alerts, alertsLoading, alertsError, onReload }) {
  return (
    <Card className="border-amber-500/20 bg-zinc-950/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" aria-hidden />
          <div>
            <h3 className="text-sm font-black text-zinc-200 uppercase">Alertas inteligentes</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              Últimas <span className="text-zinc-400">24h</span> vs <span className="text-zinc-400">24h anteriores</span>{' '}
              (janelas alinhadas a <span className="text-zinc-400">America/São Paulo</span>; respeitam os filtros de segmentação acima).
            </p>
          </div>
        </div>
        <button type="button" className="text-[10px] text-zinc-500 hover:text-green-400 shrink-0" onClick={onReload} disabled={alertsLoading}>
          {alertsLoading ? '…' : 'Recarregar'}
        </button>
      </div>
      {alertsError ? (
        <p className="text-red-400 text-xs mt-3" role="alert">
          {alertsError}
          <span className="block text-[10px] text-zinc-600 mt-1">
            Aplique a migration <span className="font-mono">admin_engagement_alerts</span> se ainda não estiver no banco.
          </span>
        </p>
      ) : null}
      {alertsLoading && alerts.length === 0 && !alertsError ? (
        <p className="text-xs text-zinc-500 mt-3">Analisando sinais…</p>
      ) : null}
      {!alertsLoading && !alertsError && alerts.length === 0 ? (
        <p className="text-xs text-zinc-500 mt-3">Nenhum alerta no momento — tudo dentro dos limiares.</p>
      ) : null}
      {alerts.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {alerts.map((a, idx) => {
            const crit = a?.severity === 'critical';
            return (
              <li
                key={`${a?.id ?? 'alert'}-${idx}`}
                className={`rounded-xl border px-3 py-2.5 text-sm leading-snug ${
                  crit
                    ? 'border-red-500/40 bg-red-950/25 text-red-100'
                    : 'border-amber-500/30 bg-amber-950/20 text-amber-50'
                }`}
              >
                {a?.message ?? '—'}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

export function EngagementInsightsCard({ insights }) {
  if (insights.length === 0) return null;

  return (
    <Card className="border-violet-500/35 bg-gradient-to-br from-violet-950/40 to-zinc-950/80 ring-1 ring-inset ring-violet-500/20 space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25">
          <Lightbulb className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-black uppercase tracking-tight text-white">Insights</h3>
          <p className="text-[10px] text-zinc-500 leading-snug">
            Gerados automaticamente com base nos KPIs, no período anterior e no breakdown de rejeições (US-ADM-14).
          </p>
        </div>
      </div>
      <ul className="space-y-3" role="list">
        {insights.map((ins) => (
          <li
            key={ins.id}
            role="listitem"
            className={`rounded-xl py-3 pr-3 ${
              ins.severity === 'critical'
                ? 'border-l-[3px] border-red-500 bg-red-950/30 pl-3'
                : ins.severity === 'warning'
                  ? 'border-l-[3px] border-amber-500 bg-amber-950/25 pl-3'
                  : 'border-l-[3px] border-sky-500/90 bg-sky-950/20 pl-3'
            }`}
          >
            <p className="text-sm font-semibold text-zinc-100 leading-snug">{ins.headline}</p>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              <span className="text-amber-200/90 font-semibold">Sugestão: </span>
              {ins.suggestion}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
