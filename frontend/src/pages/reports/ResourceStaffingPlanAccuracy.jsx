import { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Info } from 'lucide-react';
import { useResourceStaffingPlanAccuracy } from '@/hooks/useReports';
import { formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const columnHelper = createColumnHelper();

const DEFAULT_THRESHOLD_PCT = 20;
const MAX_RECORDS_FETCH = 5000;

// Status computed client-side from variance_pct and threshold T.
// Under-delivery (≤ -T) is "At Risk"; over-delivery (≥ +T) is "Over Plan". Never symmetrical.
const computeStatus = (variancePct, actualHours, T) => {
  if (variancePct == null && Number(actualHours ?? 0) > 0) return 'no_plan';
  if (variancePct == null) return 'ok';
  if (variancePct <= -T) return 'at_risk';
  if (variancePct >= T) return 'over_plan';
  return 'ok';
};

const STATUS_META = {
  at_risk:   { label: 'At Risk',   variant: 'destructive' },
  over_plan: { label: 'Over Plan', variant: 'secondary' },
  no_plan:   { label: 'No Plan',   variant: 'secondary' },
  ok:        { label: 'OK',        variant: 'outline' },
};

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] ?? STATUS_META.ok;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
};

const exportToExcel = (rows, hoursSource) => {
  const hoursLabel = hoursSource === 'O' ? 'Original Hours (as logged)' : 'Actual Hours (After Sync)';
  const header = [
    'Employee Code', 'Employee Name', 'PO Code', 'PO Name',
    'Planned Hours', hoursLabel, 'Variance', 'Variance %', 'Status',
  ];
  const dataRows = rows.map((r) => [
    r.employee_code ?? '',
    r.full_name ?? '',
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.planned_hours != null ? Number(r.planned_hours) : '',
    r._actual != null ? Number(r._actual) : '',
    r._variance != null ? Number(r._variance) : '',
    r._variance_pct != null ? Number(r._variance_pct) : '',
    STATUS_META[r._status]?.label ?? 'OK',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Staffing Plan Accuracy');
  XLSX.writeFile(wb, 'Resource_Staffing_Plan_Accuracy.xlsx');
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

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
  // 'M' = Adjusted (after monthly-cap sync), 'O' = Original (as logged)
  const [hoursSource, setHoursSource] = useState('M');
  const [statusFilter, setStatusFilter] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const recomputeTimer = useRef(null);

  // Show a brief loader when variance threshold changes so the user sees feedback.
  useEffect(() => {
    setIsRecomputing(true);
    clearTimeout(recomputeTimer.current);
    recomputeTimer.current = setTimeout(() => setIsRecomputing(false), 400);
    return () => clearTimeout(recomputeTimer.current);
  }, [varianceThresholdPct, hoursSource]);

  const effectiveThresholdPct = (() => {
    if (varianceThresholdPct === '') return DEFAULT_THRESHOLD_PCT;
    const n = Number(varianceThresholdPct);
    return Number.isFinite(n) ? n : DEFAULT_THRESHOLD_PCT;
  })();

  // Do NOT send varianceThresholdPct — the backend uses it as a row filter and drops "OK" rows,
  // which empties the table for a high threshold. The threshold only drives the client-side badge.
  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useResourceStaffingPlanAccuracy(params);
  const records = data?.data?.records ?? [];

  // Map each record to the active basis (Adjusted or Original) so all downstream logic
  // (status, totals, export) is basis-agnostic — no refetch needed, both sets live in the response.
  const withBasis = useMemo(() => records.map((r) => {
    const actual      = hoursSource === 'O' ? r.original_actual_hours : r.actual_hours;
    const variance    = hoursSource === 'O' ? r.original_variance     : r.variance;
    const variancePct = hoursSource === 'O' ? r.original_variance_pct : r.variance_pct;
    return {
      ...r,
      _actual:      actual,
      _variance:    variance,
      _variance_pct: variancePct,
      _status:      computeStatus(variancePct, actual, effectiveThresholdPct),
    };
  }), [records, hoursSource, effectiveThresholdPct]);

  const matchesStatusFilter = (r) => statusFilter.length === 0 || statusFilter.includes(r._status);

  const matchesSearch = (r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.employee_code, r.full_name, r.service_po_code, r.service_po_name]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  };

  const filteredRecords = useMemo(
    () => withBasis.filter((r) => matchesStatusFilter(r) && matchesSearch(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withBasis, statusFilter, search],
  );
  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

  const summary = filteredRecords.length > 0 ? {
    total_planned:  filteredRecords.reduce((s, r) => s + (Number(r.planned_hours) || 0), 0),
    total_actual:   filteredRecords.reduce((s, r) => s + (Number(r._actual) || 0), 0),
    total_variance: filteredRecords.reduce((s, r) => s + (Number(r._variance) || 0), 0),
  } : null;

  const hoursColHeader = hoursSource === 'O' ? 'Original Hours (as logged)' : 'Actual Hours (After Sync)';

  // Columns rebuilt when hoursSource changes so the hours column header updates immediately.
  const columns = useMemo(() => [
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
      size: 130,
      meta: { align: 'right' },
      cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
    }),
    columnHelper.display({
      id: 'active_hours',
      header: hoursColHeader,
      size: 180,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original._actual != null ? formatHours(row.original._actual) : '—'}</span>,
    }),
    columnHelper.display({
      id: 'active_variance',
      header: 'Variance',
      size: 110,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original._variance != null ? formatHours(row.original._variance) : '—'}</span>,
    }),
    columnHelper.display({
      id: 'active_variance_pct',
      header: 'Variance %',
      size: 110,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{row.original._variance_pct == null ? '—' : formatPercentage(row.original._variance_pct)}</span>,
    }),
    columnHelper.display({
      id: 'status',
      header: 'Status',
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original._status} />,
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [hoursColHeader]);

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    varianceThresholdPct !== String(DEFAULT_THRESHOLD_PCT),
    statusFilter.length > 0,
    hoursSource !== 'M',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setVarianceThresholdPct(String(DEFAULT_THRESHOLD_PCT));
    setStatusFilter([]);
    setHoursSource('M');
    setPage(1);
  };

  const handleExport = () => exportToExcel(filteredRecords, hoursSource);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Staffing Plan Accuracy"
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
        maxHeightClass="max-h-[460px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-[clamp(0.5rem,0.8vw,0.75rem)] w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={setBuIds} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <Label className="text-xs font-medium">Hours basis</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  {hoursSource === 'O'
                    ? 'Original (as logged, before the monthly cap)'
                    : 'Adjusted (after sync)'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted border w-fit">
            {[
              { value: 'M', label: 'Adjusted' },
              { value: 'O', label: 'Original' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setHoursSource(value); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                  hoursSource === value
                    ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <Label className="text-xs font-medium">Allowed Deviation ± %</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  Plan se itna % kam = At Risk, itna % zyada = Over Plan.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            type="number"
            min={0}
            value={varianceThresholdPct}
            onChange={(e) => { setVarianceThresholdPct(e.target.value); setPage(1); }}
            placeholder="20"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Status</Label>
          <MultiSelect
            options={[
              { label: 'At Risk (under plan)',  value: 'at_risk' },
              { label: 'Over Plan',             value: 'over_plan' },
              { label: 'No Plan',               value: 'no_plan' },
              { label: 'OK',                    value: 'ok' },
            ]}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
            placeholder="All"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
      </FilterPanel>

      <DataTable
        columns={columns}
        data={pagedRecords}
        mobileCards
        isLoading={isPending || isRecomputing}
        pagination={{ page, limit, total: filteredRecords.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Total Planned Hours"  value={formatHours(summary.total_planned)} />
            <SummaryItem label={`Total ${hoursColHeader}`} value={formatHours(summary.total_actual)} />
            <SummaryItem label="Total Variance Hours" value={formatHours(summary.total_variance)} />
            <SummaryItem label="Threshold Used"       value={formatPercentage(effectiveThresholdPct)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceStaffingPlanAccuracy;
