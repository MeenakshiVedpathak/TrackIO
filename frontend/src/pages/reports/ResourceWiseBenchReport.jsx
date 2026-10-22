import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from 'lucide-react';
import { useResourceWiseBench } from '@/hooks/useReports';
import { extractReportRows } from '@/utils/reportEnvelope';
import { useDebounce } from '@/hooks/useDebounce';
import { formatPercentage } from '@/utils/formatters';
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
// meaningful spread of columns/rows immediately, instead of both ends defaulting to the SAME
// current month — which mostly has 0% bench (still in progress) and reads as "nothing loaded".
const defaultFromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);

// Same Month/Date Range mode toggle as PmWiseUtilizationReport — see its own comment for why. In
// "Month" mode the pivot table below just ends up with a single month column, which the dynamic
// column-derivation logic already handles without any special-casing.
const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'range', label: 'Date Range' },
];

// GET /reports/resource-wise-bench declares no `search` param — same "widen the fetch, then
// filter/paginate client-side" pattern as TeamCapacityTable's designation filter: while a search
// term is active, request a wide page instead of the normal small one, so filtering doesn't just
// narrow whatever 10 rows happened to already be on screen (which would silently miss matches
// sitting on other server pages).
const SEARCH_FETCH_LIMIT = 200;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Apr 2026", not just "Apr" — a range can cross a year boundary (e.g. Nov 2025-Feb 2026), where
// two same-named months would otherwise be indistinguishable column headers.
const shortMonthLabel = (month, year) => `${MONTH_ABBR[(month ?? 1) - 1]} ${year ?? ''}`.trim();

// GET /reports/resource-wise-bench sort keys.
const SORTABLE = { NAME: 'full_name', AVG_BENCH: 'avg_bench_pct' };

// Bench is the inverse of utilization — high bench % is the thing to flag, so the color
// direction is deliberately reversed from the utilization reports' emerald/amber/destructive.
const benchColorClass = (value) => {
  if (value == null) return 'text-muted-foreground';
  const num = Number(value);
  if (num >= 30) return 'text-destructive';
  if (num >= 15) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
};

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'ASC' ? ChevronUp : ChevronDown) : ChevronsUpDown;
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

