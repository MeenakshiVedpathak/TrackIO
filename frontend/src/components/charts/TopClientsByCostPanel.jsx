import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

const PAGE_SIZE = 5;

const RANK_STYLES = [
  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  'bg-slate-400/15 text-slate-500 dark:text-slate-300',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
];

const TopClientsByCostPanel = ({ data = [], isLoading, periodLabel }) => {
  const [page, setPage] = useState(1);

  const rows = [...(data ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || (b.total_cost || 0) - (a.total_cost || 0));
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const maxCost = rows.reduce((m, r) => Math.max(m, r.total_cost || 0), 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <Skeleton className="h-4 w-40 mb-1" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">Top Clients by Cost</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Ranked by total cost · {periodLabel}</CardDescription>
          </div>
          {rows.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {rows.length} clients
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col">
        {rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No client cost data"
            description="Ranked clients will appear once timesheets are costed."
            className="py-10"
          />
        ) : (
          <>
            <div className="space-y-2.5 flex-1">
              {pageRows.map((c) => {
                const pct = maxCost > 0 ? Math.min(((c.total_cost || 0) / maxCost) * 100, 100) : 0;
                const rankStyle = RANK_STYLES[(c.rank ?? 99) - 1] ?? 'bg-primary/10 text-primary';
                return (
                  <div key={c.client_id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 hover:shadow-sm transition-shadow">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${rankStyle}`}>
                      {c.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate" title={c.client_name}>{c.client_name}</p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(c.total_cost)}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">{Number(c.total_hours ?? 0).toLocaleString('en-IN')} hrs</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page <= 1}
                    className="flex items-center gap-1 rounded border px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="tabular-nums">{page}/{totalPages}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 rounded border px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TopClientsByCostPanel;
