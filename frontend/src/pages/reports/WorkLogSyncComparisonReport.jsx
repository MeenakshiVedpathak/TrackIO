import { useState, useEffect, useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ChevronDown, ChevronUp, ChevronsUpDown, Download, AlertCircle, RotateCcw, Loader2, Info,
} from 'lucide-react';
import { useWorkLogSyncComparison, useWorkLogSyncComparisonFilterOptions } from '@/hooks/useWorkLogSyncComparison';
import { workLogSyncComparisonApi } from '@/api/workLogSyncComparison.api';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { downloadBlob } from '@/utils/download';
import { formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useActiveEmployees } from '@/hooks/useEmployees';
import SearchInput from '@/components/common/SearchInput';
import { useExportConfirm } from '@/components/common/ExportConfirm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DatePicker } from '@/components/ui/date-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const DATE_FMT = 'DD-MMM-YYYY';
const PAGE_SIZES = [10, 25, 50, 100, 200];
const SEARCH_MAX = 100;
const SELECT_CLASS = 'h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white';

const WORK_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'Own BU' },
  { value: 'cross', label: 'Cross BU' },
  { value: 'na', label: 'Not Applicable' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const WORK_TYPE_BADGE = {
  own: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400',
  cross: 'bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400',
  na: 'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400',
  synced: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400',
  rejected: 'bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400',
};

const SORT = {
  DATE: 'date', EMPLOYEE: 'employee', CLIENT: 'client', PROJECT: 'project', PO: 'po', MODULE: 'module',
  BEFORE: 'before_hours', AFTER: 'after_hours', WORK_TYPE: 'work_type', STATUS: 'status',
};

const AFTER_SYNC_TOOLTIP = 'Official timesheet hours after the monthly cap. When one Service PO/date has several entries, '
  + 'the adjusted hours are shared across them in proportion to what each logged.';

const STAT_TONES = {
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
};

const StatPill = ({ label, value, tone }) => (
  <div className={cn(
    'rounded-md border px-[clamp(0.5rem,0.7vw,0.75rem)] py-[clamp(0.25rem,0.4vw,0.375rem)] text-[clamp(0.6875rem,0.75vw,0.75rem)] whitespace-nowrap',
    STAT_TONES[tone]
  )}>
    {label}&nbsp;
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', align === 'right' && 'w-full justify-end')}
    >
      {label}
      <Icon className={cn('h-3 w-3', !isActive && 'opacity-40')} />
    </button>
  );
};

const hrs = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v).toFixed(2));
const dash = <span className="text-muted-foreground">-</span>;
const TextCell = ({ value, className }) => (value
  ? <span className={cn('block max-w-[180px] truncate text-sm', className)} title={value}>{value}</span>
  : dash);

const currentMonth = () => {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
};

