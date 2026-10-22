import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useMonthWiseBench } from '@/hooks/useReports';
import { extractReportRows } from '@/utils/reportEnvelope';
import { formatNumber, formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { MonthRangePicker } from '@/components/ui/month-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();
const now = new Date();
// Trailing 6-month window (5 months back through the current month) so "Date Range" mode shows a
// meaningful trend the moment it loads, instead of both ends defaulting to the SAME current
// month — which is what previously made this page look broken (only ever one row, "Sep 2026").
const defaultFromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);

// Same Month/Date Range mode toggle as PmWiseUtilizationReport — see its own comment for why.
const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'range', label: 'Date Range' },
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Apr 2026", not just "Apr" — a range can cross a year boundary (e.g. Nov 2025-Feb 2026), where
// two same-named months would otherwise be indistinguishable.
const shortMonthLabel = (month, year) => `${MONTH_ABBR[(month ?? 1) - 1]} ${year ?? ''}`.trim();

// Bench is the inverse of utilization — high bench % is the thing to flag, so the color
// direction is deliberately reversed from the utilization reports' emerald/amber/destructive.
const benchColorClass = (value) => {
  if (value == null) return 'text-muted-foreground';
  const num = Number(value);
  if (num >= 30) return 'text-destructive';
  if (num >= 15) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
};

const columns = [
  columnHelper.accessor((row) => shortMonthLabel(row.month, row.year), {
    id: 'month',
    header: 'Month',
    size: 130,
    cell: (info) => <span className="font-medium whitespace-nowrap">{info.getValue()}</span>,
  }),
  columnHelper.accessor('resources_on_bench', {
    header: 'No. of Resources on Bench',
    size: 200,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_bench_hours', {
    header: 'Total Bench Hrs',
    size: 160,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('original_total_bench_hours', {
    header: 'Original Total Bench Hrs',
    size: 190,
    meta: { align: 'right' },
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return null;
      return <span className="tabular-nums text-muted-foreground">{formatHours(value)}</span>;
    },
  }),
  columnHelper.accessor('total_available_hours', {
    header: 'Total Available Hrs (Org)',
    size: 190,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('bench_pct', {
    header: 'Bench %',
    size: 130,
    meta: { align: 'right' },
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
      return <span className={cn('tabular-nums font-medium', benchColorClass(value))}>{formatPercentage(value, 1)}</span>;
    },
  }),
];

const exportToExcel = (rows) => {
  const header = ['Month', 'No. of Resources on Bench', 'Total Bench Hrs', 'Total Available Hrs (Org)', 'Bench %'];
  const dataRows = rows.map((r) => [
    shortMonthLabel(r.month, r.year),
    r.resources_on_bench != null ? Number(r.resources_on_bench) : '',
    r.total_bench_hours != null ? Number(r.total_bench_hours) : '',
    r.original_total_bench_hours != null ? Number(r.original_total_bench_hours) : '',
    r.total_available_hours != null ? Number(r.total_available_hours) : '',
    r.bench_pct != null ? Number(r.bench_pct) : '',
    r.original_bench_pct != null ? Number(r.original_bench_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 24 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Month-wise Bench');
  XLSX.writeFile(wb, 'Month_Wise_Bench_Report.xlsx');
};

// Org-wide bench trend, one row per calendar month in the selected range. GET
// /reports/month-wise-bench is a small, fixed-size result and not paginated/searched by the
// backend at all — the whole matching set always arrives in one call, so search and pagination
// here are both applied client-side over what's already in memory (no extra round-trip needed).
// The resource-wise breakdown for the same period lives on its own page/endpoint
// (ResourceWiseBenchReport.jsx, GET /reports/resource-wise-bench) rather than here, since each is
// its own Management Report.
const MonthWiseBenchReport = () => {
  const [periodMode, setPeriodMode] = useState('range');
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [fromMonthYear, setFromMonthYear] = useState({ month: defaultFromDate.getMonth() + 1, year: defaultFromDate.getFullYear() });
  const [toMonthYear, setToMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(fromMonthYear?.month && fromMonthYear?.year && toMonthYear?.month && toMonthYear?.year);
  const activeFilterCount = (entityIds.length > 0 ? 1 : 0) + (buIds.length > 0 ? 1 : 0);

  const params = {
    ...(periodMode === 'month'
      ? { month: monthYear.month, year: monthYear.year }
      : { startMonth: fromMonthYear.month, startYear: fromMonthYear.year, endMonth: toMonthYear.month, endYear: toMonthYear.year }),
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const { data, isPending } = useMonthWiseBench(params);
  const rows = extractReportRows(data);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => shortMonthLabel(r.month, r.year).toLowerCase().includes(q));
  }, [rows, search]);
  const pagedRows = filteredRows.slice((page - 1) * limit, page * limit);

  const handleExport = () => exportToExcel(filteredRows);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Month-wise Bench Report"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search month…"
              className="w-full sm:w-full md:w-56"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {filteredRows.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[300px]"
        onClear={() => { setEntityIds([]); setBuIds([]); }}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setPage(1); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setPage(1); }} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Period Mode</Label>
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
              {PERIOD_MODES.map(({ value, label }) => (
                <TabsTrigger key={value} value={value} className="text-xs font-semibold data-[state=active]:bg-white">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{periodMode === 'month' ? 'Month & Year' : 'Date Range'} <span className="text-destructive">*</span></Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { if (val) { setMonthYear(val); setPage(1); } }}
              placeholder="Select month"
              clearable={false}
              className="w-full"
            />
          ) : (
            <MonthRangePicker
              value={{ from: fromMonthYear, to: toMonthYear }}
              onChange={({ from, to }) => {
                if (from) setFromMonthYear(from);
                if (to) setToMonthYear(to);
                setPage(1);
              }}
              className="w-full"
            />
          )}
        </div>
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={pagedRows}
        isLoading={periodReady && isPending}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a period" description="Choose a month or a date range to load the bench trend." />
          ) : undefined
        }
        pagination={periodReady ? { page, limit, total: filteredRows.length } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default MonthWiseBenchReport;
