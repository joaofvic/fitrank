const LEVEL_COLORS = [
  { min: 0,  bg: 'bg-zinc-600',    ring: 'ring-zinc-500/40',    text: 'text-zinc-300' },
  { min: 1,  bg: 'bg-green-600',   ring: 'ring-green-500/40',   text: 'text-green-300' },
  { min: 5,  bg: 'bg-blue-600',    ring: 'ring-blue-500/40',    text: 'text-blue-300' },
  { min: 10, bg: 'bg-purple-600',  ring: 'ring-purple-500/40',  text: 'text-purple-300' },
  { min: 20, bg: 'bg-orange-600',  ring: 'ring-orange-500/40',  text: 'text-orange-300' },
  { min: 30, bg: 'bg-red-600',     ring: 'ring-red-500/40',     text: 'text-red-300' },
  { min: 50, bg: 'bg-yellow-500',  ring: 'ring-yellow-400/40',  text: 'text-yellow-900' }
];

function getColors(level) {
  let matched = LEVEL_COLORS[0];
  for (const c of LEVEL_COLORS) {
    if (level >= c.min) matched = c;
  }
  return matched;
}

export function LevelBadge({ level = 0, size = 'md' }) {
  const colors = getColors(level);

  const sizeClasses = size === 'sm'
    ? 'w-6 h-6 text-[10px]'
    : size === 'lg'
      ? 'w-10 h-10 text-sm'
      : 'w-8 h-8 text-xs';

  return (
    <span
      className={`${sizeClasses} rounded-full ${colors.bg} ring-2 ${colors.ring} inline-flex items-center justify-center font-black ${colors.text} tabular-nums shadow-lg`}
      title={`Nível ${level}`}
    >
      {level}
    </span>
  );
}
