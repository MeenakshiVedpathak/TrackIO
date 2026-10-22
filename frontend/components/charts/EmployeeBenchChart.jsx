import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Users, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 10;

const getBenchColor = (pct) => {
  if (pct === 0) return '#94a3b8';
  if (pct < 25) return '#22c55e';
  if (pct < 50) return '#f59e0b';
  if (pct < 75) return '#f97316';
  return '#ef4444';
};

const getBenchLabel = (pct) => {
  if (pct === 0) return { label: 'Active', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
  if (pct < 25) return { label: 'Low', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  if (pct < 50) return { label: 'Mid', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  if (pct < 75) return { label: 'High', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
  return { label: 'Critical', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
};

const EmployeeBenchChart = ({ data = [], isLoading, fiscalYear }) => {
  const [page, setPage] = useState(1);

  const sorted = [...data].sort((a, b) => b.bench_pct - a.bench_pct);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const benchCount = data.filter((e) => e.bench_pct > 0).length;
  const criticalCount = data.filter((e) => e.bench_pct >= 75).length;

  const fyLabel = fiscalYear ? `FY ${fiscalYear}–${String(fiscalYear + 1).slice(-2)}` : '';

  if (isLoading) {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader>
          <Skeleton className="h-5 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Employee Bench %</CardTitle>
            <CardDescription className="mt-1">
              Leave + Idle + On Bench · {fyLabel}
            </CardDescription>
          </div>
          {data.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 text-xs">
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-red-700 dark:text-red-400 font-medium">
                  <AlertCircle className="h-3 w-3" />
                  {criticalCount} critical
                </span>
              )}
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {benchCount} on bench
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No bench data"
            description="Employee bench data will appear once timesheets are processed."
            className="py-10"
          />
        ) : (
          <>
            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {[
                { color: '#22c55e', label: '< 25% Low' },
                { color: '#f59e0b', label: '25–49% Mid' },
                { color: '#f97316', label: '50–74% High' },
                { color: '#ef4444', label: '≥ 75% Critical' },
                { color: '#94a3b8', label: '0% Active' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>

            {/* Rows */}
            <div className="space-y-2.5">
              {pageData.map((emp) => {
                const color = getBenchColor(emp.bench_pct);
                const { label: badge, cls } = getBenchLabel(emp.bench_pct);
                const pct = Math.min(emp.bench_pct, 100);

                return (
                  <div key={emp.employee_id}>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-sm font-medium truncate max-w-[180px]"
                        title={emp.full_name}
                      >
                        {emp.full_name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${cls}`}>
                          {badge}
                        </span>
                        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                      <span>Bench: {emp.bench_hours?.toLocaleString('en-IN')} hrs</span>
                      <span>Total: {emp.total_hours?.toLocaleString('en-IN')} hrs</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
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

export default EmployeeBenchChart;
