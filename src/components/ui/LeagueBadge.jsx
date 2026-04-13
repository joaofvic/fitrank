import { Shield } from 'lucide-react';

export const LEAGUE_CONFIG = {
  bronze:   { name: 'Bronze',   color: '#CD7F32', bg: 'bg-amber-900/20',   border: 'border-amber-700/30',   text: 'text-amber-600',   minXp: 0 },
  silver:   { name: 'Prata',    color: '#C0C0C0', bg: 'bg-zinc-400/10',    border: 'border-zinc-400/30',    text: 'text-zinc-300',    minXp: 1000 },
  gold:     { name: 'Ouro',     color: '#FFD700', bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  minXp: 5000 },
  platinum: { name: 'Platina',  color: '#E5E4E2', bg: 'bg-slate-300/10',   border: 'border-slate-300/30',   text: 'text-slate-200',   minXp: 15000 },
  diamond:  { name: 'Diamante', color: '#B9F2FF', bg: 'bg-cyan-300/10',    border: 'border-cyan-300/30',    text: 'text-cyan-300',    minXp: 50000 }
};

const LEAGUE_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

export function getLeagueConfig(slug) {
  return LEAGUE_CONFIG[slug] ?? LEAGUE_CONFIG.bronze;
}

export function getNextLeague(slug) {
  const idx = LEAGUE_ORDER.indexOf(slug);
  if (idx < 0 || idx >= LEAGUE_ORDER.length - 1) return null;
  const next = LEAGUE_ORDER[idx + 1];
  return { slug: next, ...LEAGUE_CONFIG[next] };
}

export function getAllLeagues() {
  return LEAGUE_ORDER.map((slug) => ({ slug, ...LEAGUE_CONFIG[slug] }));
}

export function LeagueBadge({ league = 'bronze', size = 'md', onClick }) {
  const config = getLeagueConfig(league);

  const sizeClasses = size === 'sm'
    ? 'h-6 px-2 text-[10px] gap-1'
    : size === 'lg'
      ? 'h-9 px-3 text-xs gap-1.5'
      : 'h-7 px-2.5 text-[11px] gap-1';

  const iconSize = size === 'sm' ? 10 : size === 'lg' ? 16 : 12;

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center rounded-full font-black uppercase tracking-wide border ${config.bg} ${config.border} ${config.text} ${sizeClasses} ${onClick ? 'cursor-pointer hover:brightness-125 transition-all active:scale-95' : ''}`}
      title={config.name}
    >
      <Shield size={iconSize} style={{ color: config.color }} className="fill-current opacity-80" />
      {config.name}
    </Tag>
  );
}
