import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Info } from 'lucide-react';
import { useEmployeeCapacityForecast } from '@/hooks/useReports';
import { useDebounce } from '@/hooks/useDebounce';
import { formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const columnHelper = createColumnHelper();

const DEFAULT_BENCH_THRESHOLD_HOURS = 40;
// The Summary counts must reflect every matching employee, not just the current server page, so
// the whole matching set is fetched once (capped well above any realistic monthly headcount) and
// paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const exportToExcel = (rows) => {
  const header = [
    'Employee Code', 'Full Name', 'Designation', 'Monthly Capacity Hours', 'Total Planned Hours',
    'Capacity Used %', 'Active PO Mappings', 'Overallocated', 'Bench Risk',
  ];
  const dataRows = rows.map((r) => [
    r.employee_code ?? '',
    r.full_name ?? '',
    r.designation ?? '',
    r.monthly_capacity_hours != null ? Number(r.monthly_capacity_hours) : '',
    r.total_planned_hours != null ? Number(r.total_planned_hours) : '',
    r.capacity_used_pct != null ? Number(r.capacity_used_pct) : '',
    r.active_po_mappings_count != null ? Number(r.active_po_mappings_count) : '',
    r.overallocation_flag ? 'Yes' : 'No',
    r.bench_flag ? 'Yes' : 'No',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Capacity Forecast');
  XLSX.writeFile(wb, `Employee_Capacity_Forecast.xlsx`);
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const columns = [
  columnHelper.accessor('employee_code', {
    header: 'Employee Code',
    size: 150,
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('full_name', {
    header: 'Full Name',
    size: 200,
    cell: (info) => <div className="truncate font-medium max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('designation', {
    header: 'Designation',
    size: 160,
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('monthly_capacity_hours', {
    header: 'Monthly Capacity Hours',
    size: 170,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_planned_hours', {
    header: 'Total Planned Hours',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('capacity_used_pct', {
    header: 'Capacity Used %',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatPercentage(info.getValue())}</span>,
  }),
  columnHelper.accessor('active_po_mappings_count', {
    header: 'Active PO Mappings',
    size: 150,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? '—'}</span>,
  }),
  columnHelper.accessor('overallocation_flag', {
    header: 'Overallocated',
    size: 130,
    cell: (info) => (
      <Badge variant={info.getValue() ? 'destructive' : 'outline'}>
        {info.getValue() ? 'Yes' : 'No'}
      </Badge>
    ),
  }),
  columnHelper.accessor('bench_flag', {
    header: 'Bench Risk',
    size: 120,
    cell: (info) => (
      <Badge variant={info.getValue() ? 'warning' : 'outline'}>
        {info.getValue() ? 'Yes' : 'No'}
      </Badge>
    ),
  }),
];

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

const EmployeeCapacityForecast = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [benchThresholdHours, setBenchThresholdHours] = useState(String(DEFAULT_BENCH_THRESHOLD_HOURS));
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const debouncedBenchThresholdHours = useDebounce(benchThresholdHours, 400);

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    benchThresholdHours: debouncedBenchThresholdHours !== '' ? Number(debouncedBenchThresholdHours) : DEFAULT_BENCH_THRESHOLD_HOURS,
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useEmployeeCapacityForecast(params);

  const records = data?.data?.records ?? [];

  // Applied in memory — the whole matching set is already here (see MAX_RECORDS_FETCH), so there
  // is nothing to gain from a round-trip. Covers the identifying columns only; the capacity
  // numbers and Yes/No flags are left out, since substring-matching those misleads more than it
  // helps (a search for "0" would match every 0.0h row).
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => [r.employee_code, r.full_name, r.designation]
      .some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [records, search]);

  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    Number(benchThresholdHours) !== DEFAULT_BENCH_THRESHOLD_HOURS,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setBenchThresholdHours(String(DEFAULT_BENCH_THRESHOLD_HOURS));
    setPage(1);
  };

  // Already have the full matching set in memory — no need for a second network round-trip.
  // Exports what the search actually leaves on screen, not the unfiltered set.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Employee Capacity & Bench Forecast"
        description="Capacity utilization and bench/overallocation risk per employee for the selected month."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search code, name, designation…"
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

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[380px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Bench Threshold Hours</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="What is Bench Threshold Hours?"
                  className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-full"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-sm space-y-1.5 py-2 leading-relaxed">
                <p>An employee is flagged <strong>Bench Risk</strong> when both are true:</p>
                <ol className="list-decimal space-y-0.5 pl-4">
                  <li>They have at least one active Service PO assignment, AND</li>
                  <li>Their Total Planned Hours (from Resource Budget) for the month is below this threshold.</li>
                </ol>
                <p>
                  <strong>Example:</strong> if set to 40, any employee with less than 40 planned hours
                  (but who is still assigned to a project) will show as Bench Risk.
                </p>
                <p>
                  Leave empty to use the default of 40 — every row will still show, just annotated with
                  the bench flag; nothing gets filtered out.
                </p>
                <p>
                  Set an explicit value (including 0) to actually filter the table down to only
                  bench-risk employees at that threshold.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            type="number"
            min={0}
            value={benchThresholdHours}
            onChange={(e) => { setBenchThresholdHours(e.target.value); setPage(1); }}
            className="h-9 w-full text-sm"
          />
        </div>
      </FilterPanel>

      <DataTable
        columns={columns}
        data={pagedRecords}
        isLoading={isPending}
        pagination={{ page, limit, total: filteredRecords.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        mobileCards
      />

      {data?.data && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {/*
              Counted from the full matching set (all pages), not just what's currently displayed
              — the backend's own aggregate fields always came back 0 regardless of how many rows
              actually had bench_flag/overallocation_flag set, so these are counted directly from
              records (the same flags the table columns already render as Yes/No) instead of
              trusted from the backend.
            */}
            <SummaryItem label="Bench Risk (all pages)" value={filteredRecords.filter((r) => r.bench_flag).length} />
            <SummaryItem label="Overallocated (all pages)" value={filteredRecords.filter((r) => r.overallocation_flag).length} />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeCapacityForecast;
