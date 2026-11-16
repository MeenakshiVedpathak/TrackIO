import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, BellRing, CalendarDays, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { useTimesheetApprovalStatusReport } from '@/hooks/useTimesheetApprovalStatusReport';
import { useMyTeamEmployees } from '@/hooks/useMyTeam';
import { useNotification } from '@/hooks/useNotification';
import { employeeWorkLogApi } from '@/api/employeeWorkLog.api';
import { extractApiError } from '@/services/apiClient';
import { formatHours, formatDate, formatMonthYear, getInitials, getStatusColor } from '@/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { MultiSelect } from '@/components/ui/multi-select';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import ReportTypeToggle from '@/components/common/ReportTypeToggle';
import { useActionConfirm } from '@/components/common/ExportConfirm';
import StatusBadge from '@/components/common/StatusBadge';

// 'weekly' shares the same `range` state as 'range' below — WeekPicker just snaps selection to a
// Mon-Sat business week instead of two free clicks, emitting the identical {startDate, endDate} shape, so
// periodParams/hasSelection need no separate weekly case. It deliberately skips Range's "Aggregate
// into monthly buckets" checkbox — collapsing one week into a single monthly bucket defeats the
// point of narrowing to a week in the first place.
const REPORT_TYPES = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Range', value: 'range' },
];

const GRID_COLS = 'grid-cols-[minmax(0,1fr)_90px_110px]';
const INDENT_PER_DEPTH_PX = 20;

// The API never returns a status for the Project level (only Service PO/Parent/Child) — `null`
// on an actual node means "no activity" (still render, per spec, just not as a status word),
// undefined means the field plain doesn't exist at this level. Both render as a dash.
const StatusCell = ({ status }) =>
  status ? <StatusBadge status={status} /> : <span className="text-xs text-muted-foreground">—</span>;

const normalizeHierarchyNode = (node) => ({
  key: `hier-${node.hierarchy_id}`,
  name: node.name,
  hours: node.hours,
  status: node.approval_status,
  children: (node.children ?? []).map(normalizeHierarchyNode),
});

const normalizeServicePO = (po, projectName) => ({
  key: `po-${po.service_po_id}`,
  name: po.service_po_name,
  projectName,
  hours: po.po_total_hours,
  status: po.approval_status,
  children: (po.children ?? []).map(normalizeHierarchyNode),
});

// Flatten: promote every Service PO to the top level, carrying its parent project name as a
// subtitle. This removes the Project grouping row (which never has hours or a status anyway)
// and puts the actionable rows — PDCC, ttyt, etc. — directly at depth 0.
const normalizeProjects = (projects = []) =>
  projects.flatMap((project) =>
    (project.service_pos ?? []).map((po) => normalizeServicePO(po, project.project_name))
  );

// Status -> accent colour for the card's top strip; same buckets StatusBadge's own colours use.
const STATUS_ACCENT = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-400',
  destructive: 'bg-rose-500',
  info: 'bg-sky-500',
  secondary: 'bg-slate-300',
};

