import { Card } from '../../ui/Card.jsx';
import { EngagementLineBarChart } from './EngagementLineBarChart.jsx';
import { formatDayPtBR } from './engagement-helpers.jsx';

export function EngagementCharts({
  byDay,
  chartHoverIdx, onChartHoverIdx,
  drillDay, onDrillDay
}) {
  const drillIdx = drillDay ? byDay.findIndex((d) => d.day === drillDay) : -1;
  const drillRow = drillIdx >= 0 ? byDay[drillIdx] : null;
  const drillPrevRow = drillIdx > 0 ? byDay[drillIdx - 1] : null;

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-sm font-black text-zinc-300 uppercase">Gráficos interativos</h3>
        <p className="text-[10px] text-zinc-500">
          Passe o mouse para ver o dia · clique para drill-down · <span className="text-zinc-400">Esc</span> fecha o painel
        </p>
      </div>
      <EngagementLineBarChart
        title="Check-ins por dia" data={byDay} valueKey="checkins" valueLabel="Check-ins"
        hoverIdx={chartHoverIdx} onHoverIdx={onChartHoverIdx}
        selectedDay={drillDay} onSelectDay={onDrillDay}
      />
      <EngagementLineBarChart
        title="DAU por dia" data={byDay} valueKey="dau" valueLabel="Usuários ativos"
        hoverIdx={chartHoverIdx} onHoverIdx={onChartHoverIdx}
        selectedDay={drillDay} onSelectDay={onDrillDay}
        lineColor="rgb(96 165 250 / 0.95)" barColor="rgb(96 165 250 / 0.4)"
      />
      <EngagementLineBarChart
        title="Novos cadastros por dia" data={byDay} valueKey="new_profiles" valueLabel="Novos cadastros"
        hoverIdx={chartHoverIdx} onHoverIdx={onChartHoverIdx}
        selectedDay={drillDay} onSelectDay={onDrillDay}
        lineColor="rgb(251 191 36 / 0.95)" barColor="rgb(251 191 36 / 0.38)"
      />
      {drillRow ? (
        <div className="rounded-xl border border-green-500/25 bg-zinc-950/80 p-4 space-y-3" role="region" aria-label="Detalhes do dia selecionado">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase font-black text-zinc-500">Drill-down do dia</p>
              <p className="text-lg font-black text-white">{formatDayPtBR(drillRow.day)}</p>
              <p className="text-[10px] text-zinc-500 font-mono">{drillRow.day}</p>
            </div>
            <button type="button" className="text-xs text-zinc-500 hover:text-green-400 shrink-0" onClick={() => onDrillDay(null)}>
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <p className="text-[10px] text-zinc-500 uppercase font-black">Check-ins</p>
              <p className="text-xl font-black text-white mt-1">{drillRow.checkins ?? 0}</p>
              {drillPrevRow ? <p className="text-[10px] text-zinc-600 mt-1">dia anterior: {drillPrevRow.checkins ?? 0}</p> : null}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <p className="text-[10px] text-zinc-500 uppercase font-black">DAU</p>
              <p className="text-xl font-black text-white mt-1">{drillRow.dau ?? 0}</p>
              {drillPrevRow ? <p className="text-[10px] text-zinc-600 mt-1">dia anterior: {drillPrevRow.dau ?? 0}</p> : null}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <p className="text-[10px] text-zinc-500 uppercase font-black">Novos cadastros</p>
              <p className="text-xl font-black text-white mt-1">{drillRow.new_profiles ?? 0}</p>
              {drillPrevRow ? <p className="text-[10px] text-zinc-600 mt-1">dia anterior: {drillPrevRow.new_profiles ?? 0}</p> : null}
            </div>
          </div>
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Os totais vêm da agregação diária do período (sem lista de check-ins individuais).
          </p>
        </div>
      ) : null}
    </Card>
  );
}
