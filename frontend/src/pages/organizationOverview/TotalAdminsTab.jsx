import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useTotalAdmins } from '@/hooks/usePlatformAdminReports';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const TruncatedCell = ({ value, maxWidth = '200px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn('text-sm truncate', className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

// Tab 5 — unlike the four tabs above (all derived from Organization Overview's one shared API
// call), this one owns its own real, independent server fetch: GET /platform-admin/total-admins,
// confirmed (2026-09). Column ids below (employee_code/full_name/email/created_at) double as
// `sort_by` values — they must match the backend's accepted sort_by enum exactly
// ('email'|'created_at'|'full_name'|'employee_code'). Status/Created By aren't in that enum, so
// sorting is disabled on those two columns.
const TotalAdminsTab = ({ toolbarSlot }) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState([]);
  const debouncedSearch = useDebounce(search, 400);

  const params = {
    page,
    limit,
    status: statusFilter,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useTotalAdmins(params);
  const admins = data?.data ?? [];
  const meta = data?.meta ?? {};

  const columns = [
    columnHelper.accessor('employee_code', {
      header: 'Emp Code',
      size: 130,
      meta: { sticky: true, left: 0 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="110px" className="font-medium" />,
    }),
    columnHelper.accessor('full_name', {
      header: 'Name',
      size: 180,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="160px" />,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      size: 240,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="220px" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 120,
      enableSorting: false,
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor('created_at', {
      header: 'Created On',
      size: 130,
      cell: (info) => <span className="text-sm whitespace-nowrap">{formatDate(info.getValue())}</span>,
    }),
    columnHelper.accessor('created_by', {
      header: 'Created By',
      size: 180,
      enableSorting: false,
      cell: (info) => {
        const createdBy = info.getValue();
        if (!createdBy) return <span className="text-sm text-muted-foreground">—</span>;
        return <TruncatedCell value={createdBy.name ?? createdBy.email} maxWidth="160px" />;
      },
    }),
  ];

  return (
    <>
      {/* Rendered into the tab-bar row (see OrganizationOverview.jsx), right-aligned next to the
          tab switcher — same slot/position every sibling tab's own Filters/Export uses, instead
          of DataTable's own left-aligned toolbar row. */}
      {toolbarSlot && createPortal(
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
            <Input
              placeholder="Search admins…"
              className="pl-9 w-[220px] h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-[clamp(1.875rem,2vw,2.25rem)] w-[160px] bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>,
        toolbarSlot
      )}
    <DataTable
      className="flex-1 min-h-0"
      columns={columns}
      data={admins}
      isLoading={isPending}
      pagination={meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
      sorting={sorting}
      onSortingChange={(s) => { setSorting(s); setPage(1); }}
      onPageChange={setPage}
      onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
    />
    </>
  );
};

export default TotalAdminsTab;
