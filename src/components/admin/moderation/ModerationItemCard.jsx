function itemName(it) {
  return it?.profiles?.display_name?.trim() || it?.profiles?.nome?.trim() || 'Atleta';
}

function itemTenant(it) {
  return it?.tenants?.slug || it.tenant_id;
}

export function ModerationGridCard({ item, idx, isSelected, onToggleSelect }) {
  const nome = itemName(item);
  const tenantLabel = itemTenant(item);

  return (
    <button
      type="button"
      onClick={(e) => onToggleSelect(item.id, idx, e.shiftKey)}
      className={`text-left rounded-2xl border overflow-hidden transition-colors ${
        isSelected
          ? 'border-green-500/60 bg-green-500/10'
          : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
      }`}
      title="Clique para selecionar (Shift para intervalo)"
    >
      <div className="relative">
        {item.foto_url ? (
          <img src={item.foto_url} alt="" className="w-full h-40 object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-40 bg-black flex items-center justify-center text-zinc-700 text-xs">Sem foto</div>
        )}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
            isSelected ? 'border-green-500/60 text-green-300 bg-black/50' : 'border-zinc-700 text-zinc-300 bg-black/40'
          }`}>
            {isSelected ? 'Selecionado' : 'Selecionar'}
          </span>
        </div>
      </div>
      <div className="p-3 space-y-1">
        <p className="font-bold text-white truncate">{nome}</p>
        <p className="text-xs text-zinc-500 font-mono truncate">{tenantLabel}</p>
        <p className="text-[11px] text-zinc-500 truncate">{item.tipo_treino} · {item.checkin_local_date}</p>
      </div>
    </button>
  );
}

export function ModerationListCard({ item, status, formatPendingAge, pendingAgeTone, onOpen }) {
  const nome = itemName(item);
  const tenantLabel = itemTenant(item);
  const age = status === 'pending' && item?.created_at ? formatPendingAge(item.created_at) : null;
  const tone = status === 'pending' && item?.created_at ? pendingAgeTone(item.created_at) : 'zinc';

  return (
    <li
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-3 cursor-pointer hover:border-zinc-700"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white truncate">{nome}</p>
          <p className="text-xs text-zinc-500 font-mono truncate">{tenantLabel}</p>
          <p className="text-xs text-zinc-500 mt-1">{item.tipo_treino} · {item.checkin_local_date} · +{item.points_awarded} pts</p>
          {age ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`text-[10px] uppercase font-bold rounded-full px-2 py-1 border ${
                tone === 'red' ? 'border-red-900/60 text-red-300 bg-red-950/30'
                  : tone === 'yellow' ? 'border-yellow-900/60 text-yellow-300 bg-yellow-950/30'
                    : 'border-zinc-800 text-zinc-400 bg-zinc-950/30'
              }`}>
                Pendente há {age}
              </span>
              {typeof item.user_rejections_30d === 'number' ? (
                <span className="text-[10px] uppercase font-bold rounded-full px-2 py-1 border border-zinc-800 text-zinc-400 bg-zinc-950/30">
                  Rejeições 30d: {item.user_rejections_30d}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">
          {item.photo_review_status}
        </span>
      </div>
      {item.foto_url ? (
        <a href={item.foto_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-zinc-800">
          <img src={item.foto_url} alt="" className="w-full h-52 object-cover" loading="lazy" />
        </a>
      ) : null}
    </li>
  );
}
