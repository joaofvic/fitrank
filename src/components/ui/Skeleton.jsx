/**
 * Primitivos de skeleton loading reutilizáveis.
 * Usa a classe CSS `.skeleton` definida no index.css.
 */

export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonLine({ width = '100%', height = '1rem', className = '' }) {
  return <Skeleton className={className} style={{ width, height }} />;
}

export function SkeletonCircle({ size = '2.5rem', className = '' }) {
  return <Skeleton className={`rounded-full ${className}`} style={{ width: size, height: size }} />;
}

export function RankingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonLine width="60%" height="0.875rem" />
            <SkeletonLine width="35%" height="0.75rem" />
          </div>
          <SkeletonLine width="3rem" height="1.25rem" />
        </div>
      ))}
    </div>
  );
}

export function FeedCardSkeleton() {
  return (
    <div className="bg-zinc-900/50 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <SkeletonCircle size="2.5rem" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="40%" height="0.875rem" />
          <SkeletonLine width="25%" height="0.625rem" />
        </div>
      </div>
      <Skeleton className="w-full rounded-none" style={{ height: '14rem' }} />
      <div className="p-4 space-y-3">
        <SkeletonLine width="80%" height="0.75rem" />
        <div className="flex gap-4">
          <SkeletonLine width="3rem" height="1.5rem" />
          <SkeletonLine width="3rem" height="1.5rem" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4">
      <FeedCardSkeleton />
      <FeedCardSkeleton />
      <FeedCardSkeleton />
    </div>
  );
}

export function ProfileStatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <SkeletonCircle size="4rem" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="50%" height="1.125rem" />
          <SkeletonLine width="30%" height="0.75rem" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-900/50 rounded-xl p-3 space-y-2">
            <SkeletonLine width="60%" height="1.5rem" />
            <SkeletonLine width="80%" height="0.625rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