const TreeRow = ({ node, depth, expandedKeys, onToggle }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);
  const isTop = depth === 0;

  return (
    <div className={cn(isTop && 'border-t first:border-t-0')}>
      <button
        type="button"
        onClick={() => hasChildren && onToggle(node.key)}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? isExpanded : undefined}
        className={cn(
          'grid w-full items-center gap-2 px-4 text-left transition-colors',
          'hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent',
          isTop ? 'py-3' : 'py-2',
          GRID_COLS
        )}
      >
        <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * INDENT_PER_DEPTH_PX }}>
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              isExpanded && 'rotate-90',
              !hasChildren && 'invisible'
            )}
            aria-hidden="true"
          />
          {isTop ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />
          )}
          <span className="flex min-w-0 flex-col">
            <span className={cn('truncate', isTop ? 'text-sm font-semibold text-foreground' : 'text-sm text-foreground/90')}>
              {node.name}
            </span>
            {isTop && node.projectName && (
              <span className="truncate text-xs text-muted-foreground">{node.projectName}</span>
            )}
          </span>
        </span>
        <span className={cn('text-right tabular-nums', isTop ? 'text-sm font-semibold' : 'text-sm text-muted-foreground')}>
          {node.hours !== undefined ? formatHours(node.hours) : '—'}
        </span>
        <span className="flex justify-end">
          <StatusCell status={node.status} />
        </span>
      </button>

      {hasChildren && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="relative overflow-hidden bg-muted/20"
            >
              {/* Guide line linking the children to their parent row. */}
              <span
                aria-hidden="true"
                className="absolute bottom-2 top-0 w-px bg-border"
                style={{ left: 16 + depth * INDENT_PER_DEPTH_PX + 7 }}
              />
              {node.children.map((child) => (
                <TreeRow key={child.key} node={child} depth={depth + 1} expandedKeys={expandedKeys} onToggle={onToggle} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

const bucketKey = (bucket) => `bucket-${bucket.employee_id}-${bucket.date ?? `${bucket.month}-${bucket.year}`}`;

const periodLabel = (bucket) =>
  bucket.log_type === 'monthly' ? formatMonthYear(bucket.month, bucket.year) : formatDate(bucket.date);

// Deliberately carries no "Remind Team Lead" control of its own: the reminder endpoint takes no
// date or bucket, so every per-bucket button would have fired the exact same tenant-wide "all my
// pending logs" request. One button in the page header says that honestly — see handleRemind.
const BucketCard = ({ bucket, showEmployeeName, expandedKeys, onToggle, index = 0 }) => {
  const projects = useMemo(() => normalizeProjects(bucket.projects), [bucket.projects]);
  const accent = STATUS_ACCENT[getStatusColor(bucket.approval_status)] ?? STATUS_ACCENT.secondary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.24), ease: 'easeOut' }}
      className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className={cn('h-1 w-full', accent)} aria-hidden="true" />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {showEmployeeName ? (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(bucket.employee_name)}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-foreground">{bucket.employee_name || '—'}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" aria-hidden="true" />
                  {periodLabel(bucket)}
                </span>
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </span>
              {periodLabel(bucket)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-lg font-bold leading-tight tabular-nums text-foreground">{formatHours(bucket.total_hours)}</p>
          </div>
          <StatusCell status={bucket.approval_status} />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground">No activity for this period.</div>
      ) : (
        <>
          <div className={cn('grid gap-2 border-y bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground', GRID_COLS)}>
            <span className="pl-6">Service PO / Hierarchy</span>
            <span className="text-right">Hours</span>
            <span className="text-right">Status</span>
          </div>
          {projects.map((project) => (
            <TreeRow key={project.key} node={project} depth={0} expandedKeys={expandedKeys} onToggle={onToggle} />
          ))}
        </>
      )}
    </motion.div>
  );
};

const BucketCardSkeleton = () => (
  <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <Skeleton className="h-1 w-full rounded-none" />
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
    <div className="space-y-3 border-t px-4 py-3">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
    </div>
  </div>
);

