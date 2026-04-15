import { Button } from '../../ui/Button.jsx';
import { Card } from '../../ui/Card.jsx';
import {
  addDays, toISODate,
  CSV_SECTION_LABELS, DEFAULT_CSV_SECTIONS
} from './engagement-helpers.jsx';

export function EngagementFilters({
  tenants, tenantId, onTenantId,
  regionFilter, onRegionFilter, regionOptions,
  userType, onUserType,
  planFilter, onPlanFilter,
  preset, onPreset,
  useCustom, onUseCustom,
  customStart, onCustomStart,
  customEnd, onCustomEnd,
  loading, hasData,
  csvSections, onToggleCsvSection, onSelectAllCsvSections, csvSectionCount,
  csvOptionsOpen, onToggleCsvOptions,
  onRefresh, onExportCsv
}) {
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase font-black text-zinc-500">Academia (tenant)</label>
          <select
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            value={tenantId}
            onChange={(e) => onTenantId(e.target.value)}
          >
            <option value="">Todas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase font-black text-zinc-500">Região (tenant)</label>
          <select
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-50"
            value={regionFilter}
            onChange={(e) => onRegionFilter(e.target.value)}
            disabled={regionOptions.length === 0}
            title={regionOptions.length === 0 ? 'Nenhuma região cadastrada em tenants.region; defina no banco para habilitar o filtro.' : undefined}
          >
            <option value="">Todas</option>
            {regionOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {regionOptions.length === 0 ? (
            <p className="text-[9px] text-zinc-600 leading-snug">
              Coluna <span className="font-mono text-zinc-500">tenants.region</span> vazia — preencha no Supabase para filtrar por região.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase font-black text-zinc-500">Tipo de usuário</label>
          <select
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            value={userType}
            onChange={(e) => onUserType(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="free">Free (não Pro)</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase font-black text-zinc-500">Plano (cobrança)</label>
          <select
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            value={planFilter}
            onChange={(e) => onPlanFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="free">Gratuito (sem assinatura)</option>
            <option value="paid">Pago (Pro ou assinatura)</option>
          </select>
          <p className="text-[9px] text-zinc-600 leading-snug">
            Pago considera <span className="font-mono text-zinc-500">is_pro</span> ou{' '}
            <span className="font-mono text-zinc-500">mp_payment_id</span> preenchido.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={useCustom}
            onChange={(e) => {
              const on = e.target.checked;
              onUseCustom(on);
              if (on) {
                const now = new Date();
                const endD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                onCustomEnd(toISODate(endD));
                onCustomStart(toISODate(addDays(endD, -29)));
              }
            }}
            className="rounded border-zinc-600"
          />
          Datas customizadas
        </label>
      </div>

      {!useCustom ? (
        <div className="flex flex-wrap gap-2">
          {[
            { id: '7', label: '7 dias' },
            { id: '30', label: '30 dias' },
            { id: '90', label: '90 dias' }
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p.id)}
              className={`text-xs px-3 py-2 rounded-xl border ${
                preset === p.id
                  ? 'border-green-500/60 bg-green-500/10 text-green-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase text-zinc-500 block mb-1">Início</label>
            <input type="date" value={customStart} onChange={(e) => onCustomStart(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase text-zinc-500 block mb-1">Fim</label>
            <input type="date" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-sm" />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" variant="secondary" className="text-xs py-2" onClick={onRefresh} disabled={loading}>
          Atualizar
        </Button>
        <Button type="button" variant="secondary" className="text-xs py-2" onClick={onToggleCsvOptions} disabled={!hasData || loading} aria-expanded={csvOptionsOpen}>
          Colunas do CSV
        </Button>
        <Button type="button" className="text-xs py-2" onClick={onExportCsv} disabled={!hasData || loading || csvSectionCount === 0}>
          Exportar CSV
        </Button>
      </div>

      {csvOptionsOpen && hasData ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-3" role="region" aria-label="Opções de exportação CSV">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] uppercase font-black text-zinc-500">Incluir no arquivo CSV</p>
            <button type="button" className="text-[10px] text-green-500 hover:text-green-400" onClick={onSelectAllCsvSections}>
              Marcar todas
            </button>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CSV_SECTION_LABELS.map(({ key, label }) => (
              <li key={key}>
                <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={!!csvSections[key]} onChange={() => onToggleCsvSection(key)} className="rounded border-zinc-600 mt-0.5 shrink-0" />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-[9px] text-zinc-500 leading-snug">
            O arquivo usa os <span className="text-zinc-400">mesmos filtros e período</span> do painel.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
