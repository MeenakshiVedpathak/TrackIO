import { useState, useEffect, useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, AlertCircle } from 'lucide-react';
import { useCrossBuEmployeePoHours } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { downloadBlob } from '@/utils/download';
import { formatHours, formatPercentage, formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();
const now = new Date();

const WORK_TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'Own BU' },
  { value: 'cross', label: 'Cross BU' },
];

const WORK_TYPE_BADGE = {
  own: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  cross: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  na: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
};

// Server-side sort keys the endpoint accepts.
const SORTABLE = {
  EMPLOYEE: 'employee',
  PO: 'po',
  HOURS: 'hours',
  WORK_TYPE: 'work_type',
};

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn('inline-flex items-center gap-1 hover:text-foreground transition-colors', align === 'right' && 'justify-end w-full')}
    >
      {label}
      <Icon className={cn('h-3 w-3', !isActive && 'opacity-40')} />
    </button>
  );
};

// Colored-pill summary chips — same style ProjectWiseTimesheetReport/MonthlyResourceUtilization
// already use for their own stat rows: a tinted rounded pill per metric, label in the tone color,
// value bold, flex-wrapping as a row (fluid clamp() sizing, see ui/button.jsx's own comment).
const STAT_TONES = {
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
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

const CrossBuEmployeePoHoursReport = () => {
  const { error: showError } = useNotification();

  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [dateRange, setDateRange] = useState(null);

  // Employee BU/Sub-BU and Service PO BU are two INDEPENDENT filters — never merged into one
  // control or one param. BusinessUnitFilter itself always returns one combined
  // [...parentIds, ...childIds] array; the Employee side splits that back into
  // employee_bu_ids/employee_sub_bu_ids below (two real params the backend expects separately),
  // while the PO side sends its combined array as the single po_bu_ids param the backend expects.
  const [employeeBuValue, setEmployeeBuValue] = useState([]);
  const [poBuValue, setPoBuValue] = useState([]);
  const { units: allBuUnits } = useSelectableBusinessUnits();
  const rootBuIdSet = useMemo(
    () => new Set(allBuUnits.filter((u) => u.parentId == null).map((u) => String(u.id))),
    [allBuUnits]
  );
  const splitBuIds = (ids) => ({
    root: ids.filter((id) => rootBuIdSet.has(String(id))),
    sub: ids.filter((id) => !rootBuIdSet.has(String(id))),
  });

  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [servicePoIds, setServicePoIds] = useState([]);
  const [workType, setWorkType] = useState('all');
  const [approvalStatus, setApprovalStatus] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(SORTABLE.HOURS);
  const [sortOrder, setSortOrder] = useState('desc');
  const [isExporting, setIsExporting] = useState(false);
  const [hoursSource, setHoursSource] = useState('M');
  const canViewOriginal = useCanViewOriginalData();

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  const empScope = useMemo(() => ({ entityIds: [], businessUnitIds: employeeBuValue }), [employeeBuValue]);
  const poScope = useMemo(() => ({ entityIds: [], businessUnitIds: poBuValue }), [poBuValue]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, empScope);
  const { data: activeClients = [] } = useActiveClients(poScope);
  const { data: activeServicePOs = [] } = useActiveServicePOs(true, undefined, poScope);

  // Client -> Project -> Service PO cascade — each active Service PO already nests its own Project
  // and Client, same derivation ProjectWiseTimesheetReport's own filters use.
  const spoList = useMemo(() => (Array.isArray(activeServicePOs) ? activeServicePOs : []), [activeServicePOs]);
  const spoByClient = useMemo(
    () => (clientIds.length ? spoList.filter((po) => clientIds.includes(String(po.client?.id))) : spoList),
    [spoList, clientIds]
  );
  const projectOptions = useMemo(() => {
    const seen = new Map();
    spoByClient.forEach((po) => {
      if (po.project?.id != null && !seen.has(String(po.project.id))) {
        seen.set(String(po.project.id), po.project.project_name);
      }
    });
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [spoByClient]);
  const spoByProject = useMemo(
    () => (projectIds.length ? spoByClient.filter((po) => projectIds.includes(String(po.project?.id))) : spoByClient),
    [spoByClient, projectIds]
  );
  const servicePoOptions = useMemo(
    () => spoByProject.map((po) => ({
      value: String(po.id),
      label: po.service_po_code ? `${po.service_po_name} (${po.service_po_code})` : po.service_po_name,
    })),
    [spoByProject]
  );

  // Narrowing a broader level drops any lower-level picks that fell outside the new option set.
  useEffect(() => {
    const valid = new Set(projectOptions.map((o) => o.value));
    setProjectIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIds]);
  useEffect(() => {
    const valid = new Set(servicePoOptions.map((o) => o.value));
    setServicePoIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIds, projectIds]);

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const { root: employeeBuIds, sub: employeeSubBuIds } = splitBuIds(employeeBuValue);

  const params = useMemo(() => {
    const p = {
      page,
      limit,
      sort_by: sortBy,
      sort_order: sortOrder,
      work_type: workType,
      approval_status: approvalStatus.length > 0 ? approvalStatus.join(',') : 'all',
      // Always sent so getReport drops the navbar's globally-active BU header — both BU axes
      // below narrow the result as real query params instead (see explicitBuScope).
      buId: ALL_BUS,
    };
    if (hoursSource === 'O') p.hoursSource = 'O';
    if (periodMode === 'month') {
      p.month = monthYear.month;
      p.year = monthYear.year;
    } else if (dateRange?.startDate && dateRange?.endDate) {
      p.start_date = dateRange.startDate;
      p.end_date = dateRange.endDate;
    }
    if (employeeIds.length) p.employee_ids = employeeIds.join(',');
    if (employeeBuIds.length) p.employee_bu_ids = employeeBuIds.join(',');
    if (employeeSubBuIds.length) p.employee_sub_bu_ids = employeeSubBuIds.join(',');
    if (clientIds.length) p.client_ids = clientIds.join(',');
    if (projectIds.length) p.project_ids = projectIds.join(',');
    if (servicePoIds.length) p.service_po_ids = servicePoIds.join(',');
    if (poBuValue.length) p.po_bu_ids = poBuValue.join(',');
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    return p;
  }, [
    page, limit, sortBy, sortOrder, workType, approvalStatus, periodMode, monthYear, dateRange,
    hoursSource, employeeIds, employeeBuIds, employeeSubBuIds, clientIds, projectIds, servicePoIds, poBuValue,
    debouncedSearch,
  ]);

  const { data, isPending, isError, error } = useCrossBuEmployeePoHours(periodReady ? params : undefined);
  const errorMessage = isError ? extractApiError(error) : null;

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const totals = data?.data?.totals ?? {};
  const period = data?.data?.period ?? null;
  const meta = data?.meta ?? {};
  const showLoading = periodReady && isPending;

  const periodLabel = period?.start_date && period?.end_date
    ? `${formatDate(period.start_date)} - ${formatDate(period.end_date)}`
    : null;

  const activeFilterCount = [
    employeeIds.length > 0,
    employeeBuValue.length > 0,
    clientIds.length > 0,
    projectIds.length > 0,
    servicePoIds.length > 0,
    poBuValue.length > 0,
    workType !== 'all',
    approvalStatus.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEmployeeIds([]);
    setEmployeeBuValue([]);
    setClientIds([]);
    setProjectIds([]);
    setServicePoIds([]);
    setPoBuValue([]);
    setWorkType('all');
    setApprovalStatus([]);
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { page: _p, limit: _l, ...exportParams } = params;
      const result = await reportsApi.downloadCrossBuEmployeePoHours(exportParams);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'employee',
      header: () => <SortableHeader label="Employee" column={SORTABLE.EMPLOYEE} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />,
      size: 200,
      meta: { sticky: true, left: 0 },
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block truncate text-sm font-medium" title={row.original.employee_name}>{row.original.employee_name || '—'}</span>
      ),
    }),
    columnHelper.accessor('employee_bu', {
      header: 'Employee BU',
      size: 160,
      enableSorting: false,
      cell: (info) => <span className="block max-w-[150px] truncate text-sm" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('employee_sub_bu', {
      header: 'Sub-BU',
      size: 140,
      enableSorting: false,
      cell: (info) => (info.getValue()
        ? <span className="block max-w-[130px] truncate text-sm text-muted-foreground" title={info.getValue()}>{info.getValue()}</span>
        : <span className="text-muted-foreground">—</span>),
    }),
    columnHelper.accessor('client_name', {
      header: 'Client',
      size: 160,
      enableSorting: false,
      cell: (info) => <span className="block max-w-[150px] truncate text-sm" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('project_name', {
      header: 'Project',
      size: 160,
      enableSorting: false,
      cell: (info) => <span className="block max-w-[150px] truncate text-sm" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.display({
      id: 'service_po',
      header: () => <SortableHeader label="Service PO" column={SORTABLE.PO} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />,
      size: 200,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="block truncate text-sm font-medium" title={r.service_po_name}>{r.service_po_name || '—'}</span>
        );
      },
    }),
    columnHelper.accessor('po_bu', {
      header: 'PO BU',
      size: 160,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return <span className="block truncate text-sm" title={r.po_bu}>{r.po_bu || '—'}</span>;
      },
    }),
    columnHelper.display({
      id: 'hours',
      header: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span><SortableHeader label="Original Hours" column={SORTABLE.HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" /></span>
          </TooltipTrigger>
          <TooltipContent>Original hours as entered by the employee (before any adjustment)</TooltipContent>
        </Tooltip>
      ),
      size: 110,
      meta: { align: 'right' },
      enableSorting: false,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatHours(row.original.logged_hours)}</span>
      ),
    }),
    // Always-visible, never toggled by the Adjusted/Original source switch above (hoursSource) —
    // that switch changes which figure the "Hours" column itself shows; this is a separate,
    // dedicated column for the new adjusted_hours field, null (not yet synced) rendered as an
    // em dash rather than falling back to logged_hours, so "not synced" stays visibly distinct
    // from "synced with 0 adjusted hours".
    columnHelper.display({
      id: 'adjusted_hours',
      header: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block text-right font-medium">Adjusted Hours</span>
          </TooltipTrigger>
          <TooltipContent>Hours after monthly-cap adjustment (synced work only)</TooltipContent>
        </Tooltip>
      ),
      size: 130,
      meta: { align: 'right' },
      enableSorting: false,
      cell: ({ row }) => {
        const val = row.original.adjusted_hours;
        if (val == null) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="tabular-nums text-muted-foreground cursor-default">—</span>
              </TooltipTrigger>
              <TooltipContent>Not synced yet - adjusted hours are available after sync</TooltipContent>
            </Tooltip>
          );
        }
        return <span className="tabular-nums">{formatHours(val)}</span>;
      },
    }),
    columnHelper.display({
      id: 'work_type',
      header: () => <SortableHeader label="Work Type" column={SORTABLE.WORK_TYPE} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />,
      size: 140,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return <Badge className={cn('text-[10px]', WORK_TYPE_BADGE[r.work_type] ?? WORK_TYPE_BADGE.na)}>{r.work_type_label || r.work_type}</Badge>;
      },
    }),
    columnHelper.display({
      id: 'month',
      header: 'Month',
      size: 100,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return r.month && r.year ? <span className="whitespace-nowrap text-sm">{String(r.month).padStart(2, '0')}/{r.year}</span> : '—';
      },
    }),
  ], [sortBy, sortOrder]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Cross-BU Employee & PO Hours"
        description={periodLabel ? `Showing: ${periodLabel}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee or Service PO…"
              className="w-full sm:w-64"
            />
            <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((p) => !p)} activeCount={activeFilterCount} />
            {periodReady && records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={isExporting}>
                <Download className="h-4 w-4" />{isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={workType} onValueChange={(v) => { setWorkType(v); setPage(1); }}>
          <TabsList className="bg-slate-100">
            {WORK_TYPE_TABS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="text-xs font-semibold data-[state=active]:bg-white">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {canViewOriginal && (
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5 text-xs">
            {['M', 'O'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setHoursSource(val)}
                className={cn(
                  'rounded-md px-3 py-1 font-semibold transition-colors',
                  hoursSource === val ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {val === 'O' ? 'Original' : 'Adjusted'}
              </button>
            ))}
          </div>
        )}
      </div>

      <FilterPanel isOpen={filtersOpen} onClear={clearFilters} showClear={activeFilterCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Period</Label>
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white">Month</TabsTrigger>
              <TabsTrigger value="range" className="text-xs font-semibold data-[state=active]:bg-white">Date Range</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            {periodMode === 'month' ? 'Month & Year' : 'Date Range'} <span className="text-destructive">*</span>
          </Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(v) => { if (v) { setMonthYear(v); setPage(1); } }}
              clearable={false}
              className="w-full"
            />
          ) : (
            <DateRangePicker value={dateRange} onChange={(v) => { setDateRange(v); setPage(1); }} className="w-full" />
          )}
        </div>

        {/* Employee BU and Service PO BU are two separate BusinessUnitFilter instances — never a
            single shared control — since the backend treats them as independent axes
            (employee_bu_ids/employee_sub_bu_ids vs po_bu_ids). */}
        <BusinessUnitFilter multiple label="Employee BU" value={employeeBuValue} onChange={(v) => { setEmployeeBuValue(v); setEmployeeIds([]); setPage(1); }} />
        <BusinessUnitFilter multiple label="Service PO BU" value={poBuValue} onChange={(v) => { setPoBuValue(v); setClientIds([]); setProjectIds([]); setServicePoIds([]); setPage(1); }} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Employee</Label>
          <MultiSelect
            options={activeEmployees.map((e) => ({ label: `${e.full_name} (${e.employee_code})`, value: String(e.id) }))}
            value={employeeIds}
            onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <MultiSelect
            options={activeClients.map((c) => ({ label: c.client_name, value: String(c.id) }))}
            value={clientIds}
            onValueChange={(v) => { setClientIds(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Project</Label>
          <MultiSelect
            options={projectOptions}
            value={projectIds}
            onValueChange={(v) => { setProjectIds(v); setPage(1); }}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service PO</Label>
          <MultiSelect
            options={servicePoOptions}
            value={servicePoIds}
            onValueChange={(v) => { setServicePoIds(v); setPage(1); }}
            placeholder="All Service POs"
            searchPlaceholder="Search Service PO..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Approval Status</Label>
          <MultiSelect
            options={[
              { label: 'Pending', value: 'pending' },
              { label: 'Approved', value: 'approved' },
              { label: 'Rejected', value: 'rejected' },
            ]}
            value={approvalStatus}
            onValueChange={(v) => { setApprovalStatus(v); setPage(1); }}
            placeholder="All"
            searchPlaceholder="Search status..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
      </FilterPanel>

      {!periodReady ? (
        <EmptyState title="Select a period" description="Choose a month or a date range to load this report." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-[clamp(0.4rem,0.7vw,0.75rem)]">
            <StatPill
              tone="blue"
              label="Total Employees"
              value={totals.cross_bu_employee_count != null
                ? `${totals.total_employees ?? 0} (${totals.cross_bu_employee_count} cross-BU)`
                : (totals.total_employees ?? 0)}
            />
            <StatPill tone="violet" label="Total Hours" value={formatHours(totals.total_hours)} />
            <StatPill tone="blue" label="Adjusted Hours" value={formatHours(totals.adjusted_total_hours ?? 0)} />
            <StatPill
              tone="emerald"
              label="Own BU"
              value={totals.own_bu_percent != null
                ? `${formatHours(totals.own_bu_hours)} (${formatPercentage(totals.own_bu_percent, 2)})`
                : formatHours(totals.own_bu_hours)}
            />
            <StatPill
              tone="amber"
              label="Cross BU"
              value={totals.cross_bu_percent != null
                ? `${formatHours(totals.cross_bu_hours)} (${formatPercentage(totals.cross_bu_percent, 2)})`
                : formatHours(totals.cross_bu_hours)}
            />
            <StatPill tone="slate" label="Not Classified" value={formatHours(totals.unclassified_hours)} />
          </div>


          <DataTable
            mobileCards
            columns={columns}
            data={records}
            isLoading={showLoading}
            emptyState={<EmptyState title="No data for the selected filters." />}
            pagination={meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
          />
        </>
      )}
    </div>
  );
};

export default CrossBuEmployeePoHoursReport;
