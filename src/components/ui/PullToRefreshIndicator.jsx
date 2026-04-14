import { RefreshCw } from 'lucide-react';

/**
 * Indicador visual de pull-to-refresh.
 * Mostra um spinner que cresce e gira conforme o pull distance.
 */
export function PullToRefreshIndicator({ pullDistance, refreshing, threshold = 80 }) {
  const show = pullDistance > 10 || refreshing;
  if (!show) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = pullDistance * 2;

  return (
    <div
      className="flex justify-center py-2 overflow-hidden transition-opacity"
      style={{
        height: refreshing ? 40 : Math.max(pullDistance * 0.6, 0),
        opacity: refreshing ? 1 : progress,
      }}
    >
      <RefreshCw
        className={`w-5 h-5 text-green-500 ${refreshing ? 'ptr-spinner' : ''}`}
        style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
      />
    </div>
  );
}
