import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, BellRing, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useTimesheetApprovalStatusReport } from '@/hooks/useTimesheetApprovalStatusReport';
import { useMyTeamEmployees } from '@/hooks/useMyTeam';
import { useNotification } from '@/hooks/useNotification';
import { employeeWorkLogApi } from '@/api/employeeWorkLog.api';
import { extractApiError } from '@/services/apiClient';
import { formatHours, formatDate, formatMonthYear } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import StatusBadge from '@/components/common/StatusBadge';

const REPORT_TYPES = [
  { label: 'Daily', value: 'daily' },
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

const TreeRow = ({ node, depth, expandedKeys, onToggle }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);

  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => hasChildren && onToggle(node.key)}
        disabled={!hasChildren}
        className={cn(
          'w-full grid gap-2 items-center px-4 py-2 text-left hover:bg-muted/30 transition-colors disabled:cursor-default disabled:hover:bg-transparent',
          GRID_COLS,
          depth === 0 && 'font-semibold'
        )}
      >
        <span
          className="flex items-center gap-1.5 truncate"
          style={{ paddingLeft: depth * INDENT_PER_DEPTH_PX }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {depth > 0 && <span className="text-muted-foreground">└</span>}
          <span className="flex flex-col min-w-0">
            <span className={cn('truncate', depth > 0 && 'text-sm')}>{node.name}</span>
            {depth === 0 && node.projectName && (
              <span className="text-xs font-normal text-muted-foreground truncate">{node.projectName}</span>
            )}
          </span>
        </span>
        <span className={cn('text-right tabular-nums', depth === 0 ? 'font-semibold' : 'text-sm')}>
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
              transition={{ duration: 0.15 }}
              className="overflow-hidden bg-muted/10"
            >
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

// Deliberately carries no "Remind Manager" control of its own: the reminder endpoint takes no
// date or bucket, so every per-bucket button would have fired the exact same tenant-wide "all my
// pending logs" request. One button in the page header says that honestly — see handleRemind.
const BucketCard = ({ bucket, showEmployeeName, expandedKeys, onToggle }) => {
  const projects = useMemo(() => normalizeProjects(bucket.projects), [bucket.projects]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          {showEmployeeName && <span className="text-sm font-semibold">{bucket.employee_name}</span>}
          <span className="text-sm text-muted-foreground">{periodLabel(bucket)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">{formatHours(bucket.total_hours)}</span>
          <StatusCell status={bucket.approval_status} />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">No activity for this period.</div>
      ) : (
        <>
          <div className={cn('grid gap-2 bg-muted/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', GRID_COLS)}>
            <span>Service PO / Hierarchy</span>
            <span className="text-right">Hours</span>
            <span className="text-right">Status</span>
          </div>
          {projects.map((project) => (
            <TreeRow key={project.key} node={project} depth={0} expandedKeys={expandedKeys} onToggle={onToggle} />
          ))}
        </>
      )}
    </div>
  );
};

