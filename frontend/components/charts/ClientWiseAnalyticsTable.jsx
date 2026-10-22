import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Table2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatters';

const PAGE_SIZE = 8;

const ClientWiseAnalyticsTable = ({ data = [], isLoading, periodLabel }) => {
  const [page, setPage] = useState(1);

  const rows = [...(data ?? [])].sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap';
  const td = 'px-3 py-2.5 text-xs align-middle';

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <Skeleton className="h-4 w-48 mb-1" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">Client-wise Analytics</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Cost, utilization & project spread per client · {periodLabel}</CardDescription>
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
            icon={Table2}
            title="No client analytics"
            description="Client analytics will appear once timesheets are costed."
            className="py-10"
          />
        ) : (
          <>
            <div className="rounded-md border overflow-hidden flex-1">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className={cn(th, 'w-8 text-center')}>#</th>
                      <th className={cn(th, 'min-w-[160px]')}>Client</th>
                      <th className={cn(th, 'text-right')}>Hours</th>
                      <th className={cn(th, 'text-right')}>Cost</th>
                      <th className={cn(th, 'text-right')}>Avg ₹/hr</th>
                      <th className={cn(th, 'text-center')}>Projects</th>
                      <th className={cn(th, 'min-w-[110px]')}>% of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((c, idx) => (
                      <tr key={c.client_id} className="hover:bg-muted/30 transition-colors">
                        <td className={cn(td, 'text-center text-muted-foreground w-8')}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className={td}>
                          <p className="font-medium text-foreground truncate max-w-[220px]" title={c.client_name}>{c.client_name}</p>
                        </td>
                        <td className={cn(td, 'text-right tabular-nums')}>{Number(c.total_hours ?? 0).toLocaleString('en-IN')}</td>
                        <td className={cn(td, 'text-right tabular-nums font-semibold text-foreground')}>{formatCurrency(c.total_cost)}</td>
                        <td className={cn(td, 'text-right tabular-nums text-muted-foreground')}>{formatCurrency(c.average_cost_per_hour ?? 0)}</td>
                        <td className={cn(td, 'text-center tabular-nums')}>{c.total_projects ?? 0}</td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[50px]">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(c.percentage_of_total_cost || 0, 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-muted-foreground text-[11px] w-9 text-right shrink-0">
                              {Number(c.percentage_of_total_cost ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

export default ClientWiseAnalyticsTable;
