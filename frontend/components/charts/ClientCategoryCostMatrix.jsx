import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

const PAGE_SIZE = 8;

const CATEGORIES = [
  { key: 'Billable',              color: '#22c55e' },
  { key: 'Non-Billable',          color: '#6366f1' },
  { key: 'Customer Non-Billable', color: '#f97316' },
];

const ClientCategoryCostMatrix = ({ data = [], isLoading, periodLabel }) => {
  const [page, setPage] = useState(1);

  const rows = [...(data ?? [])]
    .filter((c) => (c.total_cost || 0) > 0)
    .sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <Skeleton className="h-4 w-56 mb-1" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2.5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm font-semibold">Client × Category Cost Matrix</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Cost breakdown by category per client · {periodLabel}</CardDescription>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {CATEGORIES.map((c) => (
              <span key={c.key} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color }} />
                {c.key}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col">
        {rows.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No cost data"
            description="Cost breakdown will appear once timesheets are costed."
            className="py-10"
          />
        ) : (
          <>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start">
              {pageRows.map((c) => {
                const total = c.total_cost || 0;
                const segments = CATEGORIES.map((cat) => ({
                  ...cat,
                  value: c.categories?.[cat.key] || 0,
                  pct: total > 0 ? ((c.categories?.[cat.key] || 0) / total) * 100 : 0,
                })).filter((s) => s.value > 0);

                return (
                  <div key={c.client_id} className="rounded-md border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <span className="text-xs font-semibold truncate min-w-0" title={c.client_name}>{c.client_name}</span>
                      <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-muted">
                      {segments.map((s) => (
                        <div
                          key={s.key}
                          style={{ width: `${s.pct}%`, background: s.color }}
                          title={`${s.key}: ${formatCurrency(s.value)}`}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {segments.map((s) => (
                        <span key={s.key} className="text-[10px] text-muted-foreground">
                          {s.key}: <span className="font-medium text-foreground">{formatCurrency(s.value)}</span>
                        </span>
                      ))}
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

export default ClientCategoryCostMatrix;
