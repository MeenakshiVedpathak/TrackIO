import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatters';

const PAGE_SIZE = 8;

const CATEGORY_STYLES = {
  Billable:                'bg-green-500/10 text-green-700 dark:text-green-400',
  'Non-Billable':          'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  'Customer Non-Billable': 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
};

const CATEGORY_SORT_OPTIONS = ['Billable', 'Non-Billable', 'Customer Non-Billable'];

const formatCost = (v) => (Number(v) ? formatCurrency(v) : '—');

const ProjectWiseAnalyticsTable = ({ data = [], isLoading, periodLabel }) => {
  const [page, setPage] = useState(1);
  const [sortByCategory, setSortByCategory] = useState('Billable');

  const rows = [...(data ?? [])]
    .filter((p) => (p.total_cost || 0) > 0)
    .sort((a, b) => {
      const aMatches = a.category_name === sortByCategory;
      const bMatches = b.category_name === sortByCategory;
      if (aMatches !== bMatches) return aMatches ? -1 : 1;
      return (b.total_cost || 0) - (a.total_cost || 0);
    });

  const handleCategorySort = (category) => {
    setSortByCategory(category);
    setPage(1);
  };

  const months = useMemo(() => {
    const withBreakdown = rows.find((p) => (p.monthly_cost_breakdown ?? []).length > 0);
    return (withBreakdown?.monthly_cost_breakdown ?? []).map((m) => m.month);
  }, [rows]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap border-b border-border';
  const td = 'px-3 py-2.5 text-xs align-middle whitespace-nowrap border-b border-border';

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
            <CardTitle className="text-sm font-semibold">Project-wise Analytics</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Cost per project by month · {periodLabel}</CardDescription>
          </div>
          {rows.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {rows.length} projects
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col">
        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No project cost data"
            description="Project cost will appear once timesheets are costed."
            className="py-10"
          />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground shrink-0">Sort:</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted flex-wrap">
                {CATEGORY_SORT_OPTIONS.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleCategorySort(category)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150 whitespace-nowrap',
                      sortByCategory === category
                        ? 'bg-card shadow-sm text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md border overflow-hidden flex-1">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className={cn(th, 'w-8 text-center sticky left-0 z-20 bg-muted')}>#</th>
                      <th className={cn(th, 'min-w-[170px] sticky left-8 z-20 bg-muted border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]')}>Project</th>
                      <th className={cn(th, 'min-w-[140px]')}>Client</th>
                      <th className={th}>Type</th>
                      <th className={cn(th, 'text-right')}>Total Cost</th>
                      {months.map((m) => (
                        <th key={m} className={cn(th, 'text-right')}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p, idx) => {
                      const byMonth = {};
                      (p.monthly_cost_breakdown ?? []).forEach((m) => { byMonth[m.month] = m.cost; });
                      return (
                        <tr key={p.service_po_id} className="hover:bg-muted/30 transition-colors group">
                          <td className={cn(td, 'text-center text-muted-foreground w-8 sticky left-0 z-10 bg-card group-hover:bg-muted')}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                          <td className={cn(td, 'sticky left-8 z-10 bg-card group-hover:bg-muted border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]')}>
                            <p className="font-medium text-foreground truncate max-w-[200px]" title={p.project_name}>{p.project_name}</p>
                          </td>
                          <td className={td}>
                            <p className="text-muted-foreground truncate max-w-[170px]" title={p.client_name}>{p.client_name}</p>
                          </td>
                          <td className={td}>
                            <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none', CATEGORY_STYLES[p.category_name] ?? 'bg-muted text-muted-foreground')}>
                              {p.category_name}
                            </span>
                          </td>
                          <td className={cn(td, 'text-right tabular-nums font-semibold text-foreground')}>{formatCost(p.total_cost)}</td>
                          {months.map((m) => (
                            <td key={m} className={cn(td, 'text-right tabular-nums text-muted-foreground')}>{formatCost(byMonth[m])}</td>
                          ))}
                        </tr>
                      );
                    })}
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

export default ProjectWiseAnalyticsTable;
