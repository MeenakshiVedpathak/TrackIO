import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from 'lucide-react';
import { useEmployeeBenchPercentage } from '@/hooks/useReports';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

// The Summary average must reflect every matching employee, not just the current server page, so
// the whole matching set is fetched once (capped well above any realistic monthly headcount) and
// paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// Filter labels read as uppercase micro-labels, echoing the data table's own column headers so
// the panel and the table below it look like one surface (same treatment as ClientWiseAnalytics).
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'range', label: 'Date Range' },
];

// No continuous bench-% threshold is documented anywhere (EmployeeCapacityForecast only ever
// renders a boolean bench_flag as a warning/outline Badge) — these bands reuse that same
// Badge vocabulary (outline / warning / destructive), just applied across a numeric range instead
// of a single true/false cut, so a high bench_pct reads as escalating risk (amber, then red).
const BENCH_PCT_WARNING_THRESHOLD = 20;
const BENCH_PCT_CRITICAL_THRESHOLD = 40;

const BenchPctBadge = ({ value }) => {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const pct = Number(value);
  const variant =
    pct >= BENCH_PCT_CRITICAL_THRESHOLD ? 'destructive' : pct >= BENCH_PCT_WARNING_THRESHOLD ? 'warning' : 'outline';
  return (
    <Badge variant={variant} className="tabular-nums">
      {formatPercentage(pct)}
    </Badge>
  );
};

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
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

const getColumns = (sortBy, sortOrder, onSort) => [
  columnHelper.accessor('employee_code', {
    header: 'Employee Code',
    size: 150,
    enableSorting: false,
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('full_name', {
    header: 'Full Name',
    size: 220,
    enableSorting: false,
    cell: (info) => <div className="truncate font-medium max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('bench_hours', {
    header: () => (
      <SortableHeader label="Bench Hours" column="bench_hours" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 140,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_hours', {
    header: () => (
      <SortableHeader label="Total Hours" column="total_hours" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 140,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('bench_pct', {
    header: () => (
      <SortableHeader label="Bench %" column="bench_pct" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />
    ),
    size: 130,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <BenchPctBadge value={info.getValue()} />,
  }),
];

const exportToExcel = (rows) => {
  const header = ['Employee Code', 'Full Name', 'Bench Hours', 'Total Hours', 'Bench %'];
  const dataRows = rows.map((r) => [
    r.employee_code ?? '',
    r.full_name ?? '',
    r.bench_hours != null ? Number(r.bench_hours) : '',
    r.total_hours != null ? Number(r.total_hours) : '',
    r.bench_pct != null ? Number(r.bench_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Bench Percentage');
  XLSX.writeFile(wb, 'Employee_Bench_Percentage.xlsx');
};

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

const EmployeeBenchPercentage = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [dateRange, setDateRange] = useState(null);

  const [employeeId, setEmployeeId] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [poId, setPoId] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buId, setBuId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('bench_pct');
  const [sortOrder, setSortOrder] = useState('desc');

  const { data: activeEmployees = [] } = useActiveEmployees();
  const { data: activeClients = [] } = useActiveClients();
  const { data: activePOs = [] } = useActiveServicePOs();

  const periodReady =
    periodMode === 'month'
      ? !!(monthYear?.month && monthYear?.year)
      : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? monthYear?.month && monthYear?.year && { month: monthYear.month, year: monthYear.year }
      : dateRange?.startDate && dateRange?.endDate && { startDate: dateRange.startDate, endDate: dateRange.endDate }),
    ...(employeeId !== 'all' && { employeeId }),
    ...(clientId !== 'all' && { clientId }),
    ...(poId !== 'all' && { poId }),
    sortBy,
    sortOrder,
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useEmployeeBenchPercentage(params);

  const records = Array.isArray(data?.data) ? data.data : [];

  // Applied in memory — the whole matching set is already here, so there is nothing to gain from
  // a round-trip. Covers the identifying columns only; the numeric/metric columns are left out,
  // since substring-matching an amount or a count misleads more than it helps.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => [r.employee_code, r.full_name]
      .some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [records, search]);
  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);
  const showLoading = periodReady && isPending;

  const avgBenchPct =
    filteredRecords.length > 0
      ? filteredRecords.reduce((sum, r) => sum + (Number(r.bench_pct) || 0), 0) / filteredRecords.length
      : null;

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    employeeId !== 'all',
    clientId !== 'all',
    poId !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setEmployeeId('all');
    setClientId('all');
    setPoId('all');
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  // Already have the full matching set in memory — no need for a second network round-trip.
  const handleExport = () => exportToExcel(filteredRecords);

  const columns = getColumns(sortBy, sortOrder, handleSort);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Employee Bench Percentage"
        description="Share of each employee's hours that went unbilled (bench) for the selected period."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search code, name…"
              className="w-full sm:w-full md:w-72"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="h-9"
            />
            {filteredRecords.length > 0 && (
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
          onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }}
          labelClassName={FILTER_LABEL}
        />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} labelClassName={FILTER_LABEL} />

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
          <Label className={FILTER_LABEL}>Employee</Label>
          <SearchableSelect
            options={[
              { label: 'All Employees', value: 'all' },
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
            ]}
            value={employeeId}
            onValueChange={(v) => { setEmployeeId(v); setPage(1); }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
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
          <Label className={FILTER_LABEL}>Project (Service PO)</Label>
          <SearchableSelect
            options={[
              { label: 'All Projects', value: 'all' },
              ...activePOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poId}
            onValueChange={(v) => { setPoId(v); setPage(1); }}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-9 w-full text-sm"
          />
        </div>
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={pagedRecords}
        isLoading={showLoading}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a period" description="Choose a month or a date range to load the bench percentage report." />
          ) : undefined
        }
        pagination={periodReady ? { page, limit, total: filteredRecords.length } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {periodReady && filteredRecords.length > 0 && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Avg Bench %" value={formatPercentage(avgBenchPct)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeBenchPercentage;
