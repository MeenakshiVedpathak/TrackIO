import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { usePmDashboardWorklog } from '@/hooks/usePmDashboard';
import { useDebounce } from '@/hooks/useDebounce';
import { formatHours } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import SearchInput from '@/components/common/SearchInput';
import { Badge } from '@/components/ui/badge';

const columnHelper = createColumnHelper();

// No sortBy/sortOrder here — the spec documents none for GET /pm-dashboard/worklog (it's a thin
// pass-through to the existing compliance report), so every column is display-only.
const columns = [
  columnHelper.accessor('employee_name', {
    header: 'Employee',
    size: 200,
    meta: { sticky: true },
    enableSorting: false,
    cell: (info) => (
      <div className="min-w-0">
        <p className="truncate font-medium" title={info.getValue()}>{info.getValue()}</p>
        <p className="truncate text-xs text-muted-foreground">{info.row.original.employee_code}</p>
      </div>
    ),
  }),
  columnHelper.accessor('business_unit', {
    header: 'Business Unit',
    size: 160,
    enableSorting: false,
    cell: (info) => <div className="truncate max-w-[140px]">{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('logged_hours', {
    header: 'Logged Hours',
    size: 130,
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('required_hours', {
    header: 'Required Hours',
    size: 130,
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('shortfall_hours', {
    header: 'Shortfall',
    size: 120,
    enableSorting: false,
    cell: (info) => (
      <span className="tabular-nums font-medium text-destructive">
        {info.getValue() > 0 ? `-${formatHours(info.getValue())}` : formatHours(0)}
      </span>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 130,
    enableSorting: false,
    cell: (info) => (
      <Badge variant={info.getValue() === 'Incomplete' ? 'destructive' : 'success'}>
        {info.getValue()}
      </Badge>
    ),
  }),
];

// Section 4 — Work Log / Effort: GET /pm-dashboard/worklog (missing/shortfall list for the
// selected month).
const WorkLogComplianceTable = ({ monthYear, buScope }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const debouncedSearch = useDebounce(search, 400);

  const params = {
    ...buScope,
    month: monthYear.month,
    year: monthYear.year,
    page,
    limit,
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isPending } = usePmDashboardWorklog(params);
  const records = data?.records ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search employee…"
        className="w-full sm:w-72"
      />
      <DataTable
        columns={columns}
        data={records}
        mobileCards
        isLoading={isPending}
        // Always an object, never `undefined` — falling back to `records.length` for `total`
        // when the backend's own `meta` doesn't carry one keeps the pagination/page-size footer
        // visible even then, rather than silently disappearing (confirmed live: GET
        // /pm-dashboard/worklog doesn't always return a `total`).
        pagination={{ page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? records.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        emptyState={
          <div className="py-16 text-center text-sm text-muted-foreground">
            No shortfalls — everyone has met their required hours this period.
          </div>
        }
      />
    </div>
  );
};

export default WorkLogComplianceTable;
