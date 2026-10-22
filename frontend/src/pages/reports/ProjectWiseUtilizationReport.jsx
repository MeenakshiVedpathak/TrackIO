import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from 'lucide-react';
import { useProjectWiseUtilization } from '@/hooks/useReports';
import { extractReportRows } from '@/utils/reportEnvelope';
import { useDebounce } from '@/hooks/useDebounce';
import { formatNumber, formatHours } from '@/utils/formatters';
import { UtilizationCell } from '@/components/reports/UtilizationCell';
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
// Trailing 6-month window (5 months back through the current month) so the "Date Range" mode
// shows a meaningful set of projects/hours immediately, instead of both ends defaulting to the
// SAME current month — which mostly has partial/low hours (still in progress) and reads as
// "nothing loaded".
const defaultFromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);

// Same Month/Date Range mode toggle as PmWiseUtilizationReport — see its own comment for why.
const PERIOD_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'range', label: 'Date Range' },
];

// Server-side sort keys the endpoint accepts (GET /reports/project-wise-utilization?sortBy=...).
const SORTABLE = {
  CLIENT_NAME: 'client_name',
  PROJECT_NAME: 'project_name',
  SERVICE_PO_NAME: 'service_po_name',
  RESOURCE_COUNT: 'resource_count',
  LOGGED_HOURS: 'total_logged_hours',
  AVAILABLE_HOURS: 'total_available_hours',
  UTILIZATION: 'utilization_pct',
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

// enableSorting is false throughout — sorting is the SERVER's (sortBy/sortOrder) via the header
// buttons above, same convention as PmWiseUtilizationReport/ResourceUtilizationTrend. Grain is
// actually Service PO (one row per Service PO, not per Project) — Client/Project/Service PO are
// shown as three separate sticky columns rather than folding Project+code into one cell, since
// a Client or Project name alone doesn't uniquely identify a row here.
const getColumns = (sortBy, sortOrder, onSort) => [
  columnHelper.accessor('client_name', {
    header: () => <SortableHeader label="Client" column={SORTABLE.CLIENT_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
    size: 160,
    meta: { sticky: true, left: 0 },
    enableSorting: false,
    cell: (info) => <div className="truncate max-w-[145px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('project_name', {
    header: () => <SortableHeader label="Project" column={SORTABLE.PROJECT_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
    size: 180,
    meta: { sticky: true, left: 160 },
    enableSorting: false,
    cell: (info) => <div className="truncate max-w-[165px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('service_po_name', {
    header: () => <SortableHeader label="Service PO" column={SORTABLE.SERVICE_PO_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
    size: 220,
    meta: { sticky: true, left: 340 },
    enableSorting: false,
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-0 truncate font-medium" title={row.service_po_name}>{row.service_po_name || '—'}</div>
      );
    },
  }),
  columnHelper.accessor('resource_count', {
    header: () => <SortableHeader label="No. of Resources" column={SORTABLE.RESOURCE_COUNT} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 160,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_logged_hours', {
    header: () => <SortableHeader label="Total Logged Hrs" column={SORTABLE.LOGGED_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 160,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('original_total_logged_hours', {
    header: 'Original Total Logged Hrs',
    size: 180,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return null;
      return <span className="tabular-nums text-muted-foreground">{formatHours(value)}</span>;
    },
  }),
  columnHelper.accessor('total_available_hours', {
    header: () => <SortableHeader label="Total Available Hrs" column={SORTABLE.AVAILABLE_HOURS} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 170,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('utilization_pct', {
    header: () => <SortableHeader label="Utilization %" column={SORTABLE.UTILIZATION} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="right" />,
    size: 150,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => {
      const row = info.row.original;
      return (
        <UtilizationCell
          utilizationPct={info.getValue()}
          totalAvailableHours={row.total_available_hours}
          totalLoggedHours={row.total_logged_hours}
        />
      );
    },
  }),
  columnHelper.accessor('original_utilization_pct', {
    header: 'Original Utilization %',
    size: 170,
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return null;
      return <span className="tabular-nums text-muted-foreground">{Number(value).toFixed(2)}%</span>;
    },
  }),
];

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

// Exports the current page only — this report is server-paginated, so the rest of the result
// set is not in memory.
const exportToExcel = (rows) => {
  const header = ['Client', 'Project', 'Service PO Code', 'Service PO Name', 'No. of Resources', 'Total Logged Hrs', 'Total Available Hrs', 'Utilization %'];
  const dataRows = rows.map((r) => [
    r.client_name ?? '',
    r.project_name ?? '',
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.resource_count != null ? Number(r.resource_count) : '',
    r.total_logged_hours != null ? Number(r.total_logged_hours) : '',
    r.original_total_logged_hours != null ? Number(r.original_total_logged_hours) : '',
    r.total_available_hours != null ? Number(r.total_available_hours) : '',
    r.utilization_pct != null ? Number(r.utilization_pct) : '',
    r.original_utilization_pct != null ? Number(r.original_utilization_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Project-wise Utilization');
  XLSX.writeFile(wb, 'Project_Wise_Utilization_Report.xlsx');
};

// Project-wise rollup — grain is actually Service PO (one row per Service PO), resources/hours/
// utilization rolled up per PO across a month range. Same server-paginated/sorted/searched
// contract as PmWiseUtilizationReport.
const ProjectWiseUtilizationReport = () => {
  const [periodMode, setPeriodMode] = useState('range');
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [fromMonthYear, setFromMonthYear] = useState({ month: defaultFromDate.getMonth() + 1, year: defaultFromDate.getFullYear() });
  const [toMonthYear, setToMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — backend support for entityIds/businessUnitIds has landed on this report
  // (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md), including the `summary` block now being
  // computed over the full filtered dataset.
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(SORTABLE.UTILIZATION);
  const [sortOrder, setSortOrder] = useState('DESC');

  const debouncedSearch = useDebounce(search, 400);

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(fromMonthYear?.month && fromMonthYear?.year && toMonthYear?.month && toMonthYear?.year);

  const params = {
    ...(periodMode === 'month'
      ? { month: monthYear.month, year: monthYear.year }
      : { startMonth: fromMonthYear.month, startYear: fromMonthYear.year, endMonth: toMonthYear.month, endYear: toMonthYear.year }),
    ...(debouncedSearch && { search: debouncedSearch }),
    sortBy,
    sortOrder,
    page,
    limit,
    // `buId` is always the 'all' sentinel so explicitBuScope always drops the X-Company-Id
    // header, letting `businessUnitIds` below narrow the full role reach instead.
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const { data, isPending } = useProjectWiseUtilization(params);

  // Same envelope shape as PmWiseUtilizationReport — `meta` sits at the top level, `summary`
  // lives alongside the row array under `data.data`. Confirmed against a real response.
  const records = extractReportRows(data);
  const meta = data?.meta ?? {};
  const summary = data?.data?.summary ?? null;
  const showLoading = periodReady && isPending;

  const activeFilterCount = (entityIds.length > 0 ? 1 : 0) + (buIds.length > 0 ? 1 : 0);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
    setPage(1);
  };

  const columns = getColumns(sortBy, sortOrder, handleSort);

  // Exports the current page only — see exportToExcel's comment above.
  const handleExport = () => exportToExcel(records);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Project-wise Report"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search client, project, or Service PO…"
              className="w-full sm:w-full md:w-72"
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} className="order-2 md:order-none">
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="order-1 h-[clamp(1.875rem,2vw,2.25rem)] md:order-none"
            />
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
        data={records}
        isLoading={showLoading}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a period" description="Choose a month or a date range to load this report." />
          ) : undefined
        }
        pagination={periodReady && meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="No. of Resources" value={formatNumber(summary.total_resource_count)} />
            <SummaryItem label="Total Logged Hrs" value={formatHours(summary.total_logged_hours)} />
            {summary.original_total_logged_hours != null && <SummaryItem label="Original Total Logged Hrs" value={formatHours(summary.original_total_logged_hours)} />}
            <SummaryItem label="Total Available Hrs" value={formatHours(summary.total_available_hours)} />
            <SummaryItem
              label="Utilization %"
              value={(
                <UtilizationCell
                  utilizationPct={summary.utilization_pct}
                  totalAvailableHours={summary.total_available_hours}
                  totalLoggedHours={summary.total_logged_hours}
                />
              )}
            />
            {summary.original_utilization_pct != null && (
              <SummaryItem
                label="Original Utilization %"
                value={(
                  <span className="tabular-nums">{Number(summary.original_utilization_pct).toFixed(2)}%</span>
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWiseUtilizationReport;
