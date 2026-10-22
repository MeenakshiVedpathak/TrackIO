import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { usePmDashboardTeam } from '@/hooks/usePmDashboard';
import { useDebounce } from '@/hooks/useDebounce';
import { formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import SearchInput from '@/components/common/SearchInput';
import SegmentedToggle from '@/components/common/SegmentedToggle';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const ALL_DESIGNATIONS = 'all';
// `designation` is free text (no enum anywhere — confirmed against the employee schema), and
// GET /pm-dashboard/team has no designation query param at all, unlike status. So this is filtered
// client-side, same mechanism the existing Overallocated/Bench toggle already uses, and its option
// list comes from one wide, otherwise-unfiltered probe fetch (same limitation as
// ProjectOverviewTable's status probe: only designations present in the first DESIGNATION_PROBE_LIMIT
// records show up as options).
const DESIGNATION_PROBE_LIMIT = 200;

const columnHelper = createColumnHelper();

// Semantic red/amber/green — deliberately separate from the app's single brand accent color, per
// the spec: overallocated reads as a real capacity risk (red), bench as idle capacity worth
// reassigning (amber), everything else as healthy (green).
const capacityTone = (row) => {
  if (row.overallocation_flag) return 'destructive';
  if (row.bench_flag) return 'warning';
  return 'success';
};

// Deliberately a compact 4-column set (Employee / Designation / Capacity Used / Status) rather
// than every hour breakdown this endpoint returns — this table sits in the dashboard's narrower
// right-hand column (see PmDashboard.jsx's two-column layout), and the full 8-column detail table
// (Monthly Capacity, Planned/Actual/Leave/No-Work Hours as separate columns) made every row
// force a wide horizontal scroll just to see the Status badge. The dropped hour figures aren't
// lost — they're one hover away on the Capacity Used bar's tooltip below. This component is only
// ever used from PmDashboard.jsx, so trimming its columns doesn't affect any other screen.
const columns = [
  columnHelper.accessor('full_name', {
    header: 'Employee',
    size: 180,
    meta: { sticky: true },
    cell: (info) => (
      <div className="min-w-0">
        <p className="truncate font-medium" title={info.getValue()}>{info.getValue()}</p>
        <p className="truncate text-xs text-muted-foreground">{info.row.original.employee_code}</p>
      </div>
    ),
  }),
  columnHelper.accessor('designation', {
    header: 'Designation',
    size: 150,
    enableSorting: false,
    cell: (info) => <div className="truncate max-w-[130px]">{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('capacity_used_pct', {
    header: 'Capacity Used',
    size: 160,
    cell: (info) => {
      const row = info.row.original;
      const pct = info.getValue();
      const tone = capacityTone(row);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-1 cursor-default">
              <span className={cn('text-xs font-semibold tabular-nums', tone === 'destructive' && 'text-destructive')}>
                {formatPercentage(pct)}
              </span>
              <Progress
                value={Math.min(100, Math.max(0, pct ?? 0))}
                className="h-1.5"
                indicatorClassName={
                  tone === 'destructive' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : 'bg-success'
                }
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs space-y-0.5">
            <p>Monthly Capacity: {formatHours(row.monthly_capacity_hours)}</p>
            <p>Planned: {formatHours(row.planned_hours)} · Actual: {formatHours(row.actual_hours)}</p>
            {/* Heuristic, not HR-verified leave data — see api/pmDashboard.api.js: hours logged
                against a Service Type literally named "Leaves" (or a Service PO named "Idle"/
                "On Bench" for no_work_hours). Labelled accordingly, not as authoritative leave. */}
            <p>Leave (logged): {formatHours(row.leave_hours)} · No-Work: {formatHours(row.no_work_hours)}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  }),
  columnHelper.display({
    id: 'status',
    header: 'Status',
    size: 110,
    enableSorting: false,
    cell: (info) => {
      const row = info.row.original;
      if (row.overallocation_flag) return <Badge variant="destructive">Overallocated</Badge>;
      if (row.bench_flag) return <Badge variant="warning">Bench</Badge>;
      return <Badge variant="success">Normal</Badge>;
    },
  }),
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'overallocated', label: 'Overallocated' },
  { value: 'bench', label: 'Bench' },
];

// Section 3 — Team & Capacity: GET /pm-dashboard/team. `statusFilter`/`designationFilter` both
// narrow client-side (the backend has no overallocated/bench/designation query param — only a
// `benchThresholdHours` that shapes the flag itself), same page of results, since a PM's own team
// size makes a second server round-trip pointless. `initialStatusFilter` lets the Overallocated
// Employees KPI land here pre-filtered.
const TeamCapacityTable = ({ monthYear, buScope, initialStatusFilter = 'all' }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [designationFilter, setDesignationFilter] = useState(ALL_DESIGNATIONS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sorting, setSorting] = useState([]);

  const debouncedSearch = useDebounce(search, 400);
  const hasClientFilter = statusFilter !== 'all' || designationFilter !== ALL_DESIGNATIONS;

  const params = {
    ...buScope,
    month: monthYear.month,
    year: monthYear.year,
    // Fetch a wide page when either client-side filter is active, since neither narrows anything
    // beyond what's ALREADY on this page — a small server page could otherwise show "0 results"
    // for a filter that has matches further down the full list.
    page: hasClientFilter ? 1 : page,
    limit: hasClientFilter ? 200 : limit,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = usePmDashboardTeam(params);
  const records = data?.records ?? [];
  const meta = data?.meta ?? {};

  // See DESIGNATION_PROBE_LIMIT above — a second, otherwise-unfiltered fetch purely to populate
  // the dropdown's option list from whatever `designation` values are actually present.
  const { data: designationProbeData } = usePmDashboardTeam({
    ...buScope, month: monthYear.month, year: monthYear.year, page: 1, limit: DESIGNATION_PROBE_LIMIT,
  });
  const designationOptions = useMemo(() => {
    const distinct = new Set(
      (designationProbeData?.records ?? []).map((r) => r.designation).filter(Boolean)
    );
    return [
      { label: 'All Designations', value: ALL_DESIGNATIONS },
      ...Array.from(distinct).sort().map((d) => ({ label: d, value: d })),
    ];
  }, [designationProbeData]);

  const filteredRecords = records.filter((r) => {
    if (statusFilter === 'overallocated' && !r.overallocation_flag) return false;
    if (statusFilter === 'bench' && !r.bench_flag) return false;
    if (designationFilter !== ALL_DESIGNATIONS && r.designation !== designationFilter) return false;
    return true;
  });

  const pagedRecords = hasClientFilter
    ? filteredRecords.slice((page - 1) * limit, page * limit)
    : filteredRecords;

  // Always an object, never `undefined` — same fallback as WorkLogComplianceTable/
  // ProjectOverviewTable: `records.length` covers a backend `meta` that doesn't carry a `total`,
  // so the pagination/page-size footer stays visible instead of silently disappearing.
  const pagination = hasClientFilter
    ? { page, limit, total: filteredRecords.length }
    : { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? records.length };

  return (
    <div className="flex flex-col gap-3">
      {/* `flex-1 min-w-[140px]` on the search box (rather than a fixed w-72) keeps it and the
          Designation select on one line in this card's narrower right-hand column. The
          All/Overallocated/Bench toggle gets its OWN full-width row below rather than squeezing
          in beside them — three-way pill with "Overallocated" as one word needs real width to
          read on one line (see SegmentedToggle's own min-w-0/break-words fix), more than a third
          row-mate would ever leave it. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search employee…"
            className="min-w-[140px] flex-1"
          />
          <SearchableSelect
            options={designationOptions}
            value={designationFilter}
            onValueChange={(v) => { setDesignationFilter(v ?? ALL_DESIGNATIONS); setPage(1); }}
            placeholder="All Designations"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-40 shrink-0 text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
        <SegmentedToggle
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          className="w-full"
        />
      </div>
      <DataTable
        columns={columns}
        data={pagedRecords}
        mobileCards
        isLoading={isPending}
        pagination={pagination}
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default TeamCapacityTable;