const TimesheetApprovalStatusReport = () => {
  const { success, error: showError } = useNotification();
  const confirmAction = useActionConfirm();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Default to Monthly mode showing the current month — an employee arriving here to check
  // approval status or send a reminder sees the whole month's buckets immediately.
  const [reportType, setReportType] = useState('monthly');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [monthYear, setMonthYear] = useState({ month: dayjs().month() + 1, year: dayjs().year() });
  const [range, setRange] = useState(null);
  const [aggregateMonthly, setAggregateMonthly] = useState(false);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  // Guards the single reminder button: disabled from the click until the response lands, so a
  // double-click can't fire two POSTs (the backend rate-limits as a backstop).
  const [isReminding, setIsReminding] = useState(false);

  const { data: myTeam = [] } = useMyTeamEmployees();
  const employeeOptions = useMemo(
    () => myTeam.map((e) => ({ label: e.full_name, value: String(e.id) })),
    [myTeam]
  );
  const isTeamLead = myTeam.length > 0;

  const hasSelection = (reportType !== 'range' && reportType !== 'weekly') || !!range;

  // Weekly gets its own branch rather than falling into Range's — otherwise a stale
  // `aggregateMonthly` checked earlier in Range mode would silently collapse a selected week into
  // one monthly bucket after switching tabs, with no checkbox visible in Weekly to explain why.
  const periodParams =
    reportType === 'daily'
      ? { date }
      : reportType === 'monthly'
        ? { month: monthYear?.month, year: monthYear?.year }
        : reportType === 'weekly'
          ? { startDate: range?.startDate, endDate: range?.endDate }
          : {
              startDate: range?.startDate,
              endDate: range?.endDate,
              ...(aggregateMonthly ? { log_type: 'monthly' } : {}),
            };

  const params = {
    ...periodParams,
    ...(isTeamLead && employeeIds.length > 0 ? { employee_ids: employeeIds.join(',') } : {}),
  };

  const { data, isLoading, isError, error } = useTimesheetApprovalStatusReport(params, hasSelection);

  const buckets = data ?? [];
  // Several employees in one response (e.g. a manager's view) always need the name — otherwise two
  // buckets for the same month render as identical, indistinguishable cards.
  const distinctEmployeeCount = new Set(buckets.map((b) => b.employee_id)).size;
  const showEmployeeName = distinctEmployeeCount > 1 || (isTeamLead && employeeIds.length === 0);
  const errorMessage = isError ? extractApiError(error) : null;
  const showLoading = hasSelection && isLoading;

  const toggleKey = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeFilterCount = (isTeamLead && employeeIds.length > 0 ? 1 : 0) + (reportType === 'range' && aggregateMonthly ? 1 : 0);

  const clearFilters = () => {
    setEmployeeIds([]);
    setAggregateMonthly(false);
  };

  // The "Remind Team Lead" action always concerns the VIEWER's own pending logs — the endpoint
  // resolves the employee from the token, not from a param — so it's hidden while a Team Lead has
  // drilled into one team member, where a button labelled "Remind Team Lead" would read as "nudge
  // this person's approver" and in fact do something else entirely.
  //
  // Not a permission gate: `employeeId === 'all'` is true for (a) every non-team-lead Employee,
  // who only ever sees their own data, and (b) a Team Lead on the default "My Whole Team" filter,
  // which surfaces their own buckets too. So anyone who can see their own timesheet can use it.
  const showRemindButton = employeeIds.length === 0;

  // Purely a notification: no query invalidation and no refetch, so nothing on screen shifts and
  // the reminder can't be mistaken for a status change. The request carries no body — the backend
  // resolves both the employee and their primary Team Lead from the bearer token, and the period /
  // pending count in the response are its own computation over ALL of the caller's pending logs,
  // not whatever period this report is currently filtered to.
  const handleRemind = async () => {
    if (isReminding) return;
    setIsReminding(true);
    try {
      const res = await employeeWorkLogApi.remindApproval();
      success(res?.data?.message ?? res?.message ?? 'Reminder sent to the primary Team Lead.');
    } catch (err) {
      // Show the exact API message verbatim — these strings are written to be user-facing.
      const msg =
        err?.response?.data?.message ??
        extractApiError(err) ??
        'Unable to send reminder. Please try again.';
      showError(msg);
    } finally {
      setIsReminding(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Timesheet Approval Status Report"
        actions={
          <div className="flex items-center gap-2">
            {showRemindButton && (
              <Button
                size="toolbar"
                className="relative bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:bg-amber-600"
                onClick={() => confirmAction(handleRemind, {
                  title: 'Send reminder?',
                  description: 'Your manager will get an email about pending logs',
                  confirmLabel: 'Send',
                  icon: BellRing,
                  tone: 'amber',
                })}
                disabled={isReminding}
                title="Email your primary Team Lead about your work logs awaiting approval"
              >
                {isReminding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="relative">
                    <BellRing className="h-4 w-4" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-white" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-white" />
                  </span>
                )}
                {isReminding ? 'Sending…' : 'Remind Project Manager'}
              </Button>
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[300px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <ReportTypeToggle options={REPORT_TYPES} value={reportType} onChange={setReportType} />

        {reportType === 'daily' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date</Label>
            <DatePicker
              value={date}
              max={dayjs().format('YYYY-MM-DD')}
              onChange={setDate}
              className="w-full bg-white"
            />
          </div>
        )}

        {reportType === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month</Label>
            <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white" />
          </div>
        )}

        {reportType === 'weekly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Week</Label>
            <WeekPicker value={range} onChange={setRange} placeholder="Select a week" className="w-full" />
          </div>
        )}

        {reportType === 'range' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Date Range</Label>
              <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white" clearable />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Grouping</Label>
              <label
                htmlFor="aggregate-monthly"
                className={cn(
                  'flex h-[clamp(1.875rem,2vw,2.25rem)] cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-[clamp(0.75rem,0.85vw,0.875rem)] transition-colors hover:bg-muted/50',
                  aggregateMonthly && 'border-primary/50 bg-primary/5'
                )}
              >
                <Checkbox id="aggregate-monthly" checked={aggregateMonthly} onCheckedChange={(v) => setAggregateMonthly(!!v)} />
                <span className="truncate">Aggregate into monthly buckets</span>
              </label>
            </div>
          </>
        )}

        {isTeamLead && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
            <MultiSelect
              options={employeeOptions}
              value={employeeIds}
              onValueChange={setEmployeeIds}
              placeholder="All Employees"
              searchPlaceholder="Search employee..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
            />
          </div>
        )}
      </FilterPanel>

      {hasSelection && errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!hasSelection && (
        <EmptyState title="Select a date range to view the timesheet approval status report." />
      )}

      {showLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading report">
          <BucketCardSkeleton />
          <BucketCardSkeleton />
        </div>
      )}

      {hasSelection && !showLoading && !errorMessage && (
        buckets.length === 0 ? (
          <EmptyState title="No timesheet activity for this period." />
        ) : (
          <div className="space-y-3">
            {buckets.map((bucket, index) => (
              <BucketCard
                key={bucketKey(bucket)}
                index={index}
                bucket={bucket}
                showEmployeeName={showEmployeeName}
                expandedKeys={expandedKeys}
                onToggle={toggleKey}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default TimesheetApprovalStatusReport;
