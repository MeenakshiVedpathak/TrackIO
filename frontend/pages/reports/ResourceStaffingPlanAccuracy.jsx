import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useResourceStaffingPlanAccuracy } from '@/hooks/useReports';
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
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';

const columnHelper = createColumnHelper();

const DEFAULT_THRESHOLD_PCT = 20;
// Risk filtering/totals only make sense across the WHOLE month's data, not one server page, so
// the whole matching set is fetched once (capped well above any realistic employee×PO headcount
// for a single month) and paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const exportToExcel = (rows) => {
  const header = [
    'Employee Code', 'Employee Name', 'PO Code', 'PO Name',
    'Planned Hours', 'Actual Hours', 'Variance', 'Variance %', 'At Risk',
  ];
  const dataRows = rows.map((r) => [
    r.employee_code ?? '',
    r.full_name ?? '',
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.planned_hours != null ? Number(r.planned_hours) : '',
    r.actual_hours != null ? Number(r.actual_hours) : '',
    r.variance != null ? Number(r.variance) : '',
    r.variance_pct != null ? Number(r.variance_pct) : '',
    r.at_risk ? 'At Risk' : 'OK',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Staffing Plan Accuracy');
  XLSX.writeFile(wb, `Resource_Staffing_Plan_Accuracy.xlsx`);
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const columns = [
  columnHelper.accessor('employee_code', {
    header: 'Employee Code',
    size: 140,
    cell: (info) => <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">{info.getValue() || '—'}</span>,
  }),
  columnHelper.accessor('full_name', {
    header: 'Employee Name',
    size: 200,
    cell: (info) => <div className="truncate max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('service_po_code', {
    header: 'PO Code',
    size: 140,
    cell: (info) => <span className="font-mono text-xs whitespace-nowrap">{info.getValue() || '—'}</span>,
  }),
  columnHelper.accessor('service_po_name', {
    header: 'PO Name',
    size: 220,
    cell: (info) => <div className="truncate max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('planned_hours', {
    header: 'Planned Hours',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('actual_hours', {
    header: 'Actual Hours',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('variance', {
    header: 'Variance',
    size: 120,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('variance_pct', {
    header: 'Variance %',
    size: 120,
    // planned_hours = 0 guards div-by-zero on the backend, so variance_pct arrives as null.
    cell: (info) => <span className="tabular-nums">{info.getValue() == null ? '—' : formatPercentage(info.getValue())}</span>,
  }),
  columnHelper.accessor('at_risk', {
    header: 'At Risk',
    size: 110,
    cell: (info) => (
      <Badge variant={info.getValue() ? 'destructive' : 'outline'}>
        {info.getValue() ? 'At Risk' : 'OK'}
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

const ResourceStaffingPlanAccuracy = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [varianceThresholdPct, setVarianceThresholdPct] = useState(String(DEFAULT_THRESHOLD_PCT));
  const [riskFilter, setRiskFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const debouncedThresholdPct = useDebounce(varianceThresholdPct, 400);

  // Risk is computed client-side (see effectiveThresholdPct below) and must filter across every
  // matching row, not just whatever page the server would have returned — so the whole month's
  // matching set is fetched in one shot (page/limit below are for client-side pagination only,
  // never sent to the API) and everything downstream (filtering, pagination, totals) works off it.
  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    ...(debouncedThresholdPct !== '' && { varianceThresholdPct: Number(debouncedThresholdPct) }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useResourceStaffingPlanAccuracy(params);

  const records = data?.data?.records ?? [];

  // The backend is sent `varianceThresholdPct` too, but the "At Risk" flag it returns doesn't
  // reliably reflect it — recompute client-side from variance_pct so the badge always matches
  // what's currently typed, using the live (non-debounced) value for instant feedback. Falls
  // back to the server's own flag only when variance_pct is null (planned_hours = 0).
  const effectiveThresholdPct = (() => {
    if (varianceThresholdPct === '') return DEFAULT_THRESHOLD_PCT;
    const n = Number(varianceThresholdPct);
    return Number.isFinite(n) ? n : DEFAULT_THRESHOLD_PCT;
  })();

  const withComputedAtRisk = (rows, thresholdPct) =>
    rows.map((r) => ({
      ...r,
      at_risk: r.variance_pct != null ? Math.abs(r.variance_pct) > thresholdPct : r.at_risk,
    }));

  const displayRecords = withComputedAtRisk(records, effectiveThresholdPct);

  const matchesRiskFilter = (r) => {
    if (riskFilter === 'all') return true;
    return riskFilter === 'at_risk' ? !!r.at_risk : !r.at_risk;
  };

  // Search covers the identifying columns only; the hours/variance columns are left out, since
  // substring-matching a number misleads more than it helps.
  const matchesSearch = (r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.employee_code, r.full_name, r.service_po_code, r.service_po_name]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  };

  // Full, risk- and search-filtered set the whole page/pagination/totals below are derived from.
  const filteredRecords = useMemo(
    () => displayRecords.filter((r) => matchesRiskFilter(r) && matchesSearch(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayRecords, riskFilter, search]
  );
  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

  // Recomputed client-side from the full filtered set rather than trusted from the backend's own
  // `summary` — it has no notion of the risk filter, and would double-count when narrowed to
  // "At Risk"/"OK" only. Mirrors the same reasoning as effectiveThresholdPct above.
  const summary = filteredRecords.length > 0 ? {
    total_planned_hours: filteredRecords.reduce((sum, r) => sum + (Number(r.planned_hours) || 0), 0),
    total_actual_hours: filteredRecords.reduce((sum, r) => sum + (Number(r.actual_hours) || 0), 0),
    total_variance_hours: filteredRecords.reduce((sum, r) => sum + (Number(r.variance) || 0), 0),
    variance_threshold_pct_used: effectiveThresholdPct,
  } : null;

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    varianceThresholdPct !== String(DEFAULT_THRESHOLD_PCT),
    riskFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setVarianceThresholdPct(String(DEFAULT_THRESHOLD_PCT));
    setRiskFilter('all');
    setPage(1);
  };

  // Already have the full filtered set in memory — no need for a second network round-trip.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Staffing Plan Accuracy"
        description="Planned vs actual hours per employee/Service PO, flagged when variance exceeds a threshold."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee, PO…"
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

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[340px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
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
          <Label className="text-xs">Variance Threshold %</Label>
          <Input
            type="number"
            min={0}
            value={varianceThresholdPct}
            onChange={(e) => { setVarianceThresholdPct(e.target.value); setPage(1); }}
            placeholder="20"
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Risk</Label>
          <SearchableSelect
            showSearch={false}
            options={[
              { label: 'All', value: 'all' },
              { label: 'At Risk', value: 'at_risk' },
              { label: 'OK', value: 'ok' },
            ]}
            value={riskFilter}
            onValueChange={(v) => { setRiskFilter(v); setPage(1); }}
            placeholder="All"
            className="h-9 w-full text-sm"
          />
        </div>
      </FilterPanel>

      <DataTable
        columns={columns}
        data={pagedRecords}
        mobileCards
        isLoading={isPending}
        pagination={{ page, limit, total: filteredRecords.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Total Planned Hours" value={formatHours(summary.total_planned_hours)} />
            <SummaryItem label="Total Actual Hours" value={formatHours(summary.total_actual_hours)} />
            <SummaryItem label="Total Variance Hours" value={formatHours(summary.total_variance_hours)} />
            <SummaryItem label="Threshold Used" value={formatPercentage(summary.variance_threshold_pct_used)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceStaffingPlanAccuracy;
