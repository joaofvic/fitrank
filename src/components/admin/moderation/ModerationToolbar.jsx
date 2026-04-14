import { Button } from '../../ui/Button.jsx';
import { STATUSES } from './moderation-constants.js';

export function ModerationToolbar({
  status, onStatus,
  tenantOptions, tenantId, onTenantId,
  tipo, onTipo,
  search, onSearch,
  sort, onSort,
  from, onFrom,
  to, onTo,
  stats,
  loading, itemCount,
  viewMode, onToggleViewMode,
  shortcutsEnabled, onToggleShortcuts,
  quickOpen, focusIdx,
  onOpenQuick, onRefresh,
  selectedCount
}) {
  return (
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
            onClick={() => onStatus(s.id)}
            className={`text-xs py-2 px-3 ${status === s.id ? '' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
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
            onClick={onToggleViewMode}
            className="text-[10px] font-bold uppercase px-2 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            aria-pressed={viewMode === 'grid'}
            title="Alternar visualização"
          >
            {viewMode === 'grid' ? 'Lista' : 'Grid'}
          </button>
          <button
            type="button"
            onClick={onToggleShortcuts}
            className="text-[10px] font-bold uppercase px-2 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            aria-pressed={shortcutsEnabled}
            title="Atalhos de teclado"
          >
            Atalhos: {shortcutsEnabled ? 'ON' : 'OFF'}
          </button>
          <Button
            type="button"
            disabled={itemCount === 0}
            onClick={() => onOpenQuick(Math.max(0, focusIdx))}
            className="text-xs py-2 px-3 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Abrir modo rápido
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Tenant</span>
          <select value={tenantId} onChange={(e) => onTenantId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white">
            {tenantOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Tipo de treino</span>
          <input value={tipo} onChange={(e) => onTipo(e.target.value)} placeholder="Ex: Superior" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600" />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Buscar usuário</span>
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Nome ou user_id" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600" />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Ordenação</span>
          <select value={sort} onChange={(e) => onSort(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white">
            <option value="oldest">Mais antigos</option>
            <option value="newest">Mais recentes</option>
            <option value="risk">Maior risco</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase font-bold text-zinc-500">De</span>
          <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white" />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Até</span>
          <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {loading ? 'Carregando…' : `${itemCount} itens`}
          {viewMode === 'grid' ? ` · ${selectedCount} selecionados` : ''}
        </p>
        <Button type="button" onClick={onRefresh} className="text-xs py-2 px-3">Atualizar</Button>
      </div>
    </div>
  );
}
