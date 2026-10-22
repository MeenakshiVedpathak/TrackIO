import { CalendarClock } from 'lucide-react';
import { usePmDashboardProjects } from '@/hooks/usePmDashboard';
import { formatDate } from '@/utils/formatters';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';

const FETCH_LIMIT = 50;
const VISIBLE_COUNT = 5;

// New widget (no backend change needed) — reuses the exact same GET /pm-dashboard/projects call
// ProjectHealthList already makes (sorted by nearest_end_date ascending), just showing the soonest
// N deadlines outright instead of filtering to risk_flag=true. A project with no nearest_end_date
// at all (nothing scheduled) is excluded rather than sorting to either end of the list.
const UpcomingDeadlinesList = ({ monthYear, buScope }) => {
  const { data, isPending } = usePmDashboardProjects({
    ...buScope,
    month: monthYear.month,
    year: monthYear.year,
    page: 1,
    limit: FETCH_LIMIT,
    sortBy: 'nearest_end_date',
    sortOrder: 'asc',
  });

  const rows = (data?.records ?? [])
    .filter((r) => r.nearest_end_date)
    .slice(0, VISIBLE_COUNT);

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No upcoming deadlines"
        description="No project has a scheduled Service PO end date this period."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((p) => (
        <div
          key={p.project_id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{formatDate(p.nearest_end_date)}</p>
            <p className="truncate text-xs text-muted-foreground">{p.project_name} · {p.client_name || '—'}</p>
          </div>
          {p.overdue_po_count > 0 && (
            <Badge variant="destructive" className="shrink-0">
              {p.overdue_po_count} overdue PO{p.overdue_po_count > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
};

export default UpcomingDeadlinesList;
