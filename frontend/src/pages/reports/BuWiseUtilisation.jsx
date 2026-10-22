import { useState, useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, AlertCircle, Download } from 'lucide-react';
import { reportsApi } from '@/api/reports.api';
import { downloadBlob } from '@/utils/download';
import { useNotification } from '@/hooks/useNotification';
import { Button } from '@/components/ui/button';
import { useBuWiseUtilisation } from '@/hooks/useReports';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
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

// Server-side sort keys the endpoint accepts.
const SORTABLE = {
  BU_NAME: 'buName',
  EMPLOYEE_COUNT: 'employeeCount',
  EXPECTED_HOURS: 'expectedHours',
  BILLABLE_HOURS: 'billableHours',
  NON_BILLABLE_HOURS: 'nonBillableHours',
  CUSTOMER_NON_BILLABLE_HOURS: 'customerNonBillableHours',
  TOTAL_LOGGED_HOURS: 'totalLoggedHours',
  UTILIZATION: 'utilizationPercentage',
};

const utilizationColorClass = (value) => {
  if (value == null) return 'text-muted-foreground';
  const num = Number(value);
  if (num >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (num >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
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

// A BU with no logged hours still has every hour field at 0, not null — render zeros plainly
// rather than treating them the same as a genuinely missing value (only null/undefined -> '—').
const HoursCell = ({ value }) => (value == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{formatHours(value)}</span>);

// First column handles two visual modes: a BU row (expand chevron + bold name) and a child
// Sub-BU row (indented, muted, no chevron). All other columns work the same for both levels
// since child rows have the same numeric fields as BU rows.
const getColumns = (sortBy, sortOrder, onSort, expandedBuIds, onToggleExpand) => [
  columnHelper.display({
    id: 'name',
    header: () => <SortableHeader label="BU Name" column={SORTABLE.BU_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
    size: 240,
    meta: { sticky: true, left: 0 },
    cell: (info) => {
      const row = info.row.original;
      if (row._isChild) {
        return (
          <div className="flex items-center gap-1 pl-6 min-w-0">
            <span className="shrink-0 text-[11px] text-muted-foreground/50">└</span>
            <div className="truncate text-xs text-muted-foreground max-w-[185px]" title={row._label}>
              {row._label}
            </div>
          </div>
        );
      }
      const buId = row.buId;
      const isExpanded = expandedBuIds.has(buId);
      return (
        <div className="flex items-center gap-1 min-w-0">
          {row.hasSubBus ? (
            <button
              type="button"
              onClick={() => onToggleExpand(buId)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted"
            >
              {isExpanded
                ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <div className="truncate font-medium max-w-[190px]" title={row.buName}>{row.buName || '—'}</div>
        </div>
      );
    },
  }),
  columnHelper.accessor('totalEmployees', {
    header: () => <SortableHeader label="Total Employees" column={SORTABLE.EMPLOYEE_COUNT} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 150,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? 0}</span>,
  }),
  columnHelper.accessor('expectedHours', {
    header: () => <SortableHeader label="Expected Hrs" column={SORTABLE.EXPECTED_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 140,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('billableHours', {
    header: () => <SortableHeader label="Billable Hrs" column={SORTABLE.BILLABLE_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 140,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('nonBillableHours', {
    header: () => <SortableHeader label="Non-Billable Hrs" column={SORTABLE.NON_BILLABLE_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 160,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('customerNonBillableHours', {
    header: () => <SortableHeader label="Customer Non-Billable Hrs" column={SORTABLE.CUSTOMER_NON_BILLABLE_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 200,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('totalLoggedHours', {
    header: () => <SortableHeader label="Total Logged Hrs" column={SORTABLE.TOTAL_LOGGED_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 160,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('utilizationPercentage', {
    header: () => <SortableHeader label="Utilisation %" column={SORTABLE.UTILIZATION} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 140,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue();
      if (value == null) return <span className="text-muted-foreground">—</span>;
      return <span className={cn('tabular-nums font-medium', utilizationColorClass(value))}>{formatPercentage(value, 2)}</span>;
    },
  }),
  // notLoggedHours = Expected Hrs - Total Logged Hrs (never negative), computed server-side.
  columnHelper.accessor('notLoggedHours', {
    header: 'Not Logged Hrs',
    size: 150,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
];

const normalizeRow = (r) => ({
  ...r,
  buId: r.buId ?? r.bu_id,
  buName: r.buName ?? r.bu_name,
  subBuName: r.subBuName ?? r.sub_bu_name,
  totalEmployees: r.totalEmployees ?? r.total_employees,
  expectedHours: r.expectedHours ?? r.expected_hours,
  billableHours: r.billableHours ?? r.billable_hours,
  nonBillableHours: r.nonBillableHours ?? r.non_billable_hours,
  customerNonBillableHours: r.customerNonBillableHours ?? r.customer_non_billable_hours,
  totalLoggedHours: r.totalLoggedHours ?? r.total_logged_hours,
  utilizationPercentage: r.utilizationPercentage ?? r.utilization_percentage,
  notLoggedHours: r.notLoggedHours ?? r.not_logged_hours,
  hasSubBus: r.hasSubBus ?? r.has_sub_bus ?? false,
  isDirect: r.isDirect ?? r.is_direct ?? false,
  subBus: (r.subBus ?? r.sub_bus ?? []).map(normalizeRow),
});

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

const BuWiseUtilisation = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [dateRange, setDateRange] = useState(null);

  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const { error: showError } = useNotification();
  const debouncedSearch = useDebounce(search, 400);

  // '' = Adjusted (after sync, default); 'O' = Original (as logged, before monthly cap).
  const [hoursSource, setHoursSource] = useState('');

  // Expand/collapse per BU row. Collapsed by default — the hierarchy is opt-in.
  const [expandedBuIds, setExpandedBuIds] = useState(() => new Set());
  const toggleExpand = (buId) => setExpandedBuIds((prev) => {
    const next = new Set(prev);
    next.has(buId) ? next.delete(buId) : next.add(buId);
    return next;
  });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(SORTABLE.UTILIZATION);
  const [sortOrder, setSortOrder] = useState('DESC');

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? monthYear?.month && monthYear?.year && { month: monthYear.month, year: monthYear.year }
      : dateRange?.startDate && dateRange?.endDate && { startDate: dateRange.startDate, endDate: dateRange.endDate }),
    ...(hoursSource === 'O' && { hoursSource: 'O' }),
    groupBy: 'hierarchy',
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
  };

  const { data, isPending, isError, error } = useBuWiseUtilisation(params);
  const errorMessage = isError ? extractApiError(error) : null;

  const rawRecords = Array.isArray(data?.data?.records) ? data.data.records : [];
  const records = useMemo(() => rawRecords.map(normalizeRow), [rawRecords]);

  // Flat display list: BU rows with their Sub-BU children injected when expanded.
  // Pagination/sort/search act on BU rows only (server-side); children are always in-memory.
  const displayRows = useMemo(() => {
    const rows = [];
    records.forEach((bu) => {
      rows.push({ ...bu, _isChild: false, _label: bu.buName });
      if (bu.hasSubBus && expandedBuIds.has(bu.buId)) {
        (bu.subBus ?? []).forEach((sub) => {
          rows.push({
            ...sub,
            _isChild: true,
            _label: sub.isDirect ? '(BU level)' : (sub.subBuName || sub.buName || '—'),
          });
        });
      }
    });
    return rows;
  }, [records, expandedBuIds]);

  const rawSummary = data?.data?.summary ?? null;
  const summary = useMemo(() => {
    if (!rawSummary) return null;
    return {
      ...rawSummary,
      buCount: rawSummary.buCount ?? rawSummary.bu_count ?? null,
      subBuCount: rawSummary.subBuCount ?? rawSummary.sub_bu_count ?? null,
      totalEmployees: rawSummary.totalEmployees ?? rawSummary.total_employees,
      expectedHours: rawSummary.expectedHours ?? rawSummary.expected_hours,
      billableHours: rawSummary.billableHours ?? rawSummary.billable_hours,
      nonBillableHours: rawSummary.nonBillableHours ?? rawSummary.non_billable_hours,
      customerNonBillableHours: rawSummary.customerNonBillableHours ?? rawSummary.customer_non_billable_hours,
      totalLoggedHours: rawSummary.totalLoggedHours ?? rawSummary.total_logged_hours,
      utilizationPercentage: rawSummary.utilizationPercentage ?? rawSummary.utilization_percentage,
      notLoggedHours: rawSummary.notLoggedHours ?? rawSummary.not_logged_hours,
    };
  }, [rawSummary]);

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
    hoursSource !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setProjectIds([]);
    setServiceTypeIds([]);
    setHoursSource('');
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
      const result = await reportsApi.exportBuWiseUtilisation(exportParams);
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

  const columns = getColumns(sortBy, sortOrder, handleSort, expandedBuIds, toggleExpand);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="BU-wise Utilisation"
        description={periodLabel ? `Showing: ${periodLabel}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search BU or Sub BU name…"
              className="w-full sm:w-56"
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
          <Label className="text-xs font-medium">Hours basis</Label>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted border w-fit">
            {[
              { value: '', label: 'Adjusted' },
              { value: 'O', label: 'Original' },
            ].map(({ value, label }) => (
              <button
                key={value || 'adjusted'}
                type="button"
                onClick={() => { setHoursSource(value); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 whitespace-nowrap',
                  hoursSource === value ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {hoursSource === 'O' ? 'Original (as logged, before the monthly cap)' : 'Adjusted (after sync)'}
          </span>
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
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={displayRows}
        isLoading={showLoading}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a period" description="Choose a month or a date range to load BU-wise utilisation." />
          ) : (
            <EmptyState title="No data for the selected filters." />
          )
        }
        pagination={periodReady && meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {/* Covers every matching BU row across every page (the backend's own `summary`) — never
          add child rows to it, as the summary is already computed over BU rows only. */}
      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Total (All Pages) · {hoursSource === 'O' ? 'Original' : 'Adjusted'}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {summary.buCount != null && <SummaryItem label="Total BUs" value={summary.buCount} />}
            {summary.subBuCount != null && <SummaryItem label="Total Sub BUs" value={summary.subBuCount} />}
            <SummaryItem label="Total Employees" value={summary.totalEmployees ?? 0} />
            <SummaryItem label="Expected Hrs" value={formatHours(summary.expectedHours)} />
            <SummaryItem label="Billable Hrs" value={formatHours(summary.billableHours)} />
            <SummaryItem label="Non-Billable Hrs" value={formatHours(summary.nonBillableHours)} />
            <SummaryItem label="Customer Non-Billable Hrs" value={formatHours(summary.customerNonBillableHours)} />
            <SummaryItem label="Total Logged Hrs" value={formatHours(summary.totalLoggedHours)} />
            <SummaryItem label="Utilisation %" value={summary.utilizationPercentage != null ? formatPercentage(summary.utilizationPercentage, 2) : '—'} />
            <SummaryItem label="Not Logged Hrs" value={formatHours(summary.notLoggedHours)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default BuWiseUtilisation;
