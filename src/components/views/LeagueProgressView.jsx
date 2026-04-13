import { Shield, X, ChevronRight } from 'lucide-react';
import { getAllLeagues, getLeagueConfig, getNextLeague } from '../ui/LeagueBadge.jsx';

export function LeagueProgressView({ currentLeague = 'bronze', currentXp = 0, onClose }) {
  const leagues = getAllLeagues();
  const config = getLeagueConfig(currentLeague);
  const next = getNextLeague(currentLeague);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in-fade"
        onClick={onClose}
      />
      <div className="relative max-w-lg w-full mx-auto bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-5 pb-8 animate-in-slide-up max-h-[80vh] overflow-y-auto">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">
            Progressão de Liga
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-center mb-6 space-y-2">
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center border-2"
            style={{ borderColor: config.color, backgroundColor: config.color + '15' }}
          >
            <Shield size={32} style={{ color: config.color }} className="fill-current opacity-80" />
          </div>
          <h4 className="text-xl font-black" style={{ color: config.color }}>{config.name}</h4>
          <p className="text-sm text-zinc-400">{currentXp.toLocaleString('pt-BR')} XP acumulado</p>
          {next && (
            <p className="text-xs text-zinc-500">
              Faltam <span className="font-bold text-white">{(next.minXp - currentXp).toLocaleString('pt-BR')} XP</span> para {next.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          {leagues.map((lg, idx) => {
            const isCurrent = lg.slug === currentLeague;
            const isUnlocked = currentXp >= lg.minXp;
            const nextLg = idx < leagues.length - 1 ? leagues[idx + 1] : null;
            const progressInBand = nextLg
              ? Math.min(100, Math.max(0, ((currentXp - lg.minXp) / (nextLg.minXp - lg.minXp)) * 100))
              : (isUnlocked ? 100 : 0);

            return (
              <div key={lg.slug}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'ring-2 bg-zinc-800/50'
                      : isUnlocked
                        ? 'bg-zinc-800/30 border-zinc-700/50'
                        : 'bg-zinc-900/50 border-zinc-800/30 opacity-50'
                  }`}
                  style={isCurrent ? { borderColor: lg.color + '60', ringColor: lg.color + '30' } : undefined}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (isUnlocked ? lg.color : '#52525b') + '20' }}
                  >
                    <Shield size={20} style={{ color: isUnlocked ? lg.color : '#52525b' }} className="fill-current opacity-80" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black ${isUnlocked ? '' : 'text-zinc-600'}`} style={isUnlocked ? { color: lg.color } : undefined}>
                        {lg.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 tabular-nums">
                        {lg.minXp.toLocaleString('pt-BR')} XP
                      </span>
                    </div>

                    {isCurrent && nextLg && (
                      <div className="mt-1.5">
                        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progressInBand}%`, backgroundColor: lg.color }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {isCurrent && (
                    <ChevronRight size={16} style={{ color: lg.color }} className="shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
