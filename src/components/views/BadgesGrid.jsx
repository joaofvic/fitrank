import { useState } from 'react';
import {
  Flame, Dumbbell, Zap, Users, Trophy, Lock
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog.jsx';

const ICON_MAP = {
  flame: Flame,
  dumbbell: Dumbbell,
  zap: Zap,
  users: Users,
  trophy: Trophy
};

const CATEGORY_LABELS = {
  streak: 'Ofensiva',
  checkins: 'Check-ins',
  points: 'Pontos',
  social: 'Social',
  special: 'Especial'
};

const CATEGORY_COLORS = {
  streak: { ring: 'ring-orange-500/40', bg: 'bg-orange-500', text: 'text-orange-400', bgLight: 'bg-orange-500/10', border: 'border-orange-500/20' },
  checkins: { ring: 'ring-blue-500/40', bg: 'bg-blue-500', text: 'text-blue-400', bgLight: 'bg-blue-500/10', border: 'border-blue-500/20' },
  points: { ring: 'ring-green-500/40', bg: 'bg-green-500', text: 'text-green-400', bgLight: 'bg-green-500/10', border: 'border-green-500/20' },
  social: { ring: 'ring-purple-500/40', bg: 'bg-purple-500', text: 'text-purple-400', bgLight: 'bg-purple-500/10', border: 'border-purple-500/20' },
  special: { ring: 'ring-yellow-500/40', bg: 'bg-yellow-500', text: 'text-yellow-400', bgLight: 'bg-yellow-500/10', border: 'border-yellow-500/20' }
};

function BadgeProgress({ badge, currentValues }) {
  const current = currentValues?.[badge.category] ?? 0;
  const pct = Math.min(100, Math.round((current / badge.threshold) * 100));
  return (
    <span className="text-[10px] text-zinc-500 tabular-nums">{current}/{badge.threshold}</span>
  );
}

export function BadgesGrid({ badges = [], loading = false, currentValues = {}, isPro = false }) {
  const [selected, setSelected] = useState(null);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (badges.length === 0) return null;

  const grouped = {};
  for (const b of badges) {
    if (!grouped[b.category]) grouped[b.category] = [];
    grouped[b.category].push(b);
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" />
        Conquistas
      </h3>

      <div className="grid grid-cols-4 gap-2">
        {badges.map((b) => {
          const unlocked = Boolean(b.unlocked_at);
          const proLocked = b.is_pro_only && !isPro;
          const colors = CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.special;
          const Icon = ICON_MAP[b.icon] ?? Trophy;

          return (
            <button
              key={b.badge_id}
              type="button"
              onClick={() => setSelected(b)}
              className={`relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-all ${
                unlocked
                  ? `${colors.bgLight} ${colors.border} hover:scale-105`
                  : 'bg-zinc-900/40 border-zinc-800/50 opacity-50 hover:opacity-70'
              }`}
            >
              {proLocked && !unlocked && (
                <Lock className="absolute top-1.5 right-1.5 w-3 h-3 text-yellow-500" />
              )}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                unlocked ? `${colors.bg}/20 ring-2 ${colors.ring}` : 'bg-zinc-800'
              }`}>
                <Icon className={`w-5 h-5 ${unlocked ? colors.text : 'text-zinc-600'}`} />
              </div>
              <span className={`text-[10px] font-bold text-center leading-tight line-clamp-2 ${
                unlocked ? 'text-white' : 'text-zinc-600'
              }`}>
                {b.name}
              </span>
              {!unlocked && (
                <BadgeProgress badge={b} currentValues={currentValues} />
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-xs text-center space-y-4">
          <DialogTitle className="sr-only">{selected?.name ?? 'Conquista'}</DialogTitle>
          {selected && (() => {
            const colors = CATEGORY_COLORS[selected.category] ?? CATEGORY_COLORS.special;
            const Icon = ICON_MAP[selected.icon] ?? Trophy;
            const unlocked = Boolean(selected.unlocked_at);
            return (
              <>
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                  unlocked ? `${colors.bg}/20 ring-2 ${colors.ring}` : 'bg-zinc-800'
                }`}>
                  <Icon className={`w-8 h-8 ${unlocked ? colors.text : 'text-zinc-600'}`} />
                </div>
                <div>
                  <h4 className="text-lg font-black">{selected.name}</h4>
                  <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${colors.bgLight} ${colors.text}`}>
                    {CATEGORY_LABELS[selected.category] ?? selected.category}
                  </span>
                </div>
                <p className="text-sm text-zinc-400">{selected.description}</p>
                {unlocked ? (
                  <p className="text-xs text-green-400 font-bold">
                    Desbloqueado em {new Date(selected.unlocked_at).toLocaleDateString('pt-BR')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const current = currentValues?.[selected.category] ?? 0;
                      const pct = Math.min(100, Math.round((current / selected.threshold) * 100));
                      return (
                        <>
                          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full ${colors.bg} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-xs text-zinc-500 tabular-nums">{current} / {selected.threshold}</p>
                        </>
                      );
                    })()}
                    {selected.is_pro_only && !isPro && (
                      <p className="text-[10px] text-yellow-500 font-bold">Exclusivo para membros PRO</p>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BadgeMiniIcons({ badges = [], max = 3 }) {
  if (badges.length === 0) return null;

  const unlocked = badges
    .filter((b) => Boolean(b.unlocked_at))
    .sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at))
    .slice(0, max);

  if (unlocked.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {unlocked.map((b) => {
        const colors = CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.special;
        const Icon = ICON_MAP[b.icon] ?? Trophy;
        return (
          <div
            key={b.badge_id}
            title={b.name}
            className={`w-6 h-6 rounded-full flex items-center justify-center ${colors.bg}/20`}
          >
            <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
          </div>
        );
      })}
    </div>
  );
}
