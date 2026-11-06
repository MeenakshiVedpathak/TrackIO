import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Info } from 'lucide-react';
import { useEmployeeUtilizationSummary, useEmployeeUtilizationSummaryTotals } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatHours } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { useExportConfirm } from '@/components/common/ExportConfirm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import HoursBasisToggle, { HOURS_ADJUSTED, HOURS_ORIGINAL } from '@/components/common/HoursBasisToggle';

const columnHelper = createColumnHelper();

// Every hour/percentage metric below has an `original_*` twin (hours as logged, before the
// monthly-cap sync). The "Hours basis" switch picks which one is shown — one column per metric.
const basisValue = (r, key, isOriginal) => (isOriginal ? r[`original_${key}`] : r[key]);

const exportToExcel = (rows, isOriginal) => {
  const sfx = isOriginal ? ' (Original)' : '';
  const num = (r, key) => {
    const v = basisValue(r, key, isOriginal);
    return v != null ? Number(v) : '';
  };
  const header = [
    'Employee', 'Designation', 'Total Experience (yrs)', 'Company Experience (yrs)', 'Clients',
    `Billable Hours${sfx}`,
    `Non-Billable Hours${sfx}`,
    `Internal Support Hours${sfx}`,
    `Team Management Hours${sfx}`,
    `Leaves Hours${sfx}`,
    `L&D Hours${sfx}`,
    `Others Hours${sfx}`,
    'Monthly Capacity',
    `Total Hours (Excl. Leaves)${sfx}`,
  ];
  const dataRows = rows.map((r) => [
    r.full_name ?? '',
    r.designation ?? '',
    r.total_experience ?? '',
    r.company_experience ?? '',
    r.clients ?? '',
    num(r, 'billable_total'),
    num(r, 'non_billable_total'),
    num(r, 'internal_support_hours'),
    num(r, 'team_management_hours'),
    num(r, 'leaves_hours'),
    num(r, 'lnd_hours'),
    num(r, 'others_hours'),
    r.monthly_capacity != null ? Number(r.monthly_capacity) : '',
    num(r, 'total_utilization_excl_leaves_pct'),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Utilization Summary');
  XLSX.writeFile(wb, 'Employee_Utilization_Summary.xlsx');
};

const now = new Date();

const ExperienceCell = ({ value }) =>
  value != null
    ? <span className="tabular-nums whitespace-nowrap">{value} yrs</span>
    : <span className="text-muted-foreground">—</span>;

const HoursCell = ({ value }) =>
  value == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{formatHours(value)}</span>;

const buildColumns = (isOriginal) => [
  columnHelper.accessor('full_name', {
    header: 'Employee',
    size: 200,
    meta: { sticky: true, left: 0 },
    cell: (info) => <div className="truncate font-medium max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('designation', {
    header: 'Designation',
    size: 170,
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('total_experience', {
    header: 'Total Experience',
    size: 140,
    cell: (info) => <ExperienceCell value={info.getValue()} />,
  }),
  columnHelper.accessor('company_experience', {
    header: 'Company Experience',
    size: 150,
    cell: (info) => <ExperienceCell value={info.getValue()} />,
  }),
  columnHelper.accessor('clients', {
    header: 'Clients',
    size: 220,
    cell: (info) => <div className="truncate max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor((r) => basisValue(r, 'billable_total', isOriginal), {
    id: 'billable_total',
    header: 'Billable Hours',
    size: 140,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'non_billable_total', isOriginal), {
    id: 'non_billable_total',
    header: 'Non-Billable Hours',
    size: 160,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'internal_support_hours', isOriginal), {
    id: 'internal_support_hours',
    header: 'Internal Support',
    size: 150,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'team_management_hours', isOriginal), {
    id: 'team_management_hours',
    header: 'Team Management',
    size: 160,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'leaves_hours', isOriginal), {
    id: 'leaves_hours',
    header: 'Leaves',
    size: 110,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'lnd_hours', isOriginal), {
    id: 'lnd_hours',
    header: 'L&D',
    size: 100,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'others_hours', isOriginal), {
    id: 'others_hours',
    header: 'Others',
    size: 110,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor('monthly_capacity', {
    header: 'Monthly Capacity',
    size: 150,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
  columnHelper.accessor((r) => basisValue(r, 'total_utilization_excl_leaves_pct', isOriginal), {
    id: 'total_utilization_excl_leaves_pct',
    header: 'Total Hours (Excl. Leaves)',
    size: 190,
    cell: (info) => <HoursCell value={info.getValue()} />,
  }),
];

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

const EmployeeUtilizationSummary = () => {
  const confirmExport = useExportConfirm();
  const [monthYear, setMonthYear] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — backend support for entityIds/businessUnitIds has landed on this report
  // specifically (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md); every other report still uses
  // the single-select EntityFilter/BusinessUnitFilter default.
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [hoursSource, setHoursSource] = useState(HOURS_ADJUSTED);

  const debouncedSearch = useDebounce(search, 400);

  // `buId` is always the 'all' sentinel here (never a bare single id) so explicitBuScope always
  // drops the X-Company-Id header — the backend's "no header -> full role reach" fallback is
  // exactly what `businessUnitIds` then narrows, matching the backend contract.
  const params = {
    // Original basis: the server then sorts, ranks and totals on original hours too.
    ...(hoursSource === HOURS_ORIGINAL && { hoursSource: 'O' }),
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    page,
    limit,
    ...(debouncedSearch && { search: debouncedSearch }),
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useEmployeeUtilizationSummary(params);
  // The backend's own `summary` only aggregates the current page — recomputes the true
  // all-pages total client-side. See useEmployeeUtilizationSummaryTotals for detail.
  const { data: totalsSummary } = useEmployeeUtilizationSummaryTotals(params);

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const summary = totalsSummary ?? data?.data?.summary ?? null;
  const meta = data?.meta ?? {};

  const hasOriginalData = records.some((r) =>
    r.original_billable_total != null ||
    r.original_non_billable_total != null ||
    r.original_internal_support_hours != null ||
    r.original_team_management_hours != null ||
    r.original_leaves_hours != null ||
    r.original_lnd_hours != null ||
    r.original_others_hours != null ||
    r.original_total_utilization_excl_leaves_pct != null
  );
  // No original_* data at all -> the report behaves exactly as Adjusted.
  const isOriginal = hasOriginalData && hoursSource === HOURS_ORIGINAL;
  const visibleColumns = useMemo(() => buildColumns(isOriginal), [isOriginal]);

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    hoursSource !== HOURS_ADJUSTED,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setHoursSource(HOURS_ADJUSTED);
    setPage(1);
  };

  // Export pulls every matching record (not just the current page) with one extra request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getEmployeeUtilizationSummary({ ...params, page: 1, limit: total });
      const allRecords = Array.isArray(res?.data?.records) ? res.data.records : [];
      exportToExcel(allRecords, isOriginal);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Employee Utilization Summary"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee name, code…"
              className="w-full sm:w-full md:w-56"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={() => confirmExport(handleExport)} disabled={exporting}>
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      {/* This report deliberately does NOT stop at your own BU's Service POs — an employee
          resourced onto another Business Unit's PO still has those hours counted here, so this
          reflects their true total workload, not just what's billed to your own BU. */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/30 bg-info-muted/40 px-4 py-3 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          Hours here include everything the employee logged this month — even against a Service PO
          owned by a different Business Unit. This shows their true total workload, not just the
          portion billed to your own BU.
        </p>
      </div>

      {/* Collapsible filter panel */}
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[560px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={setBuIds} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>

        {hasOriginalData && (
          <HoursBasisToggle
            value={hoursSource}
            onChange={(v) => { setHoursSource(v); setPage(1); }}
            labelClassName="text-xs"
          />
        )}
      </FilterPanel>

      <DataTable
        columns={visibleColumns}
        data={records}
        mobileCards
        isLoading={isPending}
        pagination={meta.total != null ? {
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total,
        } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Billable Hours" value={formatHours(basisValue(summary, 'billable_total', isOriginal))} />
            <SummaryItem label="Non-Billable Hours" value={formatHours(basisValue(summary, 'non_billable_total', isOriginal))} />
            <SummaryItem label="Internal Support" value={formatHours(basisValue(summary, 'internal_support_hours', isOriginal))} />
            <SummaryItem label="Team Management" value={formatHours(basisValue(summary, 'team_management_hours', isOriginal))} />
            <SummaryItem label="Leaves" value={formatHours(basisValue(summary, 'leaves_hours', isOriginal))} />
            <SummaryItem label="L&D" value={formatHours(basisValue(summary, 'lnd_hours', isOriginal))} />
            <SummaryItem label="Others" value={formatHours(basisValue(summary, 'others_hours', isOriginal))} />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeUtilizationSummary;
