import { Card } from '../../ui/Card.jsx';
import { fmtPct, fmtNum, kpiCardClass, DeltaInline } from './engagement-helpers.jsx';

export function EngagementKpiGrid({
  summary, toneCheckins, toneDau, toneNew, tonePhoto, toneMod, toneRej, toneAppr,
  dCheckins, dDau, dNew, dPhoto, dModH, dRej, dAppr,
  approvalRate
}) {
  return (
    <>
      <p className="text-[10px] text-zinc-500 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-zinc-400">Indicadores:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" aria-hidden />
          Verde = bom
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" aria-hidden />
          Amarelo = atenção
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]" aria-hidden />
          Vermelho = problema
        </span>
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Card className={kpiCardClass(toneCheckins)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">Check-ins / dia</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {fmtNum(summary.checkins_per_day, 2)}
              <span className="text-sm font-semibold text-zinc-400 font-sans"> check-ins/dia</span>
            </span>
            <DeltaInline delta={dCheckins} />
          </p>
        </Card>
        <Card className={kpiCardClass(toneDau)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">DAU médio</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {fmtNum(summary.dau_avg, 2)}
              <span className="text-sm font-semibold text-zinc-400 font-sans"> usuários ativos/dia</span>
            </span>
            <DeltaInline delta={dDau} />
          </p>
        </Card>
        <Card className={kpiCardClass(toneNew)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">Novos cadastros</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {fmtNum(summary.new_profiles ?? 0, 0)}
              <span className="text-sm font-semibold text-zinc-400 font-sans"> novos no período</span>
            </span>
            <DeltaInline delta={dNew} />
          </p>
        </Card>
        <Card className={kpiCardClass(tonePhoto)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">Taxa com foto</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {fmtPct(summary.photo_rate)}
              <span className="text-sm font-semibold text-zinc-400 font-sans"> com foto</span>
            </span>
            <DeltaInline delta={dPhoto} />
          </p>
        </Card>
        <Card className={kpiCardClass(toneMod)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">Tempo médio até moderação</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {summary.avg_moderation_hours != null ? (
                <>
                  {fmtNum(summary.avg_moderation_hours, 2)}
                  <span className="text-sm font-semibold text-zinc-400 font-sans"> h até moderação</span>
                </>
              ) : '—'}
            </span>
            {summary.avg_moderation_hours != null ? (
              <DeltaInline delta={dModH} invert />
            ) : (
              <span className="text-sm font-semibold text-zinc-600">(—)</span>
            )}
          </p>
          <p className="text-[9px] text-zinc-600 mt-1">Fotos moderadas no período (por data da decisão)</p>
        </Card>
        <Card className={kpiCardClass(toneRej)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">Taxa de rejeição</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {fmtPct(summary.rejection_rate)}
              <span className="text-sm font-semibold text-zinc-400 font-sans"> rejeição</span>
            </span>
            <DeltaInline delta={dRej} invert />
          </p>
          <p className="text-[9px] text-zinc-600 mt-1">
            {summary.rejected_moderation_count ?? 0} / {summary.moderated_photo_count ?? 0} moderações
          </p>
        </Card>
        <Card className={kpiCardClass(toneAppr)}>
          <p className="text-[10px] uppercase font-black text-zinc-500">Taxa de aprovação</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-black text-white tabular-nums">
              {fmtPct(approvalRate)}
              <span className="text-sm font-semibold text-zinc-400 font-sans"> aprovação</span>
            </span>
            <DeltaInline delta={dAppr} />
          </p>
          <p className="text-[9px] text-zinc-600 mt-1">Aprovação = 1 − rejeição (somente fotos moderadas)</p>
        </Card>
      </div>
    </>
  );
}
