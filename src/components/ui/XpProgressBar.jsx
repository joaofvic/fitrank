export function XpProgressBar({ currentXp = 0, xpCurrentLevel = 0, xpNextLevel = 100, progressPct = 0, level = 0 }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] tabular-nums">
        <span className="text-zinc-400 font-bold">Nv. {level}</span>
        <span className="text-zinc-500">{currentXp} / {xpNextLevel} XP</span>
      </div>
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, progressPct)}%` }}
        />
      </div>
    </div>
  );
}
