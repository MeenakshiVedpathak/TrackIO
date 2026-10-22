import { useState, useEffect } from 'react';
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
import { formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// Filter labels read as uppercase micro-labels, echoing the data table's own column headers so
// the panel and the table below it look like one surface (same treatment as ClientWiseAnalytics).
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
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
const getColumns = (sortBy, sortOrder, onSort) => [
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
  columnHelper.accessor('billable_hours', {
    header: () => (
      <SortableHeader label="Billable Hours" column={SORTABLE.BILLABLE_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 150,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
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
];

const exportToExcel = (rows) => {
  const header = ['Month', 'Employee Code', 'Resource', 'Total Hours', 'Billable Hours', 'Utilization %'];
  const dataRows = rows.map((r) => [
    r.month ?? '',
    r.employee_code ?? '',
    r.full_name ?? '',
    r.total_hours != null ? Number(r.total_hours) : '',
    r.billable_hours != null ? Number(r.billable_hours) : '',
    r.utilization_percentage != null ? Number(r.utilization_percentage) : '',
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

  const [employeeId, setEmployeeId] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [poId, setPoId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [buId, setBuId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
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
  }, [canViewOriginal]);

  const { data: activeEmployees = [] } = useActiveEmployees();
  const { data: activeClients = [] } = useActiveClients();
  const { data: activePOs = [] } = useActiveServicePOs();
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
    ...(employeeId !== 'all' && { employeeId }),
    ...(clientId !== 'all' && { clientId }),
    ...(poId !== 'all' && { poId }),
    ...(serviceTypeId !== 'all' && { serviceTypeId }),
    hoursSource,
    ...(roleObjects?.[0]?.id && { roleId: roleObjects[0].id }),
    sortBy,
    sortOrder,
    page,
    limit,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useResourceUtilizationTrend(params);

  const records = Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};
  const showLoading = periodReady && isPending;

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    employeeId !== 'all',
    clientId !== 'all',
    poId !== 'all',
    serviceTypeId !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setEmployeeId('all');
    setClientId('all');
    setPoId('all');
    setServiceTypeId('all');
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

  const columns = getColumns(sortBy, sortOrder, handleSort);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Utilization Trend"
        description="Monthly utilization per resource — billable hours as a share of total hours."
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
              className="h-9"
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
        gridClassName="items-end gap-x-4 gap-y-5 rounded-xl border-slate-200/80 bg-slate-50/70 p-5 shadow-sm"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter
          value={entityId}
          onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); setPage(1); }}
          labelClassName={FILTER_LABEL}
        />

        <BusinessUnitFilter
          value={buId}
          entityId={entityId}
          onChange={(v) => { setBuId(v); setPage(1); }}
          labelClassName={FILTER_LABEL}
        />

        {/* Period mode and its picker take one grid cell each, rather than sharing a single
            md:col-span-2 cell: a picker stretched across two columns dwarfed every neighbouring
            control, and split this way all six filters sit on the same column rhythm. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
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
            always holds one of its two values, so it is the picker that can be left unset. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>
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
          <Label className={FILTER_LABEL}>Resource</Label>
          <SearchableSelect
            options={[
              { label: 'All Resources', value: 'all' },
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
            ]}
            value={employeeId}
            onValueChange={(v) => { setEmployeeId(v); setPage(1); }}
            placeholder="All Resources"
            searchPlaceholder="Search resource..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <SearchableSelect
            options={[
              { label: 'All Clients', value: 'all' },
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientId}
            onValueChange={(v) => { setClientId(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service Type</Label>
          <SearchableSelect
            options={[
              { label: 'All Service Types', value: 'all' },
              ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) })),
            ]}
            value={serviceTypeId}
            onValueChange={(v) => { setServiceTypeId(v); setPage(1); }}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service PO</Label>
          <SearchableSelect
            options={[
              { label: 'All Service POs', value: 'all' },
              ...activePOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poId}
            onValueChange={(v) => { setPoId(v); setPage(1); }}
            placeholder="All Service POs"
            searchPlaceholder="Search service PO..."
            className="h-9 w-full text-sm"
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
