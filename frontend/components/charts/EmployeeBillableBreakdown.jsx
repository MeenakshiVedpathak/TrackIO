import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/common/EmptyState';
import { Users } from 'lucide-react';
import { cn } from '@/utils/cn';

/* ── helpers ── */
const getBillableColor = (pct) => {
  if (pct >= 90) return { text: 'text-emerald-600 dark:text-emerald-400', bar: '#10b981' };
  if (pct >= 75) return { text: 'text-primary', bar: 'hsl(var(--primary))' };
  if (pct >= 60) return { text: 'text-amber-500', bar: '#f59e0b' };
  return { text: 'text-red-500', bar: '#ef4444' };
};

const NBReasonBadge = ({ name, hours, type }) => {
  const isLeave = type === 'Leaves';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
      isLeave
        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
        : 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
    )}>
      {name}: {hours}h
    </span>
  );
};

const SumPill = ({ label, value, colorClass }) => (
  <div className="flex flex-col items-center gap-0.5 rounded-lg border bg-muted/30 px-3 py-2 min-w-[90px]">
    <span className="text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">{label}</span>
    <span className={cn('text-sm font-bold tabular-nums', colorClass)}>{value}</span>
  </div>
);

/* ── skeleton rows ── */
const SkeletonRows = () =>
  Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>
      <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-5" /></td>
      <td className="px-3 py-2.5 space-y-1">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-20" />
      </td>
      <td className="px-3 py-2.5"><Skeleton className="h-5 w-24" /></td>
      <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-28" /></td>
      <td className="px-3 py-2.5 space-y-1">
        <Skeleton className="h-5 w-20" />
      </td>
      <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-12" /></td>
    </tr>
  ));

/* ── main component ── */
const EmployeeBillableBreakdown = ({ data = [], meta = {}, isLoading, month, year }) => {
  const monthLabel = month && year
    ? new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    : 'This Month';

  const records = data.filter((r) => r.total_hours > 0);

  const totalBillable    = records.reduce((s, r) => s + (Number(r.billable_hours)     || 0), 0);
  const totalNonBillable = records.reduce((s, r) => s + (Number(r.non_billable_hours) || 0), 0);
  const totalHours       = records.reduce((s, r) => s + (Number(r.total_hours)        || 0), 0);
  const overallBillPct   = totalHours > 0 ? ((totalBillable / totalHours) * 100).toFixed(1) : '0.0';

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap';
  const td = 'px-3 py-2.5 text-xs align-middle';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Billable Breakdown</CardTitle>
        <CardDescription>Billable % and non-billable reasons per employee · {monthLabel}</CardDescription>
      </CardHeader>

      <CardContent>
        {/* ── Summary pills ── */}
        {!isLoading && totalHours > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SumPill label="Total Hours"    value={`${totalHours.toLocaleString('en-IN')}h`} colorClass="text-foreground" />
            <SumPill label={`Billable`}     value={`${totalBillable.toLocaleString('en-IN')}h`} colorClass="text-primary" />
            <SumPill label="Non-Billable"   value={`${totalNonBillable.toLocaleString('en-IN')}h`} colorClass="text-orange-500" />

            {/* overall efficiency bar */}
            <div className="flex-1 min-w-[160px]">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Avg billable efficiency (visible)</span>
                <span className={cn('font-semibold', getBillableColor(Number(overallBillPct)).text)}>
                  {overallBillPct}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${overallBillPct}%`, background: getBillableColor(Number(overallBillPct)).bar }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className={cn(th, 'w-8 text-center')}>#</th>
                  <th className={cn(th, 'min-w-[160px]')}>Employee</th>
                  <th className={cn(th, 'min-w-[130px]')}>Billable %</th>
                  <th className={cn(th, 'min-w-[170px]')}>Top Billable Projects</th>
                  <th className={cn(th, 'min-w-[160px]')}>Non-Billable Reasons</th>
                  <th className={cn(th, 'text-right')}>Total</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <SkeletonRows />
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10">
                      <EmptyState
                        icon={Users}
                        title="No employee hours logged"
                        description="Employee breakdown will appear once timesheets are submitted."
                      />
                    </td>
                  </tr>
                ) : (
                  records.map((row, idx) => {
                    const pct    = Number(row.billable_pct) || 0;
                    const colors = getBillableColor(pct);

                    const topBillable = (row.billable_reasons ?? [])
                      .filter((r) => r.hours > 0)
                      .slice(0, 2);

                    const nbReasons = (row.non_billable_reasons ?? [])
                      .filter((r) => r.hours > 0);

                    const pageOffset = ((meta.page ?? 1) - 1) * (meta.limit ?? 10);

                    return (
                      <tr key={row.employee_id} className="hover:bg-muted/30 transition-colors group">
                        {/* # */}
                        <td className={cn(td, 'text-center text-muted-foreground w-8')}>
                          {pageOffset + idx + 1}
                        </td>

                        {/* Employee */}
                        <td className={td}>
                          <p className="font-medium text-foreground leading-tight">{row.full_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {row.employee_code} · {row.designation}
                          </p>
                        </td>

                        {/* Billable % */}
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(pct, 100)}%`, background: colors.bar }}
                              />
                            </div>
                            <span className={cn('tabular-nums font-semibold text-xs w-[42px] text-right', colors.text)}>
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            {row.billable_hours}h / {row.total_hours}h
                          </p>
                        </td>

                        {/* Top Billable Projects */}
                        <td className={td}>
                          {topBillable.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {topBillable.map((r) => (
                                <span key={r.service_po_id} className="inline-flex items-center gap-1 text-[10px] text-foreground">
                                  <span
                                    className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ background: 'hsl(var(--primary))' }}
                                  />
                                  <span className="truncate max-w-[130px]" title={r.service_po_name}>
                                    {r.service_po_name}
                                  </span>
                                  <span className="text-muted-foreground shrink-0">{r.hours}h</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>

                        {/* Non-Billable Reasons */}
                        <td className={td}>
                          {nbReasons.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {nbReasons.map((r) => (
                                <NBReasonBadge
                                  key={r.service_po_id}
                                  name={r.service_po_name}
                                  hours={r.hours}
                                  type={r.service_type_name}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-medium">Fully billable</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className={cn(td, 'text-right tabular-nums font-medium')}>
                          {row.total_hours}h
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Pagination note ── */}
        {!isLoading && meta.total != null && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {records.length} of {meta.total} employees
            {meta.total > records.length + (data.length - records.length)
              ? ` · employees with 0 hours are hidden`
              : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default EmployeeBillableBreakdown;
