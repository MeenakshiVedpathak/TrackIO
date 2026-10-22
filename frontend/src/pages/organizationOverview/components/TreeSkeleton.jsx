import { Skeleton } from '@/components/ui/skeleton';

const TreeSkeleton = () => (
  <div className="space-y-3 rounded-lg border bg-card p-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="space-y-2" style={{ marginLeft: (i % 2) * 16 }}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    ))}
  </div>
);

export default TreeSkeleton;
