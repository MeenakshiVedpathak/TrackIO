import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { usePmDashboardProjects } from '@/hooks/usePmDashboard';
import { formatDate, formatPercentage } from '@/utils/formatters';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import ListPagination from './ListPagination';

const DEFAULT_PAGE_SIZE = 5;

// Section 2 — Project Health: rows from GET /pm-dashboard/projects filtered to risk_flag=true,
// rendered as the compact list/badges the spec offers as an alternative to a second full table
// (Section 1 below is already the full sortable/paginated project rollup — duplicating that here
// for "at risk only" would just be the same table twice). No server-side sortBy of its own: this
// fetches one reasonably-large page sorted by nearest deadline and filters client-side, same as
// Section 1's own risk-first regroup. Paginated client-side (via ListPagination, shared with
// ActionRequiredFeed) on top of that already-fetched set — at-risk counts for one PM's own
// portfolio realistically stay well under FETCH_LIMIT, so this never needs a second request just
// to turn the page.
const FETCH_LIMIT = 50;

const ProjectHealthList = ({ monthYear, buScope }) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

  const { data, isPending } = usePmDashboardProjects({
    ...buScope,
    month: monthYear.month,
    year: monthYear.year,
    page: 1,
    limit: FETCH_LIMIT,
    sortBy: 'nearest_end_date',
    sortOrder: 'asc',
  });

  const atRiskRows = (data?.records ?? []).filter((r) => r.risk_flag);
  const totalPages = Math.max(1, Math.ceil(atRiskRows.length / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = atRiskRows.slice((safePage - 1) * limit, safePage * limit);

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (atRiskRows.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No at-risk projects"
        description="Every project is within its variance threshold with no overdue Service POs."
      />
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {pageRows.map((p) => (
          <div
            key={p.project_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{p.project_name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.client_name || '—'} · Deadline {formatDate(p.nearest_end_date)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {p.overdue_po_count > 0 && (
                <Badge variant="destructive">{p.overdue_po_count} overdue PO{p.overdue_po_count > 1 ? 's' : ''}</Badge>
              )}
              {p.variance_pct != null && (
                <Badge variant={Math.abs(p.variance_pct) >= 20 ? 'destructive' : 'warning'}>
                  {formatPercentage(p.variance_pct)} variance
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <ListPagination
        page={safePage}
        limit={limit}
        total={atRiskRows.length}
        onPageChange={(p) => setPage(Math.max(1, Math.min(totalPages, p)))}
        onPageSizeChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
};

export default ProjectHealthList;
