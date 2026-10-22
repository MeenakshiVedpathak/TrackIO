import { useState, useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, AlertCircle, Download } from 'lucide-react';
import { reportsApi } from '@/api/reports.api';
import { downloadBlob } from '@/utils/download';
import { useNotification } from '@/hooks/useNotification';
import { Button } from '@/components/ui/button';
import { useEmployeeProjectUtilisation } from '@/hooks/useReports';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { formatHours, formatPercentage, formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const now = new Date();

const SORTABLE = {
  EMPLOYEE_NAME: 'employeeName',
  EMPLOYEE_CODE: 'employeeCode',
  PROJECT_NAME: 'projectName',
  LOGGED_HOURS: 'loggedHours',
  ADJUSTED_HOURS: 'adjustedHours',
  ORIGINAL_UTILIZATION: 'originalUtilizationPercentage',
  TOTAL_UTILIZATION: 'totalUtilizationPercentage',
};

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'ASC' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-foreground transition-colors',
        align === 'right' && 'justify-end w-full'
      )}
    >
      {label}
      <Icon className={cn('h-3 w-3', !isActive && 'opacity-40')} />
    </button>
  );
};

const HoursCell = ({ value }) => (value == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{formatHours(value)}</span>);

// Row key — employeeId + servicePoId (one row per Employee/Project pair). `__isGroupStart` is
// stamped onto each row once, up front (see `rows` in the component below), rather than
// recomputed per-cell from a row index — DataTable's `rowClassName` only ever receives
// `row.original`, not its position, so the flag has to already live on the record itself for the
// group-border styling and the name/%-blanking cells to agree on the exact same boundary.
const employeeIdOf = (row) => row?.employeeId ?? row?.employee_id;

