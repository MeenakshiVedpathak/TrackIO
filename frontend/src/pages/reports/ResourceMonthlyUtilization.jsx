import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useResourceMonthlyUtilization } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { extractReportRows } from '@/utils/reportEnvelope';
import { useDebounce } from '@/hooks/useDebounce';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
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
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const columnHelper = createColumnHelper();
const now = new Date();

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortMonthLabel = (month, year) => `${MONTH_ABBR[(month ?? 1) - 1]} ${year ?? ''}`.trim();

// This report has no sortBy/sortOrder param in its own contract (unlike PM-wise/Project-wise
// Utilization), so columns here are plain headers — no server-sort wiring.
const formatHours2 = (value) => (value == null ? '—' : Number(value).toFixed(2));

// Same plain "{value}%"/em-dash cell MonthlyResourceUtilization.jsx already uses for its own
// utilization_percentage column — copied here rather than imported since that file has no
// exported/shared version of it (it's defined locally there too), and per this task's own "do
// not touch other report screens" constraint, extracting one now would mean also editing that
// file to use it.
const UtilizationPercentCell = ({ value }) => {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{Number(value).toFixed(2)}%</span>;
};

const columns = [
  columnHelper.accessor('employeeName', {
    id: 'employeeName',
    header: 'Employee',
    size: 200,
    meta: { sticky: true, left: 0 },
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-0 truncate font-medium" title={row.employeeCode ? `${row.employeeName} (${row.employeeCode})` : row.employeeName}>
          {row.employeeName || '—'}
        </div>
      );
    },
  }),
  columnHelper.accessor((row) => shortMonthLabel(row.month, row.year), {
    id: 'month',
    header: 'Month',
    size: 110,
    cell: (info) => <span className="whitespace-nowrap">{info.getValue()}</span>,
  }),
  columnHelper.accessor('billableHours', {
    id: 'billableHours',
    header: 'Billable (hrs)',
    size: 140,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatHours2(info.getValue())}</span>,
  }),
  columnHelper.accessor('originalBillableHours', {
    id: 'originalBillableHours',
    header: 'Original Billable (hrs)',
    size: 170,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatHours2(info.getValue())}</span>,
  }),
  columnHelper.accessor('nonBillableHours', {
    id: 'nonBillableHours',
    header: 'Non-Billable (hrs)',
    size: 160,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatHours2(info.getValue())}</span>,
  }),
  columnHelper.accessor('originalNonBillableHours', {
    id: 'originalNonBillableHours',
    header: 'Original Non-Billable (hrs)',
    size: 190,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums">{formatHours2(info.getValue())}</span>,
  }),
  columnHelper.accessor('totalHours', {
    id: 'totalHours',
    header: 'Total Hours',
    size: 130,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums font-medium">{formatHours2(info.getValue())}</span>,
  }),
  columnHelper.accessor('originalTotalHours', {
    id: 'originalTotalHours',
    header: 'Original Total Hours',
    size: 160,
    meta: { align: 'right' },
    cell: (info) => <span className="tabular-nums font-medium">{formatHours2(info.getValue())}</span>,
  }),
  columnHelper.accessor('billableUtilizationPercentage', {
    id: 'billableUtilizationPercentage',
    header: 'Billable Utilisation %',
    size: 170,
    meta: { align: 'right' },
    cell: (info) => <UtilizationPercentCell value={info.getValue()} />,
  }),
  columnHelper.accessor('originalBillableUtilizationPercentage', {
    id: 'originalBillableUtilizationPercentage',
    header: 'Original Billable Utilisation %',
    size: 220,
    meta: { align: 'right' },
    cell: (info) => <UtilizationPercentCell value={info.getValue()} />,
  }),
  columnHelper.accessor('nonBillableUtilizationPercentage', {
    id: 'nonBillableUtilizationPercentage',
    header: 'Non-Billable Utilisation %',
    size: 190,
    meta: { align: 'right' },
    cell: (info) => <UtilizationPercentCell value={info.getValue()} />,
  }),
  columnHelper.accessor('originalNonBillableUtilizationPercentage', {
    id: 'originalNonBillableUtilizationPercentage',
    header: 'Original Non-Billable Utilisation %',
    size: 240,
    meta: { align: 'right' },
    cell: (info) => <UtilizationPercentCell value={info.getValue()} />,
  }),
  columnHelper.accessor('overallUtilizationPercentage', {
    id: 'overallUtilizationPercentage',
    header: 'Overall Utilisation %',
    size: 170,
    meta: { align: 'right' },
    cell: (info) => <UtilizationPercentCell value={info.getValue()} />,
  }),
  columnHelper.accessor('originalOverallUtilizationPercentage', {
    id: 'originalOverallUtilizationPercentage',
    header: 'Original Overall Utilisation %',
    size: 220,
    meta: { align: 'right' },
    cell: (info) => <UtilizationPercentCell value={info.getValue()} />,
  }),
];

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

