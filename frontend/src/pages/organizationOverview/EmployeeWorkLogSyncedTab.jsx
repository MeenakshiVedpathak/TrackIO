import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Search } from 'lucide-react';
import { useEmployeeWorkLogSynced } from '@/hooks/usePlatformAdminReports';
import { platformAdminReportsApi } from '@/api/platformAdminReports.api';
import { useCompanies } from '@/hooks/useCompanies';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { downloadBlob } from '@/utils/download';
import DataTable from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
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

const currentMonthYear = () => {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
};

// Tab 6 — same exception as Total Admins: its own independent server fetch, not derived from
// Organization Overview's shared API call. GET /platform-admin/employee-work-log-synced,
// confirmed (2026-09). Month/Year is required and never cleared to null (`clearable={false}`
// below) — there's no "all time" view for this report. The Status filter here is the EMPLOYEE's
// own active/inactive status, not a work-log sync status — there is no per-row sync-status
// column in this table (every row is already "synced" data for the selected month), so `status`
// never carries a "synced" value. `sortBy`/`sortOrder` are camelCase on this endpoint (Total
// Admins' are snake_case) — confirmed, not a typo — and only employee_name/employee_code/
// total_hours are sortable, matching the backend's accepted enum; Admin/Entity Name/BU Name have
// `enableSorting: false`.
const EmployeeWorkLogSyncedTab = ({ toolbarSlot }) => {
  const { error: showError } = useNotification();
  const [monthYear, setMonthYear] = useState(currentMonthYear);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const debouncedSearch = useDebounce(search, 400);

  const params = {
    month: monthYear.month,
    year: monthYear.year,
    page,
    limit,
    status: statusFilter,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useEmployeeWorkLogSynced(params);
  // Rows live at data.records (not a bare array) — the envelope's `data` also carries `period`.
  // Pagination is the top-level `meta`, a sibling of `data`, not nested inside it.
  const rows = data?.data?.records ?? [];
  const meta = data?.meta ?? {};

  // Client-side-only BU hierarchy join. Unlike the other Organization Overview tabs, this
  // endpoint's own rows carry no bu_id at all (see the records shape noted above — bu_name only),
  // so the BU master can't be joined by id here; keyed instead by `entity_name::company_name`
  // (the same pair this table already shows per row) since company names aren't guaranteed unique
  // across different Entities.
  const { data: companiesData } = useCompanies({ status: 'active', limit: 500 }, { staleTime: 1000 * 60 * 10 });
  const subBuNameByEntityAndBu = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      if ((c.parent_business_unit_id ?? c.parent?.id) != null) {
        map.set(`${c.entity?.entity_name ?? ''}::${c.company_name}`, c.company_name);
      }
    });
    return map;
  }, [companiesData]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Export takes only month/year/status/search — no sort params.
      const { month, year, status, search: searchParam } = params;
      const result = await platformAdminReportsApi.exportEmployeeWorkLogSynced({
        month, year, status, ...(searchParam && { search: searchParam }),
      });
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    columnHelper.accessor('employee_code', {
      header: 'Emp Code',
      size: 130,
      meta: { sticky: true, left: 0 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="110px" className="font-medium" />,
    }),
    columnHelper.accessor('employee_name', {
      header: 'Emp Name',
      size: 180,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="160px" />,
    }),
    columnHelper.accessor('admin_name', {
      header: 'Admin',
      size: 160,
      enableSorting: false,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    columnHelper.accessor('entity_name', {
      header: 'Entity Name',
      size: 160,
      enableSorting: false,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    columnHelper.accessor('bu_name', {
      header: 'BU Name',
      size: 160,
      enableSorting: false,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    columnHelper.display({
      id: 'sub_bu_name',
      header: 'Sub BU',
      size: 150,
      enableSorting: false,
      cell: ({ row }) => (
        <TruncatedCell
          value={subBuNameByEntityAndBu.get(`${row.original.entity_name ?? ''}::${row.original.bu_name}`)}
          maxWidth="130px"
        />
      ),
    }),
    columnHelper.accessor('total_hours', {
      header: 'Total Hours (Synced)',
      size: 160,
      cell: (info) => {
        const val = info.getValue();
        return <span className="text-sm tabular-nums">{val != null ? val : '—'}</span>;
      },
    }),
  ];

  return (
    <>
      {/* Rendered into the tab-bar row (see OrganizationOverview.jsx), right-aligned next to the
          tab switcher — same slot/position every sibling tab's own Filters/Export uses, instead
          of DataTable's own left-aligned toolbar row. */}
      {toolbarSlot && createPortal(
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
            <Input
              placeholder="Search employees…"
              className="pl-9 w-[220px] h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <MonthYearPicker
            value={monthYear}
            onChange={(v) => { if (v) { setMonthYear(v); setPage(1); } }}
            clearable={false}
          />
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
          <Button
            variant="outline"
            size="toolbar"
            className="bg-white"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="h-4 w-4" /> {isExporting ? 'Exporting…' : 'Export Excel'}
          </Button>
        </div>,
        toolbarSlot
      )}
    <DataTable
      className="flex-1 min-h-0"
      columns={columns}
      data={rows}
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

export default EmployeeWorkLogSyncedTab;