// The two % columns are the employee's WHOLE-PERIOD totals, identical on every project row of
// that employee (never summed/averaged here) — consecutive same-employee rows merge into one
// real spanning cell (via DataTable's `meta.mergeGroup`) for Employee Name and both % columns,
// since the records already arrive sorted by employee by default.
const getColumns = (sortBy, sortOrder, onSort) => [
  columnHelper.accessor('employeeName', {
    header: () => <SortableHeader label="Employee Name" column={SORTABLE.EMPLOYEE_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
    size: 220,
    meta: { sticky: true, left: 0, mergeGroup: employeeIdOf },
    enableSorting: false,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium max-w-[200px]" title={r.employeeName}>{r.employeeName || '—'}</div>
          {r.employeeCode && <div className="font-mono text-[10px] text-muted-foreground">{r.employeeCode}</div>}
        </div>
      );
    },
  }),
  columnHelper.accessor('projectName', {
    header: () => <SortableHeader label="Project Name" column={SORTABLE.PROJECT_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
    size: 220,
    enableSorting: false,
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>
          {row.clientName && <div className="truncate text-[11px] text-muted-foreground max-w-[200px]" title={row.clientName}>{row.clientName}</div>}
        </div>
      );
    },
  }),
  columnHelper.accessor('loggedHours', {
    header: () => <SortableHeader label="Logged Hrs" column={SORTABLE.LOGGED_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 130,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('adjustedHours', {
    header: () => <SortableHeader label="Adjusted Hrs" column={SORTABLE.ADJUSTED_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 130,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('originalUtilizationPercentage', {
    header: () => <SortableHeader label="Original Util %" column={SORTABLE.ORIGINAL_UTILIZATION} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 150,
    meta: { align: 'right', mergeGroup: employeeIdOf },
    enableSorting: false,
    cell: ({ row }) => {
      const value = row.original.originalUtilizationPercentage;
      return value == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums font-medium">{formatPercentage(value, 2)}</span>;
    },
  }),
  columnHelper.accessor('totalUtilizationPercentage', {
    header: () => <SortableHeader label="Total Util % after Sync" column={SORTABLE.TOTAL_UTILIZATION} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 170,
    meta: { align: 'right', mergeGroup: employeeIdOf },
    enableSorting: false,
    cell: ({ row }) => {
      const value = row.original.totalUtilizationPercentage;
      return value == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums font-medium">{formatPercentage(value, 2)}</span>;
    },
  }),
];

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

const EmployeeProjectUtilisation = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [dateRange, setDateRange] = useState(null);

  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const { error: showError } = useNotification();
  const debouncedSearch = useDebounce(search, 400);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  // Records arrive sorted by employee by default — matches the row-grouping logic in getColumns.
  const [sortBy, setSortBy] = useState(SORTABLE.EMPLOYEE_NAME);
  const [sortOrder, setSortOrder] = useState('ASC');

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? monthYear?.month && monthYear?.year && { month: monthYear.month, year: monthYear.year }
      : dateRange?.startDate && dateRange?.endDate && { startDate: dateRange.startDate, endDate: dateRange.endDate }),
    ...(debouncedSearch && { search: debouncedSearch }),
    sortBy,
    sortOrder,
    page,
    limit,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(projectIds.length > 0 && { projectIds: projectIds.join(',') }),
    ...(serviceTypeIds.length > 0 && { serviceTypeIds: serviceTypeIds.join(',') }),
    ...(categoryIds.length > 0 && { categoryIds: categoryIds.join(',') }),
  };

  const { data, isPending, isError, error } = useEmployeeProjectUtilisation(params);
  const errorMessage = isError ? extractApiError(error) : null;

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  // Drives only the group-start top border now (the merged cells above compute their own grouping
  // directly from employeeIdOf via DataTable's `mergeGroup`), but still needs to agree with it on
  // where a new employee's block starts.
  const rows = useMemo(
    () => records.map((r, i) => ({ ...r, __isGroupStart: i === 0 || employeeIdOf(records[i - 1]) !== employeeIdOf(r) })),
    [records]
  );
  const summary = data?.data?.summary ?? null;
  const period = data?.data?.period ?? null;
  const meta = data?.meta ?? {};
  const showLoading = periodReady && isPending;

  const periodLabel = period?.startDate && period?.endDate
    ? `${formatDate(period.startDate)} - ${formatDate(period.endDate)}`
    : null;

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    employeeIds.length > 0,
    clientIds.length > 0,
    projectIds.length > 0,
    serviceTypeIds.length > 0,
    categoryIds.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setProjectIds([]);
    setServiceTypeIds([]);
    setCategoryIds([]);
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
    setPage(1);
  };

  // Every row matching the current filters, exported server-side — the table is server-paginated,
  // so the rest of the result set isn't in memory (page/limit are stripped, same as the other reports).
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { page: _p, limit: _l, ...exportParams } = params;
      const result = await reportsApi.exportEmployeeProjectUtilisation(exportParams);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const columns = getColumns(sortBy, sortOrder, handleSort);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Employee Project Utilisation"
        description={periodLabel ? `Showing: ${periodLabel}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee, code, or project…"
              className="w-full sm:w-64"
            />
            {periodReady && records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={isExporting}>
                <Download className="h-4 w-4" />{isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
            <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((p) => !p)} activeCount={activeFilterCount} />
          </div>
        }
      />

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <FilterPanel isOpen={filtersOpen} onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setProjectIds([]); setPage(1); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setProjectIds([]); setPage(1); }} />

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
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="Select month"
              clearable={false}
              className="w-full"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); setPage(1); }}
              placeholder="Select date range"
              className="w-full"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Employee</Label>
          <MultiSelect
            options={activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) }))}
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
          <Label className="text-xs">Project (Service PO)</Label>
          <MultiSelect
            options={activePOs.map((po) => ({ label: po.service_po_name || po.service_po_code || String(po.id), value: String(po.id) }))}
            value={projectIds}
            onValueChange={(v) => { setProjectIds(v); setPage(1); }}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service Type</Label>
          <MultiSelect
            options={activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) }))}
            value={serviceTypeIds}
            onValueChange={(v) => { setServiceTypeIds(v); setPage(1); }}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service Category</Label>
          <MultiSelect
            options={activeServiceCategories.map((sc) => ({ label: sc.name, value: String(sc.id) }))}
            value={categoryIds}
            onValueChange={(v) => { setCategoryIds(v); setPage(1); }}
            placeholder="All Categories"
            searchPlaceholder="Search category..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={rows}
        isLoading={showLoading}
        rowClassName={(row) => (row.__isGroupStart ? 'border-t-2 border-t-slate-200' : '')}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a period" description="Choose a month or a date range to load employee project utilisation." />
          ) : (
            <EmptyState title="No data for the selected filters." />
          )
        }
        pagination={periodReady && meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {/* Only Logged/Adjusted are summed here — the % columns are per-employee totals that would
          be meaningless summed or averaged across rows, so those cells are intentionally left
          blank rather than showing a number that looks like a real total but isn't one. */}
      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total (All Pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Employees" value={summary.employeeCount ?? 0} />
            <SummaryItem label="Logged Hrs" value={formatHours(summary.loggedHours)} />
            <SummaryItem label="Adjusted Hrs" value={formatHours(summary.adjustedHours)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeProjectUtilisation;