// Every sibling report on this page (Employee Utilization Summary, PM-wise/Project-wise
// Utilization, …) has an Export Excel action — this one didn't. Follows
// EmployeeUtilizationSummary's "export every matching record, not just the current page" pattern
// (one extra request with a wide `limit`) since this endpoint is server-paginated the same way.
const exportToExcel = (rows, isOriginalMode = false) => {
  // In Original mode the API already returns original values in the normal fields,
  // so no extra "Original ..." columns are needed — they'd duplicate the same numbers.
  const hasOriginal = !isOriginalMode && rows.some(
    (r) =>
      r.originalBillableHours != null ||
      r.originalNonBillableHours != null ||
      r.originalTotalHours != null ||
      r.originalBillableUtilizationPercentage != null ||
      r.originalNonBillableUtilizationPercentage != null ||
      r.originalOverallUtilizationPercentage != null
  );

  const header = [
    'Employee',
    'Employee Code',
    'Month',
    'Billable (hrs)',
    ...(hasOriginal ? ['Original Billable (hrs)'] : []),
    'Non-Billable (hrs)',
    ...(hasOriginal ? ['Original Non-Billable (hrs)'] : []),
    'Total Hours',
    ...(hasOriginal ? ['Original Total Hours'] : []),
    'Billable Utilisation %',
    ...(hasOriginal ? ['Original Billable Utilisation %'] : []),
    'Non-Billable Utilisation %',
    ...(hasOriginal ? ['Original Non-Billable Utilisation %'] : []),
    'Overall Utilisation %',
    ...(hasOriginal ? ['Original Overall Utilisation %'] : []),
  ];
  const dataRows = rows.map((r) => [
    r.employeeName ?? '',
    r.employeeCode ?? '',
    shortMonthLabel(r.month, r.year),
    r.billableHours != null ? Number(r.billableHours) : '',
    ...(hasOriginal ? [r.originalBillableHours != null ? Number(r.originalBillableHours) : ''] : []),
    r.nonBillableHours != null ? Number(r.nonBillableHours) : '',
    ...(hasOriginal ? [r.originalNonBillableHours != null ? Number(r.originalNonBillableHours) : ''] : []),
    r.totalHours != null ? Number(r.totalHours) : '',
    ...(hasOriginal ? [r.originalTotalHours != null ? Number(r.originalTotalHours) : ''] : []),
    r.billableUtilizationPercentage != null ? Number(r.billableUtilizationPercentage) : '',
    ...(hasOriginal ? [r.originalBillableUtilizationPercentage != null ? Number(r.originalBillableUtilizationPercentage) : ''] : []),
    r.nonBillableUtilizationPercentage != null ? Number(r.nonBillableUtilizationPercentage) : '',
    ...(hasOriginal ? [r.originalNonBillableUtilizationPercentage != null ? Number(r.originalNonBillableUtilizationPercentage) : ''] : []),
    r.overallUtilizationPercentage != null ? Number(r.overallUtilizationPercentage) : '',
    ...(hasOriginal ? [r.originalOverallUtilizationPercentage != null ? Number(r.originalOverallUtilizationPercentage) : ''] : []),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resource Monthly Utilisation');
  XLSX.writeFile(wb, 'Resource_Monthly_Utilisation_Report.xlsx');
};

// Employee/resource-wise monthly utilization, split into Billable / Non-Billable / Overall — a
// NEW, separate screen from MonthlyResourceUtilization.jsx (dynamic service-category "Excel-
// style" report) and ResourceProjectUtilization.jsx (per-project hours breakdown); neither of
// those files, their API calls, or shared components are touched by this addition.
//
// GET /reports/resource-monthly-utilization has no sortBy/search-across-pages contract beyond a
// single `search` param and is server-paginated — no client-side widen-and-filter needed here.
// `summary` is explicitly PAGE-LEVEL (the backend aggregates only the current page's rows, not
// the full filtered dataset) — shown as-is from the response, never recomputed client-side (the
// task spec is explicit: these are aggregated server-side from hours, not averaged from per-row
// percentages, so summing/averaging them again client-side would double-derive and drift from
// the real figures), and labeled "This Page's Totals" rather than "Total (all pages)" so it's
// never mistaken for a grand total the way IRT/PM-wise Utilization's own Total row is.
const ResourceMonthlyUtilization = () => {
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — backend support for entityIds/businessUnitIds has landed on this report
  // specifically (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md); every other report still uses
  // the single-select EntityFilter/BusinessUnitFilter default.
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exporting, setExporting] = useState(false);
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  const debouncedSearch = useDebounce(search, 400);
  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);

  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);

  const periodReady = !!(monthYear?.month && monthYear?.year);

  // `buId` is always the 'all' sentinel here (never a bare single id) so explicitBuScope always
  // drops the X-Company-Id header — the backend's "no header -> full role reach" fallback is
  // exactly what `businessUnitIds` then narrows, matching the backend contract. A single BU
  // selected this way is request-equivalent to the old single-select path (IN (x) narrows the
  // same as = x), just via the new param instead of the header.
  const params = {
    month: monthYear.month,
    year: monthYear.year,
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(debouncedSearch && { search: debouncedSearch }),
    page,
    limit,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
    // Send hoursSource=O only for Original mode; omit entirely for Adjusted (backend default).
    ...(hoursSource === 'O' && { hoursSource: 'O' }),
  };

  const { data, isPending } = useResourceMonthlyUtilization(params);

  const records = extractReportRows(data);
  const meta = data?.meta ?? {};
  const summary = data?.data?.summary ?? null;
  const showLoading = periodReady && isPending;

  const hasOriginal = useMemo(
    () =>
      records.some(
        (r) =>
          r.originalBillableHours != null ||
          r.originalNonBillableHours != null ||
          r.originalTotalHours != null ||
          r.originalBillableUtilizationPercentage != null ||
          r.originalNonBillableUtilizationPercentage != null ||
          r.originalOverallUtilizationPercentage != null
      ),
    [records]
  );

  const visibleColumns = useMemo(() => {
    if (!records.length) return columns;
    return columns.filter((col) => {
      const key = col.id || col.accessorKey;
      if (typeof key === 'string' && key.startsWith('original')) {
        // In Original mode the API already returns original values in the normal fields,
        // so original* columns would just duplicate them — hide them.
        if (hoursSource === 'O') return false;
        return records.some((r) => r[key] != null);
      }
      return true;
    });
  }, [records, hoursSource]);

  // Export pulls every matching record (not just the current page) with one extra request —
  // same tradeoff EmployeeUtilizationSummary documents for its own export.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getResourceMonthlyUtilization({ ...params, page: 1, limit: total });
      exportToExcel(extractReportRows(res), hoursSource === 'O');
    } finally {
      setExporting(false);
    }
  };

  const activeFilterCount = (entityIds.length > 0 ? 1 : 0)
    + (buIds.length > 0 ? 1 : 0)
    + (employeeIds.length > 0 ? 1 : 0)
    + (clientIds.length > 0 ? 1 : 0)
    + (poIds.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setPoIds([]);
    setPage(1);
  };

  return (
    // No `h-full min-h-0` here (unlike most report pages) — that combination is what tells
    // DataTable to treat itself as the page's internal scroll owner, squeezed into whatever
    // viewport space is left after the header/filters/pagination/summary below it. For a report
    // capped at a small page size (10 rows by default) that squeeze was clipping rows that
    // should just be fully visible, and forcing a matching min-height on the table container
    // instead just left dead empty space AND broke the sticky header/pagination positioning on
    // pages with fewer rows. Letting this page size to its natural content height and scroll as a
    // whole (like the page itself, not the table) avoids both problems.
    <div className="flex flex-col">
      <PageHeader
        title="Resource Monthly Utilisation"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee name or code…"
              className="w-full sm:w-full md:w-72"
            />
            {canViewOriginal && (
              <div className="flex flex-col items-start gap-0.5 shrink-0">
                <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border">
                  {[
                    { value: 'O', label: 'Original' },
                    { value: 'M', label: 'Adjusted' },
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
                <span className="text-[10px] text-muted-foreground pl-1">
                  {hoursSource === 'O' ? 'Original (as logged, before the monthly cap)' : 'Adjusted (after sync)'}
                </span>
              </div>
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[440px]"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setPoIds([]); setPage(1); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setPoIds([]); setPage(1); }} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { if (val) { setMonthYear(val); setPage(1); } }}
            placeholder="Select month"
            clearable={false}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Employee</Label>
          <MultiSelect
            options={[...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) }))]}
            value={employeeIds}
            onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="bg-white h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
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
            className="bg-white h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service PO / Project</Label>
          <MultiSelect
            options={[
              ...activePOs.map((po) => ({ label: po.service_po_name || po.service_po_code || String(po.id), value: String(po.id) })),
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
        columns={visibleColumns}
        data={records}
        isLoading={showLoading}
        emptyState={
          !periodReady ? (
            <EmptyState title="Select a month" description="Choose a month and year to load this report." />
          ) : undefined
        }
        pagination={periodReady && meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Page&apos;s Totals</p>
            <span className="text-[11px] text-muted-foreground">
              Hours basis: {hoursSource === 'O' ? 'Original (as logged, before the monthly cap)' : 'Adjusted (after sync)'}
            </span>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Reflects only the rows shown on this page — not a grand total across every page of results.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Billable Hrs" value={formatHours2(summary.billableHours)} />
            <SummaryItem label="Non-Billable Hrs" value={formatHours2(summary.nonBillableHours)} />
            <SummaryItem label="Total Hrs" value={formatHours2(summary.totalHours)} />
            <SummaryItem label="Billable Utilisation %" value={<UtilizationPercentCell value={summary.billableUtilizationPercentage} />} />
            <SummaryItem label="Non-Billable Utilisation %" value={<UtilizationPercentCell value={summary.nonBillableUtilizationPercentage} />} />
            <SummaryItem label="Overall Utilisation %" value={<UtilizationPercentCell value={summary.overallUtilizationPercentage} />} />
            {hasOriginal && hoursSource !== 'O' && (
              <>
                <SummaryItem label="Original Billable Hrs" value={formatHours2(summary.originalBillableHours)} />
                <SummaryItem label="Original Non-Billable Hrs" value={formatHours2(summary.originalNonBillableHours)} />
                <SummaryItem label="Original Total Hrs" value={formatHours2(summary.originalTotalHours)} />
                <SummaryItem label="Original Billable Utilisation %" value={<UtilizationPercentCell value={summary.originalBillableUtilizationPercentage} />} />
                <SummaryItem label="Original Non-Billable Utilisation %" value={<UtilizationPercentCell value={summary.originalNonBillableUtilizationPercentage} />} />
                <SummaryItem label="Original Overall Utilisation %" value={<UtilizationPercentCell value={summary.originalOverallUtilizationPercentage} />} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceMonthlyUtilization;