// Per-resource bench % across a month range, pivoted into one column per month. GET
// /reports/resource-wise-bench is server-paginated and server-sorted (sortBy: full_name |
// avg_bench_pct — the only two keys this endpoint declares, so the per-month pivot columns below
// are plain non-interactive headers rather than fake sortable ones). The org-wide monthly trend
// for the same period lives on its own page (MonthWiseBenchReport.jsx, GET
// /reports/month-wise-bench) rather than here, since each is its own Management Report.
const ResourceWiseBenchReport = () => {
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
  const [sortBy, setSortBy] = useState(SORTABLE.AVG_BENCH);
  const [sortOrder, setSortOrder] = useState('DESC');

  const debouncedSearch = useDebounce(search, 400);
  const hasClientSearch = !!debouncedSearch;

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(fromMonthYear?.month && fromMonthYear?.year && toMonthYear?.month && toMonthYear?.year);
  const activeFilterCount = (entityIds.length > 0 ? 1 : 0) + (buIds.length > 0 ? 1 : 0);

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const params = {
    ...(periodMode === 'month'
      ? { month: monthYear.month, year: monthYear.year }
      : { startMonth: fromMonthYear.month, startYear: fromMonthYear.year, endMonth: toMonthYear.month, endYear: toMonthYear.year }),
    sortBy,
    sortOrder,
    // See SEARCH_FETCH_LIMIT above — a search in progress widens the fetch instead of using the
    // normal small page, since there's no server-side `search` param to narrow it there instead.
    page: hasClientSearch ? 1 : page,
    limit: hasClientSearch ? SEARCH_FETCH_LIMIT : limit,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useResourceWiseBench(params);
  const rawRows = extractReportRows(data);
  // `meta` lives at the top level for PM-wise/Project-wise Utilization but this endpoint's exact
  // envelope hasn't been confirmed against a real response yet — try both the top-level spot and
  // the nested one (alongside the row array) rather than assume.
  const meta = data?.meta ?? data?.data?.meta ?? {};

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rawRows;
    return rawRows.filter((r) => [r.full_name, r.project_manager_name].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rawRows, debouncedSearch]);
  const rows = hasClientSearch ? filteredRows.slice((page - 1) * limit, page * limit) : rawRows;

  // Dynamic month columns — derived from every (month, year) pair actually present across the
  // current page's rows rather than assumed from the picked range, since a resource with no
  // bench entry for a given month may simply omit it from `months`. Sorted chronologically (not
  // first-seen order) so columns always read left-to-right regardless of the backend's own array
  // ordering.
  const monthColumnDefs = useMemo(() => {
    const seen = new Map();
    rows.forEach((r) => (r.months ?? []).forEach((m) => {
      const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
      if (!seen.has(key)) seen.set(key, { month: m.month, year: m.year });
    }));
    return Array.from(seen.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, { month, year }]) => ({ key, month, year, label: shortMonthLabel(month, year) }));
  }, [rows]);

  const pivotedRows = useMemo(() => rows.map((r) => {
    const row = { employee_id: r.employee_id, full_name: r.full_name, project_manager_name: r.project_manager_name, avg_bench_pct: r.avg_bench_pct, original_avg_bench_pct: r.original_avg_bench_pct };
    (r.months ?? []).forEach((m) => {
      row[`${m.year}-${String(m.month).padStart(2, '0')}`] = m.bench_pct;
      row[`original_${m.year}-${String(m.month).padStart(2, '0')}`] = m.original_bench_pct;
    });
    return row;
  }), [rows]);

  // Exports whatever's currently in scope — the full search-matched set while searching (already
  // in memory from the wide fetch), or just the current server page otherwise, same tradeoff
  // ResourceUtilizationTrend documents for its own export.
  const handleExport = () => {
    const header = ['Employee Name', 'PM', ...monthColumnDefs.flatMap((m) => [m.label, `Orig ${m.label}`]), 'Avg Bench %', 'Original Avg Bench %'];
    const exportRows = (hasClientSearch ? filteredRows : rawRows).map((r) => {
      const byMonth = new Map((r.months ?? []).map((m) => [`${m.year}-${String(m.month).padStart(2, '0')}`, m]));
      return [
        r.full_name ?? '',
        r.project_manager_name ?? '',
        ...monthColumnDefs.flatMap(({ key }) => {
          const m = byMonth.get(key);
          return [m?.bench_pct != null ? Number(m.bench_pct) : '', m?.original_bench_pct != null ? Number(m.original_bench_pct) : ''];
        }),
        r.avg_bench_pct != null ? Number(r.avg_bench_pct) : '',
        r.original_avg_bench_pct != null ? Number(r.original_avg_bench_pct) : '',
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...exportRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resource-wise Bench');
    XLSX.writeFile(wb, 'Resource_Wise_Bench_Report.xlsx');
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

  // enableSorting is false on every column — full_name/avg_bench_pct are server-sorted via the
  // header buttons; the per-month pivot columns have no sortBy contract on this endpoint at all.
  const columns = useMemo(() => [
    columnHelper.accessor('full_name', {
      header: () => <SortableHeader label="Employee Name" column={SORTABLE.NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />,
      size: 200,
      meta: { sticky: true, left: 0 },
      enableSorting: false,
      cell: (info) => <div className="truncate font-medium max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    columnHelper.accessor('project_manager_name', {
      header: 'PM',
      size: 160,
      enableSorting: false,
      cell: (info) => <div className="truncate max-w-[140px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    ...monthColumnDefs.flatMap(({ key, label }) => [
      columnHelper.accessor((row) => row[key], {
      id: key,
      header: label,
      size: 100,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
        return <span className={cn('tabular-nums', benchColorClass(value))}>{formatPercentage(value, 1)}</span>;
      },
    }),
      columnHelper.accessor((row) => row[`original_${key}`], {
        id: `original_${key}`,
        header: `Orig ${label}`,
        size: 110,
        meta: { align: 'right' },
        enableSorting: false,
        cell: (info) => {
          const value = info.getValue();
          if (value == null || value === '') return null;
          return <span className="tabular-nums text-muted-foreground">{formatPercentage(value, 1)}</span>;
        },
      })
    ]),
    columnHelper.accessor('avg_bench_pct', {
      header: () => <SortableHeader label="Avg Bench %" column={SORTABLE.AVG_BENCH} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />,
      size: 140,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
        return <span className={cn('tabular-nums font-semibold', benchColorClass(value))}>{formatPercentage(value, 1)}</span>;
      },
    }),
    columnHelper.accessor('original_avg_bench_pct', {
      header: 'Original Avg Bench %',
      size: 160,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        if (value == null || value === '') return null;
        return <span className="tabular-nums text-muted-foreground">{formatPercentage(value, 1)}</span>;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [monthColumnDefs, sortBy, sortOrder]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource-wise Bench % by Month"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee or PM…"
              className="w-full sm:w-full md:w-64"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {(hasClientSearch ? filteredRows.length : rawRows.length) > 0 && (
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
        onClear={() => { setEntityIds([]); setBuIds([]); setPage(1); }}
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
        data={pivotedRows}
        isLoading={periodReady && isPending}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a period" description="Choose a month or a date range to load resource-wise bench %." />
          ) : undefined
        }
        pagination={
          !periodReady ? undefined
            : hasClientSearch ? { page, limit, total: filteredRows.length }
              : meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined
        }
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default ResourceWiseBenchReport;
