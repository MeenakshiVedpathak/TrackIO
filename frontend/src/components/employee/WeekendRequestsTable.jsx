import { useEffect, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Check, X, CalendarCheck, Clock } from 'lucide-react';
import { useMyTeamOffDayRequests, useMyTeamOffDayRequestsAcrossBus, useApproveOffDayRequest, useBulkApproveOffDayRequests } from '@/hooks/useOffDayRequests';
import { useMyTeamEmployees, useMyTeamServicePos } from '@/hooks/useMyTeam';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDate, formatRelativeTime } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import DataTable from '@/components/common/DataTable';
import EmptyState from '@/components/common/EmptyState';

import RejectOffDayRequestDialog from './RejectOffDayRequestDialog';

const DEFAULT_LIMIT = 20;
const ALL_STATUSES = 'all';
const columnHelper = createColumnHelper();

// Search box + Entity/Business Unit/Date Range/Status filters all live in the parent page's own
// header/FilterPanel — same placement as the Timesheet Approvals tab on this page (and every
// other list page in the app) — this component just takes the already-resolved values as props
// instead of owning that UI itself.
//
// `buIds` (optional): when the parent's Entity filter is set but Business Unit stays "All
// Business Units" and that Entity has more than one selectable BU, there's no single
// `X-Company-Id` header that means "every BU under this Entity" (see explicitBuScope in
// apiClient.js) — a header-less call falls back to the caller's whole role reach, ignoring the
// Entity filter entirely. When passed, this fans out one call per BU and merges+paginates the
// result client-side instead of relying on `buId` + server-side pagination. Mutually exclusive
// with `buId` — the parent passes one or the other, never both.
const WeekendRequestsTable = ({ search = '', statusFilter = ALL_STATUSES, buId = null, buIds = null, dateRange = null }) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const isFannedOut = Array.isArray(buIds) && buIds.length > 0;

  // Reset to page 1 whenever the filtered set's own inputs change — same as every other
  // paginated list in the app.
  useEffect(() => setPage(1), [search, statusFilter, buId, buIds, dateRange?.startDate, dateRange?.endDate]);

  // status/search/buId/date-range sent server-side — see BACKEND_OFF_DAY_REQUESTS_MASTER_PROMPT.md
  // for the `status` contract, `buId`'s X-Company-Id scoping (api/offDayRequests.api.js's
  // `listQueue`), and the `startDate`/`endDate` work-date range this assumes. `search` follows the
  // same generic-param convention every other master list (Employees, Companies, …) already
  // sends. Harmless if the backend doesn't (yet) honor `search` or the date range — the
  // client-side search filter below still narrows whatever page comes back either way.
  const sharedParams = {
    status: statusFilter === ALL_STATUSES ? 'all' : statusFilter,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(dateRange?.startDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {}),
  };

  const singleBuQuery = useMyTeamOffDayRequests(
    { page, limit, ...sharedParams, ...(buId != null ? { buId } : {}) },
    { enabled: !isFannedOut },
  );
  const fannedOutQuery = useMyTeamOffDayRequestsAcrossBus(
    isFannedOut ? buIds.map((id) => ({ id })) : [],
    sharedParams,
    { enabled: isFannedOut },
  );

  // The fanned-out path merges every selected BU's full result set then paginates client-side
  // (the server can only paginate one BU's worth at a time); the single-BU path keeps the
  // server's own page/meta as-is.
  const response = isFannedOut
    ? {
        data: fannedOutQuery.data.slice((page - 1) * limit, page * limit),
        meta: {
          page,
          limit,
          total: fannedOutQuery.data.length,
          total_pages: Math.ceil(fannedOutQuery.data.length / limit) || 1,
        },
      }
    : singleBuQuery.data;
  const isLoading = isFannedOut ? fannedOutQuery.isLoading : singleBuQuery.isLoading;
  const isError = isFannedOut ? fannedOutQuery.isError : singleBuQuery.isError;
  const error = isFannedOut ? fannedOutQuery.error : singleBuQuery.error;
  const { data: teamEmployees = [] } = useMyTeamEmployees();
  const { data: activeServicePos = [] } = useActiveServicePOs();
  const { data: teamServicePos = [] } = useMyTeamServicePos();
  const approveMutation = useApproveOffDayRequest();
  const bulkApproveMutation = useBulkApproveOffDayRequests();
  const { success, error: showError } = useNotification();

  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  const getEmployeeDisplay = (req) => {
    // 1. Direct or nested attributes
    const name =
      req.employee_name ||
      req.full_name ||
      req.name ||
      req.employee?.full_name ||
      req.employee?.name ||
      req.employee?.employee_name ||
      req.Employee?.full_name ||
      req.Employee?.name ||
      req.Employee?.employee_name ||
      req.user?.full_name ||
      req.user?.name ||
      (req.employee?.first_name ? `${req.employee.first_name} ${req.employee.last_name || ''}`.trim() : null) ||
      (req.Employee?.first_name ? `${req.Employee.first_name} ${req.Employee.last_name || ''}`.trim() : null);

    const code =
      req.employee_code ||
      req.code ||
      req.employee?.employee_code ||
      req.employee?.code ||
      req.Employee?.employee_code ||
      req.Employee?.code;

    if (name) return { name, code };

    // 2. Fallback lookup by employee_id in teamEmployees
    if (req.employee_id && Array.isArray(teamEmployees)) {
      const match = teamEmployees.find((e) => Number(e.id) === Number(req.employee_id));
      if (match) {
        return {
          name: match.full_name || match.name || `Employee #${req.employee_id}`,
          code: match.employee_code || code,
        };
      }
    }

    return { name: req.employee_id ? `Employee #${req.employee_id}` : '—', code };
  };

  const getServicePoDisplay = (req) => {
    // 1. Direct or nested attributes — every casing/nesting variant the backend has been seen to
    // use across sibling endpoints (service-pos master uses `service_po_name`, the employee
    // mapped-projects endpoint normalizes to `name`).
    const nestedPo = req.service_po ?? req.servicePo ?? req.ServicePo ?? req.ServicePO ?? req.project ?? req.Project;
    const name =
      req.service_po_name ||
      req.po_name ||
      req.project_name ||
      nestedPo?.service_po_name ||
      nestedPo?.name ||
      nestedPo?.po_name;

    if (name) return name;

    // 2. Fallback lookup by service_po_id in activeServicePos or teamServicePos
    const poId = req.service_po_id || req.servicePoId || nestedPo?.id;
    if (poId) {
      const allPos = [
        ...(Array.isArray(activeServicePos) ? activeServicePos : []),
        ...(Array.isArray(teamServicePos) ? teamServicePos : []),
      ];
      const match = allPos.find((p) => Number(p.id) === Number(poId));
      if (match) {
        return match.service_po_name || match.name || `Service PO #${poId}`;
      }
    }

    return poId ? `Service PO #${poId}` : '—';
  };

  // Response structure: apiClient.get wraps Axios, so response is { success, data: [...], meta: { total, total_pages, page, limit } }
  const rawRequests = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
  // Pending stays on top so the queue that actually needs action reads first; a request sinks to
  // the bottom as soon as it's approved/rejected, without disappearing from the list entirely.
  const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 };
  const sortedRequests = [...rawRequests].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1)
  );
  // Client-side safety net for `search` above — narrows whatever page came back by employee name,
  // Service PO name, and reason, in case the backend ignored the query param.
  const term = search.trim().toLowerCase();
  const requests = term
    ? sortedRequests.filter((req) => {
        const emp = getEmployeeDisplay(req);
        const poName = getServicePoDisplay(req);
        return [emp.name, emp.code, poName, req.reason]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      })
    : sortedRequests;

  const meta = response?.meta ?? {
    page: 1,
    limit,
    total: requests.length,
    total_pages: Math.ceil(requests.length / limit) || 1,
  };

  // Only a pending row can be bulk-approved — approved/rejected rows are display-only from here on.
  const pendingRequests = requests.filter((r) => r.status === 'pending');

  // A page change (or the list refetching after an approve/reject) can strand selections that no
  // longer correspond to a visible pending row — drop anything not currently selectable.
  useEffect(() => {
    const selectableIds = new Set(pendingRequests.map((r) => r.id));
    setSelectedIds((prev) => prev.filter((id) => selectableIds.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequests.map((r) => r.id).join(',')]);

  const allSelected = pendingRequests.length > 0 && selectedIds.length === pendingRequests.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : pendingRequests.map((r) => r.id));
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const handleApprove = async (request) => {
    setApprovingId(request.id);
    try {
      await approveMutation.mutateAsync(request.id);
      success('Weekend request approved.');
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setApprovingId(null);
    }
  };

  // Calls the bulk endpoint (see api/offDayRequests.api.js's `bulkApprove` — spec in
  // BACKEND_BULK_APPROVE_PROMPT.md). That route isn't deployed on every environment yet, so a 404
  // here falls back to firing the existing single-approve call once per selected row instead of
  // failing outright.
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkApproving(true);
    try {
      await bulkApproveMutation.mutateAsync(selectedIds);
      success(`${selectedIds.length} weekend request${selectedIds.length > 1 ? 's' : ''} approved.`);
      setSelectedIds([]);
    } catch (err) {
      if (err?.response?.status === 404) {
        const results = await Promise.allSettled(selectedIds.map((id) => approveMutation.mutateAsync(id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        const approved = results.length - failed;
        setSelectedIds([]);
        if (approved > 0) success(`${approved} weekend request${approved > 1 ? 's' : ''} approved.`);
        if (failed > 0) showError(`${failed} request${failed > 1 ? 's' : ''} could not be approved.`);
      } else {
        showError(extractApiError(err));
      }
    } finally {
      setIsBulkApproving(false);
    }
  };

  const columns = [
    columnHelper.display({
      id: 'select',
      size: 40,
      header: () => (
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={toggleSelectAll}
          disabled={pendingRequests.length === 0}
          aria-label="Select all"
        />
      ),
      cell: (info) => {
        const req = info.row.original;
        const isPending = req.status === 'pending';
        return (
          <Checkbox
            checked={isPending && selectedIds.includes(req.id)}
            onCheckedChange={() => toggleSelectOne(req.id)}
            disabled={!isPending}
            aria-label={`Select request from ${getEmployeeDisplay(req).name}`}
          />
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 140,
      cell: (info) => {
        const req = info.row.original;
        const isPending = req.status === 'pending';
        if (!isPending) return <span className="text-xs text-muted-foreground">—</span>;
        const emp = getEmployeeDisplay(req);
        const poName = getServicePoDisplay(req);
        const enrichedReq = { ...req, employee_name: emp.name, employee_code: emp.code, service_po_name: poName };
        return (
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              title={approvingId === req.id ? 'Approving…' : 'Approve'}
              aria-label="Approve"
              className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleApprove(req)}
              disabled={approvingId === req.id || approveMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              title="Reject"
              aria-label="Reject"
              className="h-7 w-7 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setRejectingRequest(enrichedReq)}
              disabled={approvingId === req.id || approveMutation.isPending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'employee',
      header: 'Employee',
      size: 220,
      cell: (info) => {
        const name = getEmployeeDisplay(info.row.original).name;
        return (
          <span className="block truncate font-semibold text-foreground text-xs" title={name}>
            {name}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'service_po',
      header: 'Service PO',
      size: 220,
      cell: (info) => {
        const poName = getServicePoDisplay(info.row.original);
        return (
          <span className="block truncate text-xs text-foreground font-medium" title={poName}>
            {poName}
          </span>
        );
      },
    }),
    columnHelper.accessor('work_date', {
      header: 'Work Date',
      size: 130,
      cell: (info) => (
        <span className="text-xs font-semibold text-foreground whitespace-nowrap">
          {formatDate(info.getValue(), 'ddd, DD MMM YYYY')}
        </span>
      ),
    }),
    columnHelper.accessor('reason', {
      header: 'Reason',
      size: 220,
      cell: (info) => (
        <span className="block truncate text-xs text-slate-700" title={info.getValue()}>
          {info.getValue() || '—'}
        </span>
      ),
    }),
    columnHelper.accessor('created_at', {
      header: 'Sent',
      size: 120,
      cell: (info) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
          <Clock className="h-3 w-3 text-muted-foreground/70" />
          {formatRelativeTime(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 100,
      cell: (info) => {
        const status = info.getValue() || 'pending';
        return (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 capitalize',
              status === 'approved' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
              status === 'rejected' && 'bg-red-50 text-red-700 border-red-200',
              status === 'pending' && 'bg-amber-50 text-amber-700 border-amber-200',
            )}
          >
            {status}
          </Badge>
        );
      },
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2.5">
          <span className="text-xs font-medium text-blue-900">
            {selectedIds.length} request{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <Button
            size="sm"
            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleBulkApprove}
            disabled={isBulkApproving}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {isBulkApproving ? 'Approving…' : `Approve Selected (${selectedIds.length})`}
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={requests}
        isLoading={isLoading}
        pagination={requests.length > 0 ? { page, limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setLimit(size); setPage(1); }}
        rowClassName={(row) => (row.status !== 'pending' ? 'bg-slate-50/50' : undefined)}
        emptyState={
          isError ? (
            <EmptyState title="Failed to load weekend requests." description={extractApiError(error)} />
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title={statusFilter === 'pending' ? 'No pending weekend requests.' : 'No weekend requests found.'}
              description={statusFilter === 'pending' ? 'All weekend and off-day requests from your team have been processed.' : 'No off-day requests match the selected filters.'}
            />
          )
        }
      />

      {rejectingRequest && (
        <RejectOffDayRequestDialog
          open={!!rejectingRequest}
          onOpenChange={(open) => !open && setRejectingRequest(null)}
          request={rejectingRequest}
          onSuccess={() => setRejectingRequest(null)}
        />
      )}
    </div>
  );
};

export default WeekendRequestsTable;
