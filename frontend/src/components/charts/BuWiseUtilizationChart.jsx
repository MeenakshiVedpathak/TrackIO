import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import EmptyState from '@/components/common/EmptyState';
import {
  Landmark, ChevronLeft, ChevronRight, ChevronDown,
  AlertTriangle, BarChart2, Users, Building2, Info, Layers,
} from 'lucide-react';
import { formatHours, formatPercentage } from '@/utils/formatters';
 
const PAGE_SIZE = 10;
 
const TIERS = [
  { min: 80,  color: '#22c55e', label: 'Healthy',     dot: 'bg-emerald-500', badge: 'bg-emerald-50  text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' },
  { min: 60,  color: '#3b82f6', label: 'Moderate',    dot: 'bg-blue-500',    badge: 'bg-blue-50     text-blue-700    border-blue-200    dark:bg-blue-900/30    dark:text-blue-400    dark:border-blue-800'    },
  { min: 30,  color: '#f59e0b', label: 'Low',         dot: 'bg-amber-500',   badge: 'bg-amber-50    text-amber-700   border-amber-200   dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-800'   },
  { min: 0.1, color: '#ef4444', label: 'Critical',    dot: 'bg-red-500',     badge: 'bg-red-50      text-red-700     border-red-200     dark:bg-red-900/30     dark:text-red-400     dark:border-red-800'     },
  { min: 0,   color: '#94a3b8', label: 'No Activity', dot: 'bg-slate-400',   badge: 'bg-slate-50    text-slate-500   border-slate-200   dark:bg-slate-800      dark:text-slate-400   dark:border-slate-700'   },
];
 
// The API nests a BU's Sub-BUs under `sub_bus` (dashboard, snake_case) / `subBus` (report, camelCase).
const getSubBus = (bu) => bu.sub_bus ?? bu.subBus ?? [];
 
// A row with no employees and no expected hours has nothing to report — show dashes, not 0s.
const isEmptyRow = (row) => !(row.total_employees ?? 0) && !(row.expected_hours ?? 0);
 
const getTier = (pct) => TIERS.find((t) => pct >= t.min) ?? TIERS[TIERS.length - 1];
 
// Mini KPI card used in the summary strip
const KpiCard = ({ icon: Icon, iconBg, label, value, valueColor }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 whitespace-nowrap">
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
      <Icon className="h-3 w-3 text-white" />
    </span>
    <div>
      <p className="text-[9px] font-medium text-muted-foreground leading-tight">{label}</p>
      <p className={`text-sm font-bold leading-tight tabular-nums ${valueColor ?? 'text-foreground'}`}>{value}</p>
    </div>
  </div>
);
 