const TimesheetApprovalStatusReport = () => {
  const { success, error: showError } = useNotification();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Default to Monthly mode showing the current month — an employee arriving here to check
  // approval status or send a reminder sees the whole month's buckets immediately.
  const [reportType, setReportType] = useState('monthly');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [monthYear, setMonthYear] = useState({ month: dayjs().month() + 1, year: dayjs().year() });
  const [range, setRange] = useState(null);
  const [aggregateMonthly, setAggregateMonthly] = useState(false);
  const [employeeId, setEmployeeId] = useState('all');
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  // Guards the single reminder button: disabled from the click until the response lands, so a
  // double-click can't fire two POSTs (the backend rate-limits as a backstop).
  const [isReminding, setIsReminding] = useState(false);

  const { data: myTeam = [] } = useMyTeamEmployees();
  const employeeOptions = useMemo(
    () => [
      { label: 'My Whole Team', value: 'all' },
      ...myTeam.map((e) => ({ label: e.full_name, value: String(e.id) })),
    ],
    [myTeam]
  );
  const isManager = myTeam.length > 0;

  const hasSelection = reportType !== 'range' || !!range;

  const periodParams =
    reportType === 'daily'
      ? { date }
      : reportType === 'monthly'
        ? { month: monthYear?.month, year: monthYear?.year }
        : {
            startDate: range?.startDate,
            endDate: range?.endDate,
            ...(aggregateMonthly ? { log_type: 'monthly' } : {}),
          };

  const params = {
    ...periodParams,
    ...(isManager && employeeId !== 'all' ? { employee_id: employeeId } : {}),
  };

  const { data, isLoading, isError, error } = useTimesheetApprovalStatusReport(params, hasSelection);

  const buckets = data ?? [];
  const showEmployeeName = isManager && (employeeId === 'all' || buckets.length > 1);
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

  const activeFilterCount = (isManager && employeeId !== 'all' ? 1 : 0) + (reportType === 'range' && aggregateMonthly ? 1 : 0);

  const clearFilters = () => {
    setEmployeeId('all');
    setAggregateMonthly(false);
  };

  // The "Remind Manager" action always concerns the VIEWER's own pending logs — the endpoint
  // resolves the employee from the token, not from a param — so it's hidden while a Manager has
  // drilled into one team member, where a button labelled "Remind Manager" would read as "nudge
  // this person's approver" and in fact do something else entirely.
  //
  // Not a permission gate: `employeeId === 'all'` is true for (a) every non-manager Employee,
  // who only ever sees their own data, and (b) a Manager on the default "My Whole Team" filter,
  // which surfaces their own buckets too. So anyone who can see their own timesheet can use it.
  const showRemindButton = employeeId === 'all';

  // Purely a notification: no query invalidation and no refetch, so nothing on screen shifts and
  // the reminder can't be mistaken for a status change. The request carries no body — the backend
  // resolves both the employee and their primary manager from the bearer token, and the period /
  // pending count in the response are its own computation over ALL of the caller's pending logs,
  // not whatever period this report is currently filtered to.
  const handleRemind = async () => {
    if (isReminding) return;
    setIsReminding(true);
    try {
      const res = await employeeWorkLogApi.remindApproval();
      success(res?.data?.message ?? res?.message ?? 'Reminder sent to the primary manager.');
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
        description="Hours logged and their approval status, broken down by Project → Service PO → Parent → Child. Read-only — use My Team to approve."
        actions={
          <div className="flex items-center gap-2">
            {showRemindButton && (
              <Button
                size="toolbar"
                className="relative bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:bg-amber-600"
                onClick={handleRemind}
                disabled={isReminding}
                title="Email your primary manager about your work logs awaiting approval"
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
                {isReminding ? 'Sending…' : 'Remind Manager'}
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
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Report Type</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
            {REPORT_TYPES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setReportType(value)}
                className={cn(
                  'flex-1 px-3 h-full font-medium text-center whitespace-nowrap transition-colors border-r last:border-r-0',
                  reportType === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {reportType === 'daily' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date</Label>
            <DatePicker
              value={date}
              max={dayjs().format('YYYY-MM-DD')}
              onChange={setDate}
              className="w-full bg-white text-sm"
            />
          </div>
        )}

        {reportType === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month</Label>
            <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-9 w-full text-sm bg-white" />
          </div>
        )}

        {reportType === 'range' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Date Range</Label>
              <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-9 w-full text-sm bg-white" clearable />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox id="aggregate-monthly" checked={aggregateMonthly} onCheckedChange={(v) => setAggregateMonthly(!!v)} />
              <Label htmlFor="aggregate-monthly" className="text-xs font-normal cursor-pointer">
                Aggregate into monthly buckets
              </Label>
            </div>
          </>
        )}

        {isManager && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
            <SearchableSelect
              options={employeeOptions}
              value={employeeId}
              onValueChange={(v) => v && setEmployeeId(v)}
              placeholder="My Whole Team"
              searchPlaceholder="Search employee..."
              className="h-9 w-full text-sm bg-white"
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
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      )}

      {hasSelection && !showLoading && !errorMessage && (
        buckets.length === 0 ? (
          <EmptyState title="No timesheet activity for this period." />
        ) : (
          <div className="space-y-3">
            {buckets.map((bucket) => (
              <BucketCard
                key={bucketKey(bucket)}
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
