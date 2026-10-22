import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { usePmDashboardProjects } from '@/hooks/usePmDashboard';
import { useDebounce } from '@/hooks/useDebounce';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { formatDate, formatHours, formatPercentage, getStatusColor, capitalize } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import SearchInput from '@/components/common/SearchInput';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/utils/cn';

const ALL_STATUS = 'all';
// One wide, status-unfiltered probe (limit=100) purely to learn which `project_status` values
// actually exist for this PM's portfolio this month — there's no confirmed enum for this field
// anywhere in the app (unlike Service PO status, which has a documented fixed list), so guessing
// options up front risks offering a value the backend rejects, or omitting one that's real. This
// necessarily only surfaces values present in the first 100 records; a PM managing more distinct
// statuses than that across more than 100 projects would see an incomplete option list — call out
// to the backend for a real status enum (or a dedicated distinct-values endpoint) if that turns
// out to matter in practice.
const STATUS_PROBE_LIMIT = 100;

const columnHelper = createColumnHelper();

// Only these map onto the backend's documented sortBy enum (project_name|team_size|
// planned_hours|actual_hours|variance_pct|overdue_po_count|nearest_end_date) — every other
// column here (Client, Status, # Service POs, Risk) has no server-side sort field to send, so
// they're left non-sortable rather than silently sending a sortBy value the backend won't
// recognize.
const columns = [
  columnHelper.accessor('project_name', {
    header: 'Project Name',
    size: 220,
    meta: { sticky: true },
    cell: (info) => (
      <div className="truncate max-w-[200px] font-medium" title={info.getValue()}>
        {info.getValue()}
      </div>
    ),
  }),
  columnHelper.accessor('client_name', {
    header: 'Client',
    size: 160,
    enableSorting: false,
    cell: (info) => <div className="truncate max-w-[140px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('project_status', {
    header: 'Status',
    size: 110,
    enableSorting: false,
    cell: (info) => <Badge variant={getStatusColor(info.getValue())}>{capitalize(info.getValue())}</Badge>,
  }),
  columnHelper.accessor('service_po_count', {
    header: '# Service POs',
    size: 120,
    enableSorting: false,
    cell: (info) => (
      <span className="tabular-nums">
        {info.getValue() ?? 0}
        <span className="text-muted-foreground"> ({info.row.original.active_po_count ?? 0} active)</span>
      </span>
    ),
  }),
  columnHelper.accessor('team_size', {
    header: 'Team Size',
    // 130, not 100 — "Team Size" plus its sort-direction icon didn't fit in 100px and was
    // silently ellipsis-truncated to "Team …", same fix as Nearest Deadline below.
    size: 130,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? 0}</span>,
  }),
  columnHelper.accessor('actual_hours', {
    header: 'Logged Hours',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('planned_hours', {
    header: 'Planned Hours',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('variance_pct', {
    header: 'Variance %',
    size: 110,
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className={cn('tabular-nums font-medium', v != null && Math.abs(v) >= 20 && 'text-destructive')}>
          {v == null ? '—' : formatPercentage(v)}
        </span>
      );
    },
  }),
  columnHelper.accessor('risk_flag', {
    header: 'Risk',
    size: 100,
    enableSorting: false,
    cell: (info) => (
      <Badge variant={info.getValue() ? 'destructive' : 'success'}>
        {info.getValue() ? 'At Risk' : 'On Track'}
      </Badge>
    ),
  }),
  columnHelper.accessor('nearest_end_date', {
    header: 'Nearest Deadline',
    // 160, not 140 — same sort-icon-doesn't-fit truncation as Team Size above.
    size: 160,
    cell: (info) => <span className="whitespace-nowrap">{formatDate(info.getValue())}</span>,
  }),
];

// Section 1 — Project Overview: the default view of GET /pm-dashboard/projects. Deliberately
// deferred (useInViewOnce) — the KPI row and Action Required feed above the fold must populate
// instantly on load; this table is allowed to lazy-load once it's about to scroll into view.
const ProjectOverviewTable = ({ monthYear, buScope }) => {
  const [sectionRef, inView] = useInViewOnce();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  // Default sort: nearest deadline first (the backend has no direct "risk first" sortBy field —
  // see the client-side re-sort below for how that half of the spec's default order is met).
  const [sorting, setSorting] = useState([{ id: 'nearest_end_date', desc: false }]);

  const debouncedSearch = useDebounce(search, 400);

  const params = {
    ...buScope,
    month: monthYear.month,
    year: monthYear.year,
    page,
    limit,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== ALL_STATUS && { status: statusFilter }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = usePmDashboardProjects(params, inView);
  const records = data?.records ?? [];
  const meta = data?.meta ?? {};

  // See STATUS_PROBE_LIMIT above — a second, status-unfiltered fetch purely to populate the
  // dropdown's option list from whatever `project_status` values are actually present.
  const { data: statusProbeData } = usePmDashboardProjects(
    { ...buScope, month: monthYear.month, year: monthYear.year, page: 1, limit: STATUS_PROBE_LIMIT },
    inView
  );
  const statusOptions = useMemo(() => {
    const distinct = new Set(
      (statusProbeData?.records ?? []).map((r) => r.project_status).filter(Boolean)
    );
    return [
      { label: 'All Status', value: ALL_STATUS },
      ...Array.from(distinct).sort().map((s) => ({ label: capitalize(s), value: s })),
    ];
  }, [statusProbeData]);

  // Risk-first is only ever applied on top of the untouched default sort (nearest deadline,
  // ascending) — the moment a user clicks a different column header, their explicit choice is
  // respected as-is rather than fighting it with a risk-flag regroup they didn't ask for.
  const isDefaultSort = sorting.length === 0 || (sorting[0]?.id === 'nearest_end_date' && !sorting[0]?.desc);
  const displayRecords = useMemo(() => {
    if (!isDefaultSort) return records;
    // Array.prototype.sort is stable in every modern engine, so this only regroups by risk —
    // the server's own nearest_end_date-ascending order is preserved within each group.
    return [...records].sort((a, b) => (b.risk_flag === true) - (a.risk_flag === true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, isDefaultSort]);

  return (
    <div ref={sectionRef} className="flex flex-col gap-3">
      {/* `flex-1 min-w-[160px]` on the search box (rather than a fixed w-72) + a fixed-but-
          compact w-36 on the select is what actually keeps these on one line in this card's
          narrower column — the old w-72 + w-44 pair (472px) didn't fit the dashboard's two-column
          layout's left card at ordinary desktop widths and wrapped onto two lines. */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search project or client…"
          className="min-w-[160px] flex-1"
        />
        <SearchableSelect
          options={statusOptions}
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v ?? ALL_STATUS); setPage(1); }}
          placeholder="All Status"
          className="h-[clamp(1.875rem,2vw,2.25rem)] w-36 shrink-0 text-[clamp(0.75rem,0.85vw,0.875rem)]"
        />
      </div>
      <DataTable
        columns={columns}
        data={displayRecords}
        mobileCards
        isLoading={!inView || isPending}
        // Always an object, never `undefined` — see WorkLogComplianceTable's identical fallback:
        // falls back to `records.length` for `total` when the backend's own `meta` doesn't carry
        // one, so the pagination/page-size footer stays visible instead of silently disappearing.
        pagination={{ page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? displayRecords.length }}
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default ProjectOverviewTable;