const BuWiseUtilizationChart = ({ data = [], summary, isLoading, periodLabel }) => {
  const [page, setPage] = useState(1);
  const [expandedBuIds, setExpandedBuIds] = useState(() => new Set());
 
  // Reset pagination and collapse all when the data set changes (period change or refetch).
  useEffect(() => { setPage(1); setExpandedBuIds(new Set()); }, [data]);
 
  const toggleExpand = (buId) => setExpandedBuIds((prev) => {
    const next = new Set(prev);
    next.has(buId) ? next.delete(buId) : next.add(buId);
    return next;
  });
 
  // Sort BU rows only — children come from `sub_bus` already in the data.
  const sorted = useMemo(
    () => [...data].sort((a, b) => (b.utilization_percentage ?? 0) - (a.utilization_percentage ?? 0)),
    [data],
  );
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
 
  // Flat display list: BU rows plus injected Sub-BU children when expanded.
  const displayData = useMemo(() => {
    const rows = [];
    pageData.forEach((bu) => {
      const subBuses = getSubBus(bu);
      const hasChildren = subBuses.length > 0 || !!(bu.has_sub_bus ?? bu.hasSubBus);
      rows.push({ ...bu, _isChild: false, _hasChildren: hasChildren });
      if (hasChildren && expandedBuIds.has(bu.bu_id ?? bu.buId)) {
        subBuses.forEach((sub, i) => {
          const isDirect = sub.is_direct ?? sub.isDirect ?? false;
          const label = isDirect ? '(BU level)' : (sub.sub_bu_name ?? sub.subBuName ?? sub.bu_name ?? '—');
          rows.push({ ...sub, _isChild: true, _label: label, _isLastChild: i === subBuses.length - 1 });
        });
      }
    });
    return rows;
  }, [pageData, expandedBuIds]);
 
  // Critical = top-level BU rows only (rolled-up utilisation < 30% and has employees).
  const criticalCount = useMemo(
    () => data.filter((bu) => (bu.total_employees ?? 0) > 0 && (bu.utilization_percentage ?? 0) < 30).length,
    [data],
  );
  const overallUtil     = summary?.utilization_percentage ?? summary?.utilizationPercentage;
  const totalBuCount    = summary?.bu_count ?? data.length;
  const totalSubBuCount = summary?.sub_bu_count ?? null;
  // Use summary for employee count — BU rows have employees rolled up, so summing rows would
  // double-count employees who appear in both a BU and its Sub-BU.
  const totalEmployees  = summary?.total_employees ?? summary?.totalEmployees ?? 0;
 
  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="flex flex-col h-full">
        <CardContent className="flex-1 p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-60" />
              <Skeleton className="h-3 w-48 mt-1" />
            </div>
            <div className="flex gap-2">
              {[120, 120, 150, 130].map((w, i) => <Skeleton key={i} className="h-16 rounded-xl" style={{ width: w }} />)}
            </div>
          </div>
          <Skeleton className="h-7 w-full rounded" />
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded" />)}
        </CardContent>
      </Card>
    );
  }
 
  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <Card className="flex flex-col h-full overflow-hidden">
      <CardContent className="flex-1 flex flex-col p-5 gap-4 min-h-0">
 
        {/* ── Top: heading row + KPI cards ── */}
        <div className="flex flex-col gap-1.5">
          {/* Row 1: title left, KPI cards right */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold leading-tight text-foreground whitespace-nowrap">BU-wise Utilization</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                Expected vs Logged hours &nbsp;·&nbsp; {periodLabel}
              </p>
            </div>
            {data.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <KpiCard icon={Building2} iconBg="bg-blue-500" label="Total BUs" value={totalBuCount} />
                {totalSubBuCount != null && (
                  <KpiCard icon={Building2} iconBg="bg-indigo-500" label="Total Sub BUs" value={totalSubBuCount} />
                )}
                <KpiCard icon={AlertTriangle} iconBg="bg-red-500" label="Critical BUs" value={criticalCount} valueColor={criticalCount > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
                <KpiCard icon={BarChart2} iconBg="bg-emerald-500" label="Average Utilization" value={overallUtil != null ? formatPercentage(overallUtil, 1) : '—'} />
                <KpiCard icon={Users} iconBg="bg-violet-500" label="Total Employees" value={totalEmployees} />
              </div>
            )}
          </div>
          {/* Row 2: legend below heading */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {TIERS.map(({ dot, label }) => (
              <span key={label} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
 
        {/* ── Table ── */}
        {data.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No BU utilization data"
            description="BU-wise utilization will appear once timesheets are processed."
            className="py-10"
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-auto">
            <table className="w-full border-collapse text-[clamp(0.6875rem,0.8vw,0.875rem)]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="py-2 pl-3 pr-4 text-left text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                    Business Unit
                  </th>
                  <th
                    className="py-2 px-4 text-left text-[11px] font-semibold text-muted-foreground w-[260px]"
                    title="Logged hours ÷ expected hours of that row (employees × monthly cap). A BU that has Sub-BUs is the total of its Sub-BUs (all their logged hours ÷ all their expected hours), so its % is the weighted average of the Sub-BU rows below it — not the sum of their percentages."
                  >
                    Utilization
                  </th>
                  <th className="py-2 px-3 text-left text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                    Status
                  </th>
                  <th
                    className="py-2 px-3 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap"
                    title="Logged hours ÷ expected hours of that row (employees × monthly cap). A BU row covers all its employees together — its BU level and every Sub-BU — so its % is the weighted average of the rows below it, not their sum."
                  >
                    Utilization %
                  </th>
                  <th className="py-2 px-3 text-right text-[11px] font-semibold text-muted-foreground">
                    Employees
                  </th>
                  <th className="py-2 px-3 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                    Logged Hours
                  </th>
                  <th className="py-2 px-3 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                    Expected Hours
                  </th>
                </tr>
              </thead>
 
              <tbody className="divide-y divide-border/50">
                {displayData.map((row, idx) => {
                  const rawPct = row.utilization_percentage ?? 0;
                  const barPct = Math.min(rawPct, 100);
                  const tier   = getTier(rawPct);
 
                  if (row._isChild) {
                    const empty = isEmptyRow(row);
                    return (
                      <tr key={`child-${idx}`} className="bg-muted/30 hover:bg-muted/50 transition-colors">
                        {/* Tree connector: a vertical line down the BU's children, a short tick into each one */}
                        <td className="relative py-3 pl-14 pr-4">
                          <span
                            aria-hidden
                            className={`absolute left-[24px] top-0 w-px bg-border ${row._isLastChild ? 'h-1/2' : 'h-full'}`}
                          />
                          <span aria-hidden className="absolute left-[24px] top-1/2 h-px w-[26px] bg-border" />
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tier.dot}`} />
                            <span className="text-foreground truncate max-w-[200px]" title={row._label}>
                              {row._label}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 w-[260px]">
                          <div className="flex items-center gap-2.5">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: tier.color }} />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: tier.color }}>
                              {formatPercentage(rawPct, 1)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center justify-center rounded border w-24 py-0.5 text-[10px] font-semibold ${tier.badge}`}>
                            {tier.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{formatPercentage(rawPct, 1)}</td>
                        <td className="py-3 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{empty ? '–' : (row.total_employees ?? 0)}</td>
                        <td className="py-3 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{empty ? '–' : <>{formatHours(row.total_logged_hours)}&thinsp;h</>}</td>
                        <td className="py-3 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{empty ? '–' : <>{formatHours(row.expected_hours)}&thinsp;h</>}</td>
                      </tr>
                    );
                  }
 
                  const buId = row.bu_id ?? row.buId;
                  const name = row.bu_name ?? row.buName;
                  const isExpanded = expandedBuIds.has(buId);
                  const hasChildren = row._hasChildren;
                  const subBuses = getSubBus(row);
                  const namedSubBuCount = subBuses.filter((s) => !(s.is_direct ?? s.isDirect)).length;
 
                  return (
                    <tr
                      key={buId ?? name}
                      onClick={hasChildren ? () => toggleExpand(buId) : undefined}
                      className={`transition-colors hover:bg-muted/40 ${hasChildren ? 'cursor-pointer' : ''}`}
                    >
                      {/* Business Unit name */}
                      <td className="py-2.5 pl-3 pr-4">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Fixed-width slot so BU names line up whether or not a BU has Sub-BUs */}
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleExpand(buId); }}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          ) : <span className="h-6 w-6 shrink-0" />}
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tier.dot}`} />
                          <span className="font-semibold text-foreground truncate max-w-[160px]" title={name}>
                            {name}
                          </span>
                          {(row.unassigned_employees ?? 0) > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`${row.unassigned_employees} not in a Sub BU`}
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                >
                                  <Info className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                {row.unassigned_employees} not in a Sub BU ({formatHours(row.unassigned_logged_hours)} h). They are mapped to {name} but to none of its Sub BUs, so they are not counted in this BU&apos;s numbers.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {namedSubBuCount > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
                                  aria-label={`${namedSubBuCount} Sub BU${namedSubBuCount !== 1 ? 's' : ''}`}
                                >
                                  <Layers className="h-3 w-3" />
                                  {namedSubBuCount}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {namedSubBuCount} Sub BU{namedSubBuCount !== 1 ? 's' : ''}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
 
                      {/* Progress bar + inline % */}
                      <td className="py-2.5 px-4 w-[260px]">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-[width] duration-500 ease-out"
                              style={{ width: `${barPct}%`, background: tier.color }}
                            />
                          </div>
                          <span
                            className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums"
                            style={{ color: tier.color }}
                          >
                            {formatPercentage(rawPct, 1)}
                          </span>
                        </div>
                      </td>
 
                      {/* Status badge */}
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center rounded border w-24 py-0.5 text-[10px] font-semibold ${tier.badge}`}>
                          {tier.label}
                        </span>
                      </td>
 
                      {/* Utilization % (numeric) */}
                      <td className="py-2.5 px-3 text-right tabular-nums font-medium text-muted-foreground whitespace-nowrap">
                        {formatPercentage(rawPct, 1)}
                      </td>
 
                      {/* Employees */}
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {row.total_employees ?? 0}
                      </td>
 
                      {/* Logged Hours */}
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatHours(row.total_logged_hours)}&thinsp;h
                      </td>
 
                      {/* Expected Hours */}
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatHours(row.expected_hours)}&thinsp;h
                      </td>
 
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
 
        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
            <span className="tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} BUs
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="flex items-center gap-0.5 rounded border border-border px-2 py-1 hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span className="tabular-nums px-1.5">{page}/{totalPages}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-0.5 rounded border border-border px-2 py-1 hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
 
      </CardContent>
    </Card>
  );
};
 
export default BuWiseUtilizationChart;
 
 