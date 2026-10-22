import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from 'lucide-react';
import { useResourceUtilizationTrend } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { formatHours, formatPercentage, formatNumber } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// Filter labels read as uppercase micro-labels, echoing the data table's own column headers so
// the panel and the table below it look like one surface (same treatment as ClientWiseAnalytics).
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

// 'weekly' shares the same `dateRange` state as 'range' below — WeekPicker just snaps selection
// to a Mon-Sat business week instead of two free clicks, emitting the identical
// {startDate, endDate} shape, so periodReady/params need no separate weekly case.
const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'range', label: 'Date Range' },
];

// Server-side sort keys the endpoint accepts. Anything outside this set is a 422, so the
// SortableHeader columns below are limited to exactly these.
const SORTABLE = {
  UTILIZATION: 'utilization_percentage',
  TOTAL_HOURS: 'total_hours',
  BILLABLE_HOURS: 'billable_hours',
  RESOURCE: 'full_name',
};

// Same emerald/amber/destructive vocabulary the other utilization reports use for
// healthy / caution / under-utilized.
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

// enableSorting is false throughout: sorting is the SERVER's (sortBy/sortOrder), so TanStack must
// not also reorder the page it was handed — the header buttons drive the request instead.
const getColumns = (sortBy, sortOrder, onSort, { hasOrigTotalHours, hasOrigBillableHours, hasOrigUtilization } = {}) => [
  columnHelper.accessor('month', {
    header: 'Month',
    size: 110,
    enableSorting: false,
    cell: (info) => <span className="font-medium whitespace-nowrap">{info.getValue() || '—'}</span>,
  }),
  columnHelper.accessor('full_name', {
    header: () => (
      <SortableHeader label="Resource" column={SORTABLE.RESOURCE} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
    ),
    size: 240,
    enableSorting: false,
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium max-w-[220px]" title={row.full_name}>
            {row.full_name || '—'}
          </div>
          {row.employee_code && (
            <div className="font-mono text-[10px] text-muted-foreground">{row.employee_code}</div>
          )}
        </div>
      );
    },
  }),
  columnHelper.accessor('total_hours', {
    header: () => (
      <SortableHeader label="Total Hours" column={SORTABLE.TOTAL_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 140,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  ...(hasOrigTotalHours ? [
    columnHelper.accessor('original_total_hours', {
      header: 'Original Total Hours',
      size: 160,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const val = info.getValue();
        return <span className="tabular-nums text-muted-foreground">{val != null ? formatHours(val) : '—'}</span>;
      },
    }),
  ] : []),
  columnHelper.accessor('billable_hours', {
    header: () => (
      <SortableHeader label="Billable Hours" column={SORTABLE.BILLABLE_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 150,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  ...(hasOrigBillableHours ? [
    columnHelper.accessor('original_billable_hours', {
      header: 'Original Billable Hours',
      size: 170,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const val = info.getValue();
        return <span className="tabular-nums text-muted-foreground">{val != null ? formatHours(val) : '—'}</span>;
      },
    }),
  ] : []),
  columnHelper.accessor('utilization_percentage', {
    header: () => (
      <SortableHeader label="Utilization %" column={SORTABLE.UTILIZATION} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 150,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
      return (
        <span className={cn('tabular-nums font-medium', utilizationColorClass(value))}>
          {formatPercentage(value, 2)}
        </span>
      );
    },
  }),
  ...(hasOrigUtilization ? [
    columnHelper.accessor('original_utilization_percentage', {
      header: 'Original Utilization %',
      size: 170,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
        return (
          <span className={cn('tabular-nums font-medium', utilizationColorClass(value))}>
            {formatPercentage(value, 2)}
          </span>
        );
      },
    }),
  ] : []),
];

const exportToExcel = (rows) => {
  const hasOrigTotalHours = rows.some((r) => r.original_total_hours != null);
  const hasOrigBillableHours = rows.some((r) => r.original_billable_hours != null);
  const hasOrigUtilization = rows.some((r) => r.original_utilization_percentage != null);

  const header = [
    'Month',
    'Employee Code',
    'Resource',
    'Total Hours',
    ...(hasOrigTotalHours ? ['Original Total Hours'] : []),
    'Billable Hours',
    ...(hasOrigBillableHours ? ['Original Billable Hours'] : []),
    'Utilization %',
    ...(hasOrigUtilization ? ['Original Utilization %'] : []),
  ];
  const dataRows = rows.map((r) => [
    r.month ?? '',
    r.employee_code ?? '',
    r.full_name ?? '',
    r.total_hours != null ? Number(r.total_hours) : '',
    ...(hasOrigTotalHours ? [r.original_total_hours != null ? Number(r.original_total_hours) : ''] : []),
    r.billable_hours != null ? Number(r.billable_hours) : '',
    ...(hasOrigBillableHours ? [r.original_billable_hours != null ? Number(r.original_billable_hours) : ''] : []),
    r.utilization_percentage != null ? Number(r.utilization_percentage) : '',
    ...(hasOrigUtilization ? [r.original_utilization_percentage != null ? Number(r.original_utilization_percentage) : ''] : []),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resource Utilization Trend');
  XLSX.writeFile(wb, 'Resource_Utilization_Trend.xlsx');
};

const ResourceUtilizationTrend = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [dateRange, setDateRange] = useState(null);

  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  // Multi-select — backend support for entityIds/businessUnitIds has landed on this report
  // specifically (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md).
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [hoursSource, setHoursSource] = useState('M');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(SORTABLE.UTILIZATION);
  const [sortOrder, setSortOrder] = useState('DESC');

  const canViewOriginal = useCanViewOriginalData();
  const { roleObjects } = useAuth();

  // Original hours are a privileged view; if the permission is lost mid-session the toggle
  // disappears and the request must fall back to Published rather than keep asking for 'O'.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);


  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();

  const periodReady =
    periodMode === 'month'
      ? !!(monthYear?.month && monthYear?.year)
      : !!(dateRange?.startDate && dateRange?.endDate);

  // Exactly one date mode reaches the backend — sending both (or neither) is a 422, which the
  // hook's `enabled` gate already prevents by holding the request.
  const params = {
    ...(periodMode === 'month'
      ? monthYear?.month && monthYear?.year && { month: monthYear.month, year: monthYear.year }
      : dateRange?.startDate && dateRange?.endDate && { startDate: dateRange.startDate, endDate: dateRange.endDate }),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(serviceTypeIds.length > 0 && { serviceTypeIds: serviceTypeIds.join(',') }),
    hoursSource,
    ...(roleObjects?.[0]?.id && { roleId: roleObjects[0].id }),
    sortBy,
    sortOrder,
    page,
    limit,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useResourceUtilizationTrend(params);

  const records = Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};
  const showLoading = periodReady && isPending;

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    employeeIds.length > 0,
    clientIds.length > 0,
    poIds.length > 0,
    serviceTypeIds.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setPoIds([]);
    setServiceTypeIds([]);
    setPage(1);
  };

  // Toggling the same column flips direction; a new column starts DESC, which puts the most
  // interesting rows (highest utilization/hours) first.
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
    setPage(1);
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  // Exports the current page only — this report is server-paginated, so the rest of the result
  // set is not in memory.
  const handleExport = () => exportToExcel(records);

  const hasOrigTotalHours = useMemo(() => records.some((r) => r.original_total_hours != null), [records]);
  const hasOrigBillableHours = useMemo(() => records.some((r) => r.original_billable_hours != null), [records]);
  const hasOrigUtilization = useMemo(() => records.some((r) => r.original_utilization_percentage != null), [records]);

  const columns = useMemo(() => {
    return getColumns(sortBy, sortOrder, handleSort, {
      hasOrigTotalHours,
      hasOrigBillableHours,
      hasOrigUtilization,
    });
  }, [sortBy, sortOrder, hasOrigTotalHours, hasOrigBillableHours, hasOrigUtilization]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Utilization Trend"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewOriginal && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border shrink-0">
                {[
                  { value: 'O', label: 'Original' },
                  { value: 'M', label: 'Published' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setHoursSource(value); setPage(1); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                      hoursSource === value ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[440px]"
        gridClassName="items-end gap-x-[clamp(0.5rem,0.8vw,0.75rem)] gap-y-[clamp(0.625rem,1vw,0.875rem)] rounded-xl border-slate-200/80 bg-slate-50/70 p-[clamp(0.5rem,0.8vw,0.75rem)] shadow-sm"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter
          multiple
          value={entityIds}
          onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setPoIds([]); setPage(1); }}
          labelClassName={FILTER_LABEL}
        />

        <BusinessUnitFilter
          multiple
          value={buIds}
          entityId={entityIds}
          onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setPoIds([]); setPage(1); }}
          labelClassName={FILTER_LABEL}
        />

        {/* Period mode and its picker take one grid cell each, rather than sharing a single
            md:col-span-2 cell: a picker stretched across two columns dwarfed every neighbouring
            control, and split this way all six filters sit on the same column rhythm. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
            <TabsList className="grid w-full grid-cols-3 border border-input bg-slate-100">
              {PERIOD_MODES.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="text-xs font-semibold data-[state=active]:bg-white"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* The required marker belongs on the value, not the mode toggle above — the toggle
            always holds one of its three values, so it is the picker that can be left unset. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>
            {periodMode === 'month' ? 'Month & Year' : periodMode === 'weekly' ? 'Week' : 'Date Range'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="Select month"
              clearable={false}
              className="w-full"
            />
          ) : periodMode === 'weekly' ? (
            <WeekPicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); setPage(1); }}
              placeholder="Select week"
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
          <Label className={FILTER_LABEL}>Resource</Label>
          <MultiSelect
            options={[
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
            ]}
            value={employeeIds}
            onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
            placeholder="All Resources"
            searchPlaceholder="Search resource..."
            className="bg-white h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <MultiSelect
            options={[
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientIds}
            onValueChange={(v) => { setClientIds(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="bg-white h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service Type</Label>
          <MultiSelect
            options={[
              ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) })),
            ]}
            value={serviceTypeIds}
            onValueChange={(v) => { setServiceTypeIds(v); setPage(1); }}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="bg-white h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service PO</Label>
          <MultiSelect
            options={[
              ...activePOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poIds}
            onValueChange={(v) => { setPoIds(v); setPage(1); }}
            placeholder="All Service POs"
            searchPlaceholder="Search service PO..."
            className="bg-white h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={records}
        isLoading={showLoading}
        emptyState={
          !periodReady ? (
            <EmptyState
              title="Select a period"
              description="Choose a month or a date range to load the resource utilization trend."
            />
          ) : undefined
        }
        pagination={periodReady && meta.total != null ? {
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total,
        } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default ResourceUtilizationTrend;