const toIdSet = (list) => new Set((list ?? []).map((x) => String(x.id)));
const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const WorkLogSyncComparisonReport = () => {
  const confirmExport = useExportConfirm();
  const { error: showError } = useNotification();

  // ── Period (exactly one mode is ever sent) ─────────────────────────────────
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState(currentMonth);
  const [singleDate, setSingleDate] = useState('');
  const [dateRange, setDateRange] = useState(null);

  const periodParams = useMemo(() => {
    if (periodMode === 'date') return singleDate ? { date: singleDate } : null;
    if (periodMode === 'range') {
      return dateRange?.startDate && dateRange?.endDate
        ? { start_date: dateRange.startDate, end_date: dateRange.endDate }
        : null;
    }
    return monthYear?.month && monthYear?.year ? { month: monthYear.month, year: monthYear.year } : null;
  }, [periodMode, singleDate, dateRange, monthYear]);
  const periodReady = !!periodParams;

  // ── Filters ────────────────────────────────────────────────────────────────
  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [servicePoIds, setServicePoIds] = useState([]);
  // Entity -> Business Unit (-> Sub-BU) — the same shared filters every other report uses. They
  // narrow by the EMPLOYEE's own BU (employee_bu_ids / employee_sub_bu_ids); the Service PO's BU
  // is the separate "PO BU" filter below.
  const [entityIds, setEntityIds] = useState([]);
  const [buValue, setBuValue] = useState([]);
  const { units: allBuUnits } = useSelectableBusinessUnits();
  const { units: entityBuUnits } = useSelectableBusinessUnits(entityIds.length ? entityIds : undefined);
  const rootBuIdSet = useMemo(
    () => new Set(allBuUnits.filter((u) => u.parentId == null).map((u) => String(u.id))),
    [allBuUnits]
  );
  const employeeBuIds = useMemo(() => {
    const picked = buValue.filter((id) => rootBuIdSet.has(String(id))).map(String);
    if (picked.length || buValue.length) return picked;
    // Entity picked but no BU -> every top-level BU of those Entities.
    return entityIds.length
      ? entityBuUnits.filter((u) => u.parentId == null).map((u) => String(u.id))
      : [];
  }, [buValue, rootBuIdSet, entityIds, entityBuUnits]);
  const employeeSubBuIds = useMemo(
    () => buValue.filter((id) => !rootBuIdSet.has(String(id))).map(String),
    [buValue, rootBuIdSet]
  );
  const [poBuIds, setPoBuIds] = useState([]);
  const [poSubBuIds, setPoSubBuIds] = useState([]);
  const [workType, setWorkType] = useState('all');
  const [statuses, setStatuses] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(SORT.DATE);
  const [sortOrder, setSortOrder] = useState('desc');
  const [exportingFormat, setExportingFormat] = useState(null);

  // ── Filter options (from the period only; refetched when the period changes) ──
  const optionsParams = useMemo(() => (periodParams ? { ...periodParams, buId: ALL_BUS } : undefined), [periodParams]);
  const { data: options = {}, isFetching: optionsLoading } = useWorkLogSyncComparisonFilterOptions(optionsParams);

  // filter-options' employees carry no BU, so when an Entity/BU is picked the list is intersected
  // with the employee master scoped to that Entity/BU (same scope EmployeeList's filter uses).
  const buScopeActive = entityIds.length > 0 || buValue.length > 0;
  const employeeScope = useMemo(
    () => ({ entityIds: buValue.length ? [] : entityIds, businessUnitIds: buValue }),
    [entityIds, buValue]
  );
  const { data: scopedEmployees, isFetching: scopedEmployeesLoading } = useActiveEmployees(
    undefined,
    buScopeActive ? employeeScope : { entityIds: [], businessUnitIds: [] }
  );
  const scopedEmployeeIdSet = useMemo(
    () => (buScopeActive && Array.isArray(scopedEmployees) ? new Set(scopedEmployees.map((e) => String(e.id))) : null),
    [buScopeActive, scopedEmployees]
  );
  const employeeOptions = useMemo(
    () => (options.employees ?? [])
      .filter((e) => !scopedEmployeeIdSet || scopedEmployeeIdSet.has(String(e.id)))
      .map((e) => ({
        value: String(e.id),
        label: e.employee_code ? `${e.name} (${e.employee_code})` : e.name,
      })),
    [options.employees, scopedEmployeeIdSet]
  );
  const clientOptions = useMemo(
    () => (options.clients ?? []).map((c) => ({ value: String(c.id), label: c.name })),
    [options.clients]
  );
  // Client -> Project -> Service PO cascade.
  const projectOptions = useMemo(
    () => (options.projects ?? [])
      .filter((p) => !clientIds.length || clientIds.includes(String(p.client_id)))
      .map((p) => ({ value: String(p.id), label: p.name })),
    [options.projects, clientIds]
  );
  const servicePoOptions = useMemo(
    () => (options.servicePos ?? [])
      .filter((po) => !clientIds.length || clientIds.includes(String(po.client_id)))
      .filter((po) => !projectIds.length || projectIds.includes(String(po.project_id)))
      .map((po) => ({ value: String(po.id), label: po.code ? `${po.name} (${po.code})` : po.name })),
    [options.servicePos, clientIds, projectIds]
  );
  // PO BU -> PO Sub-BU cascade.
  const poBuOptions = useMemo(
    () => (options.poBusinessUnits ?? []).map((b) => ({ value: String(b.id), label: b.name })),
    [options.poBusinessUnits]
  );
  const poSubBuOptions = useMemo(
    () => (options.poSubBusinessUnits ?? [])
      .filter((s) => !poBuIds.length || poBuIds.includes(String(s.parent_business_unit_id)))
      .map((s) => ({ value: String(s.id), label: s.name })),
    [options.poSubBusinessUnits, poBuIds]
  );

  // Drop any picked id that is no longer offered (parent changed, or a new period's options
  // don't include it). Runs only once options have actually loaded.
  const prune = (setter, opts) => {
    const valid = new Set(opts.map((o) => o.value));
    setter((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return sameIds(next, prev) ? prev : next;
    });
  };
  const optionsLoaded = !!options.employees;
  useEffect(() => { if (optionsLoaded) prune(setEmployeeIds, employeeOptions); }, [optionsLoaded, employeeOptions]);
  useEffect(() => { if (optionsLoaded) prune(setClientIds, clientOptions); }, [optionsLoaded, clientOptions]);
  useEffect(() => { if (optionsLoaded) prune(setProjectIds, projectOptions); }, [optionsLoaded, projectOptions]);
  useEffect(() => { if (optionsLoaded) prune(setServicePoIds, servicePoOptions); }, [optionsLoaded, servicePoOptions]);
  useEffect(() => { if (optionsLoaded) prune(setPoBuIds, poBuOptions); }, [optionsLoaded, poBuOptions]);
  useEffect(() => { if (optionsLoaded) prune(setPoSubBuIds, poSubBuOptions); }, [optionsLoaded, poSubBuOptions]);

  // ── List params ────────────────────────────────────────────────────────────
  const trimmedSearch = debouncedSearch.trim().slice(0, SEARCH_MAX);
  const filterParams = useMemo(() => {
    if (!periodParams) return undefined;
    const p = {
      ...periodParams,
      sort_by: sortBy,
      sort_order: sortOrder,
      work_type: workType,
      approval_status: statuses.length ? statuses.join(',') : 'all',
      // Same as the Cross-BU report: no navbar-BU header — the BU filters below narrow instead.
      buId: ALL_BUS,
    };
    if (employeeIds.length) p.employee_ids = employeeIds.join(',');
    if (clientIds.length) p.client_ids = clientIds.join(',');
    if (projectIds.length) p.project_ids = projectIds.join(',');
    if (servicePoIds.length) p.service_po_ids = servicePoIds.join(',');
    if (employeeBuIds.length) p.employee_bu_ids = employeeBuIds.join(',');
    if (employeeSubBuIds.length) p.employee_sub_bu_ids = employeeSubBuIds.join(',');
    const poBuAll = [...poBuIds, ...poSubBuIds];
    if (poBuAll.length) p.po_bu_ids = poBuAll.join(',');
    if (trimmedSearch) p.search = trimmedSearch;
    return p;
  }, [
    periodParams, sortBy, sortOrder, workType, statuses, employeeIds, clientIds, projectIds, servicePoIds,
    employeeBuIds, employeeSubBuIds, poBuIds, poSubBuIds, trimmedSearch,
  ]);

  // Any filter / sort / period / search change -> back to page 1. The page is stored together with
  // the filter key it belongs to, so the reset happens in the same render (no request is ever sent
  // for the old page number with the new filters).
  const filterKey = JSON.stringify(filterParams ?? null);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next) => setPageState({ key: filterKey, page: next });

  const listParams = useMemo(
    () => (filterParams ? { ...filterParams, page, limit } : undefined),
    [filterParams, page, limit]
  );

  const { data, isPending, isFetching, isError, error, refetch } = useWorkLogSyncComparison(listParams);
  const errorMessage = isError ? extractApiError(error) : null;

  // Backend 400s (bad period mix, range > 366 days, …) go to a toast as well as the inline banner.
  useEffect(() => {
    if (errorMessage) showError(errorMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessage]);

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const totals = data?.data?.totals ?? {};
  const period = data?.data?.period ?? null;
  const meta = data?.meta ?? {};
  const total = Number(meta.total ?? 0);
  const totalPages = Number(meta.totalPages ?? 0);

  // Landed past the last page (filters shrank the result) -> load page 1.
  useEffect(() => {
    if (!isFetching && totalPages > 0 && page > totalPages) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching, totalPages, page]);

  const periodLabel = period?.start_date && period?.end_date
    ? `Period: ${formatDate(period.start_date, DATE_FMT)} to ${formatDate(period.end_date, DATE_FMT)}`
    : null;

  const activeFilterCount = [
    employeeIds.length, clientIds.length, projectIds.length, servicePoIds.length,
    entityIds.length, buValue.length, poBuIds.length || poSubBuIds.length,
    workType !== 'all', statuses.length,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEmployeeIds([]);
    setClientIds([]);
    setProjectIds([]);
    setServicePoIds([]);
    setEntityIds([]);
    setBuValue([]);
    setPoBuIds([]);
    setPoSubBuIds([]);
    setWorkType('all');
    setStatuses([]);
    setSearch('');
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === SORT.DATE || column === SORT.BEFORE || column === SORT.AFTER ? 'desc' : 'asc');
    }
  };

  const handleExport = async (format) => {
    if (!filterParams) return;
    setExportingFormat(format);
    try {
      const { blob, filename } = await workLogSyncComparisonApi.download(filterParams, format);
      // Month filter -> put the month name in the file name, e.g. "Work Log Sync Comparison - November 2026.xlsx".
      let name = filename;
      if (filterParams.month && filterParams.year) {
        const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0]) || (format === 'csv' ? '.csv' : '.xlsx');
        const monthName = new Date(filterParams.year, filterParams.month - 1, 1).toLocaleString('en-US', { month: 'long' });
        name = `Work Log Sync Comparison - ${monthName} ${filterParams.year}${ext}`;
      }
      downloadBlob(blob, name);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setExportingFormat(null);
    }
  };

  const columns = useMemo(() => {
    const sortable = (label, column, align) => () => (
      <SortableHeader label={label} column={column} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align={align} />
    );
    return [
      columnHelper.display({
        id: 'employee',
        header: sortable('Employee', SORT.EMPLOYEE),
        size: 200,
        meta: { sticky: true, left: 0 },
        cell: ({ row }) => {
          const r = row.original;
          return <span className="block truncate text-sm font-medium" title={r.employee_name}>{r.employee_name || '-'}</span>;
        },
      }),
      columnHelper.display({
        id: 'date',
        header: sortable('Date', SORT.DATE),
        size: 130,
        cell: ({ row }) => (row.original.date
          ? <span className="whitespace-nowrap text-sm tabular-nums">{formatDate(row.original.date, DATE_FMT)}</span>
          : dash),
      }),
      columnHelper.display({
        id: 'client',
        header: sortable('Client', SORT.CLIENT),
        size: 240,
        cell: ({ row }) => <TextCell value={row.original.client_name} className="max-w-[230px]" />,
      }),
      columnHelper.display({
        id: 'project',
        header: sortable('Project', SORT.PROJECT),
        size: 160,
        cell: ({ row }) => <TextCell value={row.original.project_name} />,
      }),
      columnHelper.display({
        id: 'service_po',
        header: sortable('Service PO', SORT.PO),
        size: 300,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.service_po_name) return dash;
          return <span className="block max-w-[290px] truncate text-sm font-medium" title={r.service_po_name}>{r.service_po_name}</span>;
        },
      }),
      columnHelper.display({
        id: 'module',
        header: sortable('Module', SORT.MODULE),
        size: 140,
        cell: ({ row }) => <TextCell value={row.original.module_name} />,
      }),
      columnHelper.display({
        id: 'task',
        header: 'Task',
        size: 140,
        cell: ({ row }) => <TextCell value={row.original.task_name} />,
      }),
      columnHelper.display({
        id: 'before_hours',
        header: sortable('Before Sync Hrs', SORT.BEFORE, 'right'),
        size: 150,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const v = hrs(row.original.before_sync_hours);
          return (
            <span className="block pr-1 text-right text-sm font-medium tabular-nums">
              {v ?? <span className="text-muted-foreground">-</span>}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'after_hours',
        header: () => (
          <div className="flex w-full items-center justify-end gap-1">
            <SortableHeader label="After Sync Hrs" column={SORT.AFTER} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About After Sync Hrs" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-normal">{AFTER_SYNC_TOOLTIP}</TooltipContent>
            </Tooltip>
          </div>
        ),
        size: 190,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          const v = hrs(r.after_sync_hours);
          if (v == null) {
            return (
              <div className="flex justify-end pr-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default text-sm text-muted-foreground">-</span>
                  </TooltipTrigger>
                  <TooltipContent>Not synced yet</TooltipContent>
                </Tooltip>
              </div>
            );
          }
          const diff = r.hours_difference == null ? null : Number(r.hours_difference);
          const showDiff = diff != null && !Number.isNaN(diff) && Math.abs(diff) >= 0.005;
          return (
            <div className="flex items-center justify-end gap-1.5 pr-1">
              {showDiff && (
                <span className={cn(
                  'rounded px-1 py-px text-[10px] font-medium tabular-nums',
                  diff < 0
                    ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                )}>
                  {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                </span>
              )}
              <span className="text-sm font-medium tabular-nums">{v}</span>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'work_type',
        header: sortable('Work Type', SORT.WORK_TYPE),
        size: 130,
        cell: ({ row }) => {
          const r = row.original;
          const badge = (
            <Badge className={cn('whitespace-nowrap text-[10px]', WORK_TYPE_BADGE[r.work_type] ?? WORK_TYPE_BADGE.na)}>
              {r.work_type_label || 'Not Applicable'}
            </Badge>
          );
          if (!r.po_bu && !r.po_sub_bu) return badge;
          return (
            <Tooltip>
              <TooltipTrigger asChild><span className="cursor-default">{badge}</span></TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div>PO BU: {r.po_bu || '-'}</div>
                  <div>PO Sub-BU: {r.po_sub_bu || '-'}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        },
      }),
      columnHelper.display({
        id: 'status',
        header: sortable('Status', SORT.STATUS),
        size: 110,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.status_label && !r.status) return dash;
          const key = String(r.status ?? '').toLowerCase();
          return (
            <Badge className={cn('whitespace-nowrap text-[10px]', STATUS_BADGE[key] ?? WORK_TYPE_BADGE.na)}>
              {r.status_label || r.status}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: 'description',
        header: 'Description',
        size: 260,
        cell: ({ row }) => {
          const text = row.original.description;
          if (!text || !String(text).trim()) return dash;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="line-clamp-2 max-w-[260px] cursor-default whitespace-normal break-words text-sm">{text}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm whitespace-pre-wrap break-words">{text}</TooltipContent>
            </Tooltip>
          );
        },
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder]);

  // Same as the other reports: skeleton rows inside the table whenever data is loading
  // (first load and every filter / sort / page change).
  const showLoading = periodReady && (isPending || isFetching);
  const canExport = periodReady && !isError && total > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Work Log Sync Comparison"
        description={periodLabel ?? 'Hours logged before sync next to the official hours after the monthly cap.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, SEARCH_MAX))}
              placeholder="Search employee, SPO, client, task…"
              className="w-full sm:w-64"
            />
            <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((p) => !p)} activeCount={activeFilterCount} />
            <Button
              variant="outline"
              size="toolbar"
              onClick={() => confirmExport(() => handleExport('excel'))}
              disabled={!canExport || exportingFormat != null}
            >
              {exportingFormat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingFormat ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} onClear={clearFilters} showClear={activeFilterCount > 0 || !!search}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Period</Label>
          <Tabs value={periodMode} onValueChange={setPeriodMode}>
            <TabsList className="grid w-full grid-cols-3 border border-input bg-slate-100 dark:bg-muted">
              <TabsTrigger value="date" className="text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-background">Date</TabsTrigger>
              <TabsTrigger value="range" className="text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-background">Date Range</TabsTrigger>
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-background">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            {periodMode === 'date' ? 'Date' : periodMode === 'range' ? 'Date Range' : 'Month & Year'} <span className="text-destructive">*</span>
          </Label>
          {periodMode === 'date' && (
            <DatePicker value={singleDate} onChange={(v) => setSingleDate(v || '')} className="w-full" />
          )}
          {periodMode === 'range' && (
            <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full" />
          )}
          {periodMode === 'month' && (
            <MonthYearPicker value={monthYear} onChange={(v) => { if (v) setMonthYear(v); }} clearable={false} className="w-full" />
          )}
        </div>

        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuValue([]); }} />
        <BusinessUnitFilter multiple value={buValue} entityId={entityIds} onChange={setBuValue} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Employee</Label>
          <MultiSelect
            options={employeeOptions}
            value={employeeIds}
            onValueChange={setEmployeeIds}
            placeholder={(optionsLoading && !optionsLoaded) || (buScopeActive && scopedEmployeesLoading) ? 'Loading…' : 'All Employees'}
            searchPlaceholder="Search employee..."
            className={SELECT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <MultiSelect
            options={clientOptions}
            value={clientIds}
            onValueChange={setClientIds}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className={SELECT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Project</Label>
          <MultiSelect
            options={projectOptions}
            value={projectIds}
            onValueChange={setProjectIds}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className={SELECT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service PO</Label>
          <MultiSelect
            options={servicePoOptions}
            value={servicePoIds}
            onValueChange={setServicePoIds}
            placeholder="All Service POs"
            searchPlaceholder="Search Service PO..."
            className={SELECT_CLASS}
          />
        </div>


        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">PO BU</Label>
          <MultiSelect
            options={poBuOptions}
            value={poBuIds}
            onValueChange={setPoBuIds}
            placeholder="All PO BUs"
            searchPlaceholder="Search BU..."
            className={SELECT_CLASS}
          />
        </div>

        {poSubBuOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">PO Sub-BU</Label>
            <MultiSelect
              options={poSubBuOptions}
              value={poSubBuIds}
              onValueChange={setPoSubBuIds}
              placeholder="All PO Sub-BUs"
              searchPlaceholder="Search Sub-BU..."
              className={SELECT_CLASS}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Work Type</Label>
          <Select value={workType} onValueChange={setWorkType}>
            <SelectTrigger className={SELECT_CLASS}><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORK_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <MultiSelect
            options={STATUS_OPTIONS}
            value={statuses}
            onValueChange={setStatuses}
            placeholder="All"
            searchPlaceholder="Search status..."
            className={SELECT_CLASS}
          />
        </div>
      </FilterPanel>

      {!periodReady ? (
        <EmptyState
          title="Select a period"
          description={periodMode === 'date' ? 'Choose a date to load this report.' : 'Choose a start and end date to load this report.'}
        />
      ) : isError && !data ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load the report"
          description={errorMessage}
          action={{ label: 'Retry', icon: RotateCcw, onClick: () => refetch() }}
        />
      ) : (
        <>
          {isError && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{errorMessage}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RotateCcw className="h-3.5 w-3.5" />Retry
              </Button>
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-[clamp(0.4rem,0.7vw,0.75rem)]">
            <StatPill tone="blue" label="Total Entries" value={totals.total_entries ?? 0} />
            <StatPill tone="violet" label="Employees" value={totals.total_employees ?? 0} />
            <StatPill tone="slate" label="Before Sync Hrs" value={hrs(totals.before_sync_hours) ?? '0.00'} />
            <StatPill tone="emerald" label="After Sync Hrs" value={hrs(totals.after_sync_hours) ?? '0.00'} />
            <StatPill
              tone="orange"
              label="Cross-BU Hrs"
              value={`${hrs(totals.cross_bu?.before_sync_hours) ?? '0.00'} / ${hrs(totals.cross_bu?.after_sync_hours) ?? '-'}`}
            />
            <StatPill tone="amber" label="Not Synced Entries" value={totals.not_synced_entries ?? 0} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <DataTable
              mobileCards
              columns={columns}
              data={records}
              isLoading={showLoading}
              emptyState={<EmptyState title="No work log entries found for the selected period and filters." />}
              pagination={total > 0 ? { page: Math.min(meta.page ?? page, Math.max(totalPages, 1)), limit: meta.limit ?? limit, total } : undefined}
              pageSizeOptions={PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default WorkLogSyncComparisonReport;
