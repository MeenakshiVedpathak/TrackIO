import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Check, X, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import {
  useMyTeamAllEmployeesApprovalSummary, useApproveMyTeamTimesheets,
  useRejectMyTeamTimesheetEntry, useApproveMyTeamTimesheetEntry,
} from '@/hooks/useMyTeam';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { servicePOHierarchyApi } from '@/api/servicePOHierarchy.api';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { formatDate, formatDateTime, formatMonthYear, formatHoursMinutes, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import RejectEntryDialog from '@/components/employee/RejectEntryDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

const columnHelper = createColumnHelper();

// A drill-down entry (embedded inline in the summary row) carries a plain `hours` field — never
// `hours_logged`/`modified_hours`, that's only the shape of the separate flat-list endpoint.
const effectiveHours = (entry) => entry.modified_hours ?? entry.hours_logged ?? entry.hours;

// Rows (and selection descriptors) are always scoped to one Employee's one date/month, so the key
// has to carry both — unlike the single-Employee view this table replaces, `employeeId` isn't
// implicit from the page.
const rowKeyOf = (logType, row) => `${row.employeeId}:${logType === 'daily' ? row.date : `${row.year}-${row.month}`}`;

const selectionValueOf = (logType, row, index) => (logType === 'daily'
  ? { employeeId: row.employeeId, date: row.date, index }
  : { employeeId: row.employeeId, month: row.month, year: row.year, index });

const isApprovable = (row) => row.approval_status === 'pending' && row.approval_required !== false;
const isEntryPending = (entry) => entry.status === 'pending';
const isEntryRejected = (entry) => entry.status === 'rejected';

const rejectedByLabel = (entry, currentEmployee) => {
  if (entry.rejected_by_name) return entry.rejected_by_name;
  if (currentEmployee && String(entry.rejected_by) === String(currentEmployee.id)) return currentEmployee.full_name;
  return null;
};

// Groups approve targets (selection descriptors or raw rows, both carry employeeId/date/month/year)
// by Employee — the bulk approve endpoint takes exactly one employeeId per call, so a selection
// spanning several Employees fires one POST per Employee rather than one for the whole batch.
const groupByEmployee = (targets) => {
  const map = new Map();
  targets.forEach((t) => {
    if (!map.has(t.employeeId)) map.set(t.employeeId, []);
    map.get(t.employeeId).push(t);
  });
  return map;
};

// Manager Timesheet Approval's default table — every mapped Employee's pending/approved buckets
// in one view, tagged with the Employee's name, so the Manager sees everything at a glance instead
// of clicking into one Employee at a time. `employees`/`logType`/`dateRange`/`statusFilter` are all
// narrowed by the page's own FilterPanel before ever reaching here — `dateRange` is always a plain
// {startDate, endDate}, computed by the page from either the Daily date-range picker or the
// Monthly Month&Year picker — so this component owns no filter UI of its own, only the resulting
// table, selection, and drill-down/approve/reject flow.
const ManagerAllEmployeesTimesheetView = ({ employees, logType, dateRange, statusFilter }) => {
  const { success, error: showError, info } = useNotification();
  const { employee: currentEmployee } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // Same prefix the approve/reject mutations already invalidate on success — reused here to force
  // a refresh on a 409 (someone else already acted on the entry), which fires from an onError
  // path the mutations' own invalidation never reaches.
  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ['my-team', 'approval-summary'] });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sorting, setSorting] = useState([]);
  const [selected, setSelected] = useState(new Map());
  const [drillDownRow, setDrillDownRow] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // { entries: [...] } being rejected, or null
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  // Mobile-only full-screen confirmation after a bulk approve/reject (see runApprove/
  // handleRejectSelected) — desktop and single-row actions keep the plain toast instead.
  const [bulkResult, setBulkResult] = useState(null); // { approved, rejected, total } | null

  const resetSelection = () => setSelected(new Map());

  const filterParams = useMemo(() => ({
    log_type: logType,
    ...(dateRange?.startDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {}),
  }), [logType, dateRange]);

  const { rows, isLoading, isError, error } = useMyTeamAllEmployeesApprovalSummary(employees, filterParams);
  const approveMutation = useApproveMyTeamTimesheets();
  const rejectEntryMutation = useRejectMyTeamTimesheetEntry();
  const approveEntryMutation = useApproveMyTeamTimesheetEntry();

  const periodKey = (r) => (logType === 'daily' ? r.date : `${r.year}-${String(r.month).padStart(2, '0')}`);

  // A value per sortable column id, used both by the explicit column-header sort below and (via
  // the same keys) by each accessor column's own accessorFn.
  const sortValueOf = (id, r) => {
    switch (id) {
      case 'employee': return r.employeeName;
      case 'period': return periodKey(r);
      case 'hours': return Number(r.total_hours ?? 0);
      case 'entries': return Number(r.entry_count ?? 0);
      case 'status': return r.approval_status ?? '';
      default: return '';
    }
  };

  // Clicking a column header (wired to DataTable's `sorting`/`onSortingChange` below) sorts the
  // WHOLE filtered set, not just the rows on the current page — everything's already in memory, so
  // there's no reason a sort should only reorder the 20 rows currently in view. With no column
  // explicitly picked yet, falls back to most-recent-period-first across every Employee, ties
  // broken by name so a given period's rows stay grouped together instead of shuffling on refetch.
  const sortedRows = useMemo(() => {
    const filtered = statusFilter === 'all' ? rows : rows.filter((r) => r.approval_status === statusFilter);
    const sortSpec = sorting[0];
    if (!sortSpec) {
      return [...filtered].sort((a, b) => {
        const diff = periodKey(b).localeCompare(periodKey(a));
        return diff !== 0 ? diff : a.employeeName.localeCompare(b.employeeName);
      });
    }
    const { id, desc } = sortSpec;
    return [...filtered].sort((a, b) => {
      const av = sortValueOf(id, a);
      const bv = sortValueOf(id, b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, logType, statusFilter, sorting]);

  const total = sortedRows.length;
  const pageRows = sortedRows.slice((page - 1) * limit, page * limit);

  // The whole filtered set already lives in memory (no server-side "select all" fetch needed here
  // the way the single-Employee table required), so page-vs-whole-set bookkeeping is simple math.
  const anySelected = selected.size > 0;
  const pageSelectedCount = pageRows.filter((r) => isApprovable(r) && selected.has(rowKeyOf(logType, r))).length;
  const pagePendingCount = pageRows.filter(isApprovable).length;
  const pageFullySelected = anySelected && pagePendingCount > 0 && pageSelectedCount === pagePendingCount;
  const offPageSelectedCount = selected.size - pageSelectedCount;
  const selectedPageCount = new Set(Array.from(selected.values(), (v) => Math.floor(v.index / limit) + 1)).size;

  // Resets whenever the in-scope Employee set or period filter changes (all owned by the page's
  // FilterPanel) — a stale selection/page referencing a now out-of-scope Employee or a different
  // filter's rows can otherwise linger invisibly.
  useEffect(() => {
    resetSelection();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.map((e) => e.id).join(','), logType, dateRange?.startDate, dateRange?.endDate, statusFilter]);

  const handlePageChange = (p) => setPage(p);

  const handlePageSizeChange = (size) => {
    setLimit(size);
    setPage(1);
  };

  const selectAllPending = () => {
    const next = new Map();
    sortedRows.forEach((row, index) => {
      if (!isApprovable(row)) return;
      next.set(rowKeyOf(logType, row), selectionValueOf(logType, row, index));
    });
    if (next.size === 0) {
      info(`No pending ${logType === 'daily' ? 'dates' : 'months'} to select in this range.`);
      return;
    }
    setSelected(next);
  };

  const toggleAll = () => {
    if (pageFullySelected) {
      resetSelection();
      return;
    }
    selectAllPending();
  };

  const toggleOne = (row, rowIndex) => {
    const key = rowKeyOf(logType, row);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, selectionValueOf(logType, row, ((page - 1) * limit) + rowIndex));
      return next;
    });
  };

  // `isBulk` gates the mobile-only full-screen success takeover (bulkResult) instead of the
  // plain toast — only ever set by handleApproveSelected below; a single-row approve (desktop or
  // mobile) always keeps the toast, per the confirmed scope for the mobile redesign.
  const runApprove = async (targets, successMessage, { isBulk = false } = {}) => {
    setIsApproving(true);
    try {
      await Promise.all(Array.from(groupByEmployee(targets).entries()).map(([employeeId, ts]) =>
        approveMutation.mutateAsync(logType === 'daily'
          ? { employeeId, dates: ts.map((t) => t.date) }
          : { employeeId, months: ts.map((t) => ({ month: t.month, year: t.year })) })));
      if (isBulk && isMobile) {
        setBulkResult({ approved: targets.length, rejected: 0, total: targets.length });
      } else {
        success(successMessage);
      }
      setSelected((prev) => {
        const next = new Map(prev);
        targets.forEach((t) => next.delete(rowKeyOf(logType, t)));
        return next;
      });
      setDrillDownRow(null);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsApproving(false);
    }
  };

  const periodLabel = (row) => (logType === 'daily' ? formatDate(row.date) : formatMonthYear(row.month, row.year));

  const handleApproveRow = (row) => runApprove([row], `${periodLabel(row)} approved for ${row.employeeName}.`);

  const handleRejectRow = (row) => {
    const pendingEntries = (row.entries ?? []).filter(isEntryPending);
    if (pendingEntries.length === 0) {
      showError('No pending entries to reject — open the row to see current status.');
      return;
    }
    setRejectTarget({ entries: pendingEntries });
  };

  const handleApproveSelected = () => {
    const targets = Array.from(selected.values());
    if (targets.length === 0) return;
    const unit = logType === 'daily' ? 'date' : 'month';
    runApprove(targets, `${targets.length} ${unit}${targets.length === 1 ? '' : 's'} approved.`, { isBulk: true });
  };

  // Mobile bulk-action-bar "Reject (N)" — gathers every still-pending entry across every
  // selected date/month (there's no bulk-reject API; the same per-entry reject endpoint the
  // single-row/single-entry flows already use is just called once per entry here) and reuses the
  // existing RejectEntryDialog/handleRejectSubmit path with one shared remark for all of them.
  const handleRejectSelected = () => {
    const targets = Array.from(selected.values());
    if (targets.length === 0) return;
    const allPendingEntries = targets
      .map((t) => sortedRows.find((r) => rowKeyOf(logType, r) === rowKeyOf(logType, t)))
      .filter(Boolean)
      .flatMap((row) => (row.entries ?? []).filter(isEntryPending));
    if (allPendingEntries.length === 0) {
      showError('No pending entries to reject in the current selection.');
      return;
    }
    setRejectTarget({ entries: allPendingEntries, isBulk: true, bulkTargets: targets });
  };

  const isConflict = (err) => err?.response?.status === 409;

  const handleApproveEntry = (entry) => {
    approveEntryMutation.mutate(entry.id, {
      onSuccess: () => success('Entry approved.'),
      onError: (err) => {
        if (isConflict(err)) {
          showError('This entry was already updated.');
          refetchAll();
        } else {
          showError(extractApiError(err));
        }
      },
    });
  };

  const handleRejectSubmit = async (remark) => {
    const targets = rejectTarget?.entries ?? [];
    if (targets.length === 0) return;
    setIsRejecting(true);
    try {
      await Promise.all(targets.map((e) => rejectEntryMutation.mutateAsync({ id: e.id, remark })));
      if (rejectTarget?.isBulk && isMobile) {
        const bulkTargets = rejectTarget.bulkTargets ?? [];
        setBulkResult({ approved: 0, rejected: bulkTargets.length, total: bulkTargets.length });
        setSelected((prev) => {
          const next = new Map(prev);
          bulkTargets.forEach((t) => next.delete(rowKeyOf(logType, t)));
          return next;
        });
      } else {
        success(targets.length === 1 ? 'Entry rejected.' : `${targets.length} entries rejected.`);
      }
      setRejectTarget(null);
    } catch (err) {
      if (isConflict(err)) {
        showError('This entry was already updated.');
        setRejectTarget(null);
        refetchAll();
      } else {
        showError(extractApiError(err));
      }
    } finally {
      setIsRejecting(false);
    }
  };

  const resolvedDrillDownRow = drillDownRow
    ? sortedRows.find((r) => rowKeyOf(logType, r) === rowKeyOf(logType, drillDownRow)) ?? drillDownRow
    : null;
  const detailRows = resolvedDrillDownRow?.entries ?? [];

  // Each entry only carries a bare `hierarchy_node_id` (no name, no parent) — never an embedded
  // "Module > Task" label — so showing which hierarchy node an entry was logged against means
  // fetching that Service PO's hierarchy tree and looking the id up in it, the same recipe
  // EmployeeTimeEntry.jsx already uses for the Employee's own "Entries for <date>" panel. Only
  // fetches while the drawer is open (detailRows is [] otherwise) and only once per distinct
  // Service PO among the open bucket's entries — usually one, but a day/month bucket can span more.
  const servicePoIdsInDrawer = useMemo(
    () => [...new Set(detailRows.map((r) => String(r.service_po_id ?? r.servicePO?.id ?? '')).filter(Boolean))],
    [detailRows],
  );
  const hierarchyTreeQueries = useQueries({
    queries: servicePoIdsInDrawer.map((servicePoId) => ({
      queryKey: QUERY_KEYS.SERVICE_PO_HIERARCHY(servicePoId),
      queryFn: () => servicePOHierarchyApi.getTree(servicePoId),
    })),
  });
  // `${servicePoId}:${nodeId}` rather than a bare node id — hierarchy node ids aren't namespaced
  // to their Service PO in this map, so two different POs could otherwise collide on the same id.
  // Keeps the node's own name alongside the full breadcrumb: in some Service POs the separate Sub
  // Project field is set to literally the same text as the hierarchy leaf it was logged under
  // (e.g. both named "t1.1"), and showing the breadcrumb ("m1 › t1.1") right above a second line
  // that just repeats "t1.1" reads as an outright duplicate — so the Sub Project line below is
  // only shown when it says something the breadcrumb doesn't already say.
  const hierarchyByKey = useMemo(() => {
    const map = new Map();
    hierarchyTreeQueries.forEach((q, i) => {
      const servicePoId = servicePoIdsInDrawer[i];
      (q.data ?? []).forEach((parent) => {
        const parentName = parent.node_name ?? parent.name ?? '';
        map.set(`${servicePoId}:${parent.id}`, { label: parentName, leafName: parentName });
        (parent.children ?? []).forEach((child) => {
          const childName = child.node_name ?? child.name ?? '';
          map.set(`${servicePoId}:${child.id}`, {
            label: [parentName, childName].filter(Boolean).join(' › '),
            leafName: childName,
          });
        });
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyTreeQueries, servicePoIdsInDrawer]);
  const hierarchyFor = (r) => {
    if (r.hierarchy_node_id == null) return undefined;
    const servicePoId = String(r.service_po_id ?? r.servicePO?.id ?? '');
    return hierarchyByKey.get(`${servicePoId}:${r.hierarchy_node_id}`);
  };
  const hierarchyLabelFor = (r) => hierarchyFor(r)?.label;
  // Case-insensitive/trimmed compare — the duplication is the same text, not necessarily an exact
  // byte match (e.g. differing whitespace from how each field happened to be entered). Checked
  // against BOTH the Sub Project name and the free-text description: either one can independently
  // end up set to literally the hierarchy leaf's own name (e.g. a description of just "t1.1"),
  // which would otherwise repeat right below the "m1 › t1.1" breadcrumb line.
  const isRedundantWithHierarchyLeaf = (r, text) => {
    const value = (text ?? '').trim();
    const leafName = (hierarchyFor(r)?.leafName ?? '').trim();
    return !!value && !!leafName && value.toLowerCase() === leafName.toLowerCase();
  };

  const columns = [
    columnHelper.display({
      id: 'select',
      header: () => (
        <Checkbox
          checked={pageFullySelected ? true : (anySelected ? 'indeterminate' : false)}
          onCheckedChange={toggleAll}
          disabled={isLoading || (sortedRows.length === 0 && !anySelected)}
          aria-label="Select all pending entries in the current filter"
        />
      ),
      size: 40,
      cell: ({ row }) => (
        <Checkbox
          checked={selected.has(rowKeyOf(logType, row.original))}
          onCheckedChange={() => toggleOne(row.original, row.index)}
          disabled={!isApprovable(row.original)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Action',
      size: 80,
      cell: ({ row }) =>
        isApprovable(row.original) ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              title="Reject"
              className="h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              onClick={() => handleRejectRow(row.original)}
              disabled={isApproving || isRejecting}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              title="Approve"
              className="h-6 w-6 p-0 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              onClick={() => handleApproveRow(row.original)}
              disabled={isApproving || isRejecting}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    }),
    columnHelper.accessor((row) => sortValueOf('employee', row), {
      id: 'employee',
      header: 'Employee Name',
      size: 260,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.employeeName}</span>,
    }),
    columnHelper.accessor((row) => sortValueOf('period', row), {
      id: 'period',
      header: logType === 'daily' ? 'Date' : 'Month',
      size: 140,
      cell: ({ row }) => <span className="text-sm font-medium">{periodLabel(row.original)}</span>,
    }),
    columnHelper.accessor((row) => sortValueOf('hours', row), {
      id: 'hours',
      header: 'Hours',
      size: 100,
      cell: ({ row }) => (
        <span className="tabular-nums text-sm font-medium">{formatHoursMinutes(row.original.total_hours)}</span>
      ),
    }),
    columnHelper.accessor((row) => sortValueOf('entries', row), {
      id: 'entries',
      header: 'Entries',
      size: 110,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.entry_count}</span>,
    }),
    columnHelper.accessor((row) => sortValueOf('status', row), {
      id: 'status',
      header: 'Status',
      size: 130,
      cell: ({ row }) => <StatusBadge status={row.original.approval_status} />,
    }),
    columnHelper.display({
      id: 'expand',
      header: '',
      size: 32,
      cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
    }),
  ];

  // Mobile card (below `md`, via DataTable's `mobileCards` opt-in) — no per-row inline
  // Approve/Reject icons here (unlike the desktop `actions` column): those actions live in the
  // row-detail bottom sheet and the bulk-action bar instead, matching the mobile mockup's list
  // view, which shows only a checkbox, identity, status, and a chevron per row.
  const renderMobileCard = (rowData, row) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setDrillDownRow(rowData)}
      onKeyDown={(e) => { if (e.key === 'Enter') setDrillDownRow(rowData); }}
      className="flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-left active:bg-muted/40"
    >
      <Checkbox
        checked={selected.has(rowKeyOf(logType, rowData))}
        onCheckedChange={() => toggleOne(rowData, row.index)}
        disabled={!isApprovable(rowData)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{getInitials(rowData.employeeName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{rowData.employeeName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {periodLabel(rowData)} · {formatHoursMinutes(rowData.total_hours)} · {rowData.entry_count} {rowData.entry_count === 1 ? 'entry' : 'entries'}
        </p>
      </div>
      <StatusBadge status={rowData.approval_status} />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {extractApiError(error)}
      </div>
    );
  }

  // Mobile-only full-screen confirmation after a bulk approve/reject (Screen 5 of the mobile
  // redesign) — `md:hidden` is a belt-and-suspenders guard alongside the `isMobile` state check
  // that already gates every place `bulkResult` gets set, so this can never show on desktop even
  // if the viewport is resized right after the action fires.
  if (bulkResult) {
    const { approved, rejected, total } = bulkResult;
    const verb = approved > 0 && rejected > 0 ? 'updated' : approved > 0 ? 'approved' : 'rejected';
    return (
      <div className="flex md:hidden h-full min-h-0 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Timesheets Updated!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} timesheet{total === 1 ? '' : 's'} {total === 1 ? 'has' : 'have'} been {verb} successfully.
          </p>
        </div>
        <div className="w-full max-w-xs space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Approved</span>
            <span className="font-semibold">{approved}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rejected</span>
            <span className="font-semibold">{rejected}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">{total}</span>
          </div>
        </div>
        <Button className="w-full max-w-xs" onClick={() => setBulkResult(null)}>
          Back to Timesheets
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      {anySelected && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} pending {logType === 'daily' ? 'date' : 'month'}{selected.size === 1 ? '' : 's'} selected
            {selectedPageCount > 1 && ` across ${selectedPageCount} pages`}
            {offPageSelectedCount > 0 && ` — ${offPageSelectedCount} not on this page`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetSelection} disabled={isApproving}>
              Clear
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleApproveSelected} disabled={isApproving}>
              {isApproving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Approve Selected
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={pageRows}
        isLoading={isLoading}
        pagination={{ page, limit, total }}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onRowClick={setDrillDownRow}
        emptyState={<EmptyState title={`No ${logType} timesheet entries for this period.`} />}
        mobileCards
        mobileCardRenderer={renderMobileCard}
      />

      {/* Mobile bulk-action bar (Screen 4 of the mobile redesign) — additional to, not a
          replacement for, the summary bar above (which already shows the count and a Clear
          action on every width). Fixed to the viewport bottom so both buttons stay reachable
          without scrolling, regardless of how long the card list is. */}
      {anySelected && isMobile && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background p-3 md:hidden">
          <Button
            variant="outline"
            className="flex-1 gap-1.5 text-destructive hover:text-destructive"
            onClick={handleRejectSelected}
            disabled={isApproving || isRejecting}
          >
            <X className="h-4 w-4" />
            Reject ({selected.size})
          </Button>
          <Button
            className="flex-1 gap-1.5"
            onClick={handleApproveSelected}
            disabled={isApproving || isRejecting}
          >
            {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve ({selected.size})
          </Button>
        </div>
      )}

      <Sheet open={!!drillDownRow} onOpenChange={(open) => !open && setDrillDownRow(null)}>
        {/* flex column filling the Sheet's full height (h-full comes from sheetVariants) is what
            lets the entries list below be the only thing that scrolls, with the header and the
            Approve footer pinned in place — a plain max-h-[60vh] on the ScrollArea alone left the
            footer pushed off-screen with no way to reach it once entries plus header exceeded the
            viewport. Bottom sheet on mobile (Screen 3 of the redesign), unchanged right-side
            drawer on desktop — sheetVariants already defines a `bottom` side, no primitive
            change needed. */}
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={isMobile ? 'flex w-full flex-col max-h-[85vh] rounded-t-2xl' : 'flex w-full flex-col sm:max-w-lg'}
        >
          {resolvedDrillDownRow && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {logType === 'daily'
                    ? formatDate(resolvedDrillDownRow.date, 'dddd, DD MMMM YYYY')
                    : formatMonthYear(resolvedDrillDownRow.month, resolvedDrillDownRow.year)}
                </SheetTitle>
                <SheetDescription>
                  {resolvedDrillDownRow.employeeName} — Total {formatHoursMinutes(resolvedDrillDownRow.total_hours)} across{' '}
                  {resolvedDrillDownRow.entry_count} entr{resolvedDrillDownRow.entry_count === 1 ? 'y' : 'ies'}
                </SheetDescription>
              </SheetHeader>

              <ScrollArea className="min-h-0 flex-1 -mx-1 px-1">
                <div className="space-y-2 pr-2">
                  {detailRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No entries found.</p>
                  ) : (
                    detailRows.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between font-medium">
                          <span>{r.servicePO?.service_po_name ?? r.servicePO?.service_po_code ?? '—'}</span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{formatHoursMinutes(effectiveHours(r))}</span>
                            {r.status && <StatusBadge status={r.status} />}
                          </span>
                        </div>
                        {hierarchyLabelFor(r) && (
                          <p className="mt-0.5 text-xs font-medium text-foreground/80">{hierarchyLabelFor(r)}</p>
                        )}
                        {r.subProject?.sub_project_name && !isRedundantWithHierarchyLeaf(r, r.subProject.sub_project_name) && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{r.subProject.sub_project_name}</p>
                        )}
                        {r.description && !isRedundantWithHierarchyLeaf(r, r.description) && (
                          <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                        )}
                        {logType === 'monthly' && (
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(r.work_date)}</p>
                        )}

                        {isEntryRejected(r) && (
                          <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            <p className="font-medium">
                              Rejected{rejectedByLabel(r, currentEmployee) ? ` by ${rejectedByLabel(r, currentEmployee)}` : ''}
                              {r.rejected_at ? ` on ${formatDateTime(r.rejected_at)}` : ''}
                            </p>
                            {r.rejection_remark && <p className="mt-0.5">{r.rejection_remark}</p>}
                          </div>
                        )}

                        {isEntryPending(r) && (
                          <div className="mt-2 flex justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-destructive hover:text-destructive"
                              onClick={() => setRejectTarget({ entries: [r] })}
                              disabled={isRejecting || approveEntryMutation.isPending}
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => handleApproveEntry(r)}
                              disabled={isRejecting || approveEntryMutation.isPending}
                            >
                              {approveEntryMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              {approveEntryMutation.isPending ? 'Approving…' : 'Approve'}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <SheetFooter>
                {isApprovable(resolvedDrillDownRow) ? (
                  <Button onClick={() => handleApproveRow(resolvedDrillDownRow)} disabled={isApproving} className="gap-1.5">
                    {isApproving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Approving…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Approve {periodLabel(resolvedDrillDownRow)}
                      </>
                    )}
                  </Button>
                ) : (
                  <StatusBadge status={resolvedDrillDownRow.approval_status} />
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <RejectEntryDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        onConfirm={handleRejectSubmit}
        isSubmitting={isRejecting}
        count={rejectTarget?.entries?.length ?? 1}
      />
    </div>
  );
};

export default ManagerAllEmployeesTimesheetView;
