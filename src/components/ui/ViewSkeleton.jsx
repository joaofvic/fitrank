import { Skeleton, SkeletonLine } from './Skeleton.jsx';

export function ViewSkeleton() {
  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <SkeletonLine width="40%" height="1.25rem" />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
        >
          <SkeletonLine width={`${55 + i * 10}%`} height="0.875rem" />
          <SkeletonLine width="100%" height="2.5rem" />
          <div className="flex gap-3">
            <SkeletonLine width="4rem" height="0.75rem" />
            <SkeletonLine width="3rem" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  );
}
