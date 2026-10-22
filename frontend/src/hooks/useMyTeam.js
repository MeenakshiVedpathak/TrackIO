import { useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { myTeamApi } from '@/api/myTeam.api';
import { canScopeAcrossBus } from '@/services/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useMyTeamEmployees = (params = {}, { enabled = true } = {}) =>
  useQuery({
    queryKey: [QUERY_KEYS.MY_TEAM_EMPLOYEES, params],
    queryFn: () => myTeamApi.getEmployees(params),
    enabled,
  });

// Ceiling on how many BUs a screen will fan out `/my-team/*` calls across (see
// useMyTeamEmployeesAcrossBus below, and the equivalent off-day-requests fan-out). A real Team
// Lead/BU Head/multi-BU BU Admin has a small, human-sized number of mapped BUs, so fanning out
// one request per BU costs nothing there — but a genuinely cross-BU login (Admin/Entity
// Admin/Platform Admin) can be selectable across EVERY Business Unit in the whole system (their
// options come from the BU master, unbounded up to its own 200-row page size — see
// useSelectableBusinessUnits), and firing that many parallel requests just to render a Team-Lead
// screen they usually have zero mappings on anyway was confirmed live to make Timesheet
// Approval/Log Work for My Team take many seconds to load. Past this ceiling, callers fall back
// to a single header-less call instead — a small, deliberate accuracy trade-off (see the
// header-less-call caveat elsewhere in this file) in exchange for the page actually loading.
export const MAX_FANOUT_BUS = 15;

// "All Business Units" has no single X-Company-Id header confirmed to mean "every BU this login
// can see" — see apiClient's explicitBuScope — so a plain useMyTeamEmployees({}) call there can
// silently fall back to whichever BU happens to be globally active, or to whatever a header-less
// call resolves to for this particular role, hiding Employees mapped only under a different BU.
// Confirmed live even for a nominally "cross-BU" Admin login (an Employee mapped under one
// specific BU was missing under "All Business Units" but appeared once that BU was picked
// explicitly), so this is used for ANY login with more than one selectable BU, not only BU-scoped
// multi-BU ones — see the call site in TeamLeadTimesheetApproval.jsx for the exact condition. Fans
// out one GET /my-team/employees call per BU (`units`, from useSelectableBusinessUnits) and merges
// the results, deduped by id. Each per-BU query shares its cache entry with
// useMyTeamEmployees({ buId }) above (same query key shape), so picking that same BU from the
// dropdown elsewhere never re-fetches it.
export const useMyTeamEmployeesAcrossBus = (units, { enabled = true } = {}) => {
  const queries = useQueries({
    queries: units.map((bu) => ({
      queryKey: [QUERY_KEYS.MY_TEAM_EMPLOYEES, { buId: bu.id }],
      queryFn: () => myTeamApi.getEmployees({ buId: bu.id }),
      enabled: enabled && !!bu.id,
    })),
  });

  const seen = new Map();
  queries.forEach((q) => (q.data ?? []).forEach((emp) => {
    if (!seen.has(emp.id)) seen.set(emp.id, emp);
  }));

  return {
    data: Array.from(seen.values()),
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
  };
};

// GET /my-team/service-pos reads the caller's company_id straight off their own login (unlike
// /my-team/employees, it has no fallback for a cross-BU role) — a cross-BU login (Admin, Entity
// Admin, Platform Admin; canScopeAcrossBus) has no company_id at all, so the backend errors with
// "WHERE parameter company_id has invalid undefined value" every time. Those roles have no
// manager_service_po_grants of their own anyway (this is a Team-Lead/Manager self-service list),
// so there's nothing useful this call could return for them — disabled rather than firing a call
// that's guaranteed to fail.
export const useMyTeamServicePos = () =>
  useQuery({
    queryKey: QUERY_KEYS.MY_TEAM_SERVICE_POS,
    queryFn: myTeamApi.getServicePos,
    enabled: !canScopeAcrossBus(),
  });

export const useEmployeeServicePos = (employeeId) =>
  useQuery({
    queryKey: [...QUERY_KEYS.MY_TEAM_EMPLOYEES, employeeId, 'service-pos'],
    queryFn: () => myTeamApi.getEmployeeServicePos(employeeId),
    enabled: !!employeeId,
  });

export const useMapMyTeamEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: myTeamApi.mapEmployee,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEES }),
  });
};

export const useUnmapMyTeamEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: myTeamApi.unmapEmployee,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEES }),
  });
};

export const useGrantMyTeamServicePo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, servicePOId }) => myTeamApi.grantServicePo(employeeId, servicePOId),
    onSuccess: (_data, { employeeId }) => qc.invalidateQueries({ queryKey: [...QUERY_KEYS.MY_TEAM_EMPLOYEES, employeeId, 'service-pos'] }),
  });
};

export const useRevokeMyTeamServicePo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, servicePOId }) => myTeamApi.revokeServicePo(employeeId, servicePOId),
    onSuccess: (_data, { employeeId }) => qc.invalidateQueries({ queryKey: [...QUERY_KEYS.MY_TEAM_EMPLOYEES, employeeId, 'service-pos'] }),
  });
};

// Manager/Team Lead Timesheet Approval's default landing table — every mapped Employee's
// approval-summary buckets in one combined list, tagged with which Employee each row belongs to,
// so the Manager/Team Lead never has to open an Employee individually just to see whether they
// have anything pending. Backed by GET /my-team/timesheets/approval-summary/all, which resolves
// "my team" the same way GET /my-team/employees does (see myTeamApi.getEmployees's own comment)
// and does real server-side grouping/filtering/sorting/pagination in one query — this replaced an
// earlier version of this hook that fanned out one request per Employee, hardcoded to each
// Employee's first 100 buckets: with a large team that meant up to N requests and N*100 rows
// downloaded on every render regardless of which page was showing, plus a silent per-Employee cap
// past 100 buckets. None of that applies here — `page`/`limit` are real pagination against the
// database, and `employee_ids` (when the caller passes it — e.g. narrowed by this screen's own
// BU/Entity filter, or a single deep-linked Employee) can only remove Employees from the result,
// never add one outside the caller's own mapped team.
//
// `params` — everything GET /my-team/timesheets/approval-summary/all accepts: `log_type`,
// `startDate`/`endDate`, `status`, `service_po_id`, `search` (matches employee name, employee
// code, or Service PO name), `employee_ids`, `buId` (mapped to `business_unit_id` + the matching
// X-Company-Id header by myTeamApi.getApprovalSummaryAll — never the navbar's globally-active BU),
// `page`, `limit`, `sortBy` (`employee`/`period`/`hours`/`entries`/`status`), `sortOrder`. Omitting
// `sortBy` gets the backend's own default (pending first, newest period, then name) — the same
// fallback order this table's column-sort used to compute client-side.
export const useMyTeamApprovalSummaryAll = (params, { enabled = true } = {}) => {
  const query = useQuery({
    queryKey: QUERY_KEYS.MY_TEAM_APPROVAL_SUMMARY_ALL(params),
    queryFn: () => myTeamApi.getApprovalSummaryAll(params),
    enabled,
    // Keeps the previous page's rows on screen (instead of flashing to a loading/empty state)
    // while the next page's request is in flight — same UX every other paginated table in this
    // app already gets for free from DataTable's own server-pagination path.
    placeholderData: keepPreviousData,
  });

  // Memoized on `query.data` itself (not recomputed into a fresh array identity on every render)
  // — a caller's own effect that reacts to `rows` (e.g. merging pages into a lookup cache, see
  // both AllEmployeesTimesheetView components) would otherwise re-fire on every render regardless
  // of whether the underlying data actually changed, since a plain `.map()` here would hand back a
  // new array reference every time even when `query.data` is unchanged — a real infinite-render
  // loop confirmed live ("Maximum update depth exceeded") before this was memoized.
  const rows = useMemo(() => (query.data?.data ?? []).map((row) => ({
    ...row,
    employeeId: row.employee_id ?? row.employee?.id,
    employeeName: row.employee_name ?? row.employee?.full_name ?? row.employee?.name,
    employeeCode: row.employee_code ?? row.employee?.employee_code,
  })), [query.data]);

  return {
    rows,
    meta: query.data?.meta ?? {},
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
};

export const useApproveMyTeamTimesheets = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: myTeamApi.approveTimesheets,
    // Broad prefix invalidation — any page/filter/employee combination of the summary refetches,
    // so approved rows (and their embedded entries) flip status without locally guessing it.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-team', 'approval-summary'] }),
  });
};

// Entry-level reject/approve (Work Log Rejection Workflow) — same broad invalidation as the
// bulk mutation above, since a single entry's status change also flips its parent bucket's
// aggregated approval_status.
export const useRejectMyTeamTimesheetEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remark }) => myTeamApi.rejectTimesheetEntry(id, remark),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-team', 'approval-summary'] }),
  });
};

export const useApproveMyTeamTimesheetEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => myTeamApi.approveTimesheetEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-team', 'approval-summary'] }),
  });
};

// "Log Work for My Team" — a Team Lead filling in a mapped Employee's monthly work log on their
// behalf (see pages/myTeam/TeamLeadFillWorkLog.jsx). `enabled` follows the caller (only fetch once
// both an Employee and a Month/Year are picked).
export const useEmployeeMonthlyWorkLog = (employeeId, { month, year } = {}, { enabled = true } = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG(employeeId, month, year),
    queryFn: () => myTeamApi.getEmployeeMonthlyWorkLog(employeeId, { month, year }),
    enabled: enabled && !!employeeId && !!month && !!year,
  });

export const useSaveEmployeeMonthlyWorkLog = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, month, year, entries }) =>
      myTeamApi.saveEmployeeMonthlyWorkLog(employeeId, { month, year, entries }),
    onSuccess: (_data, { employeeId, month, year }) =>
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG(employeeId, month, year) }),
  });
};

export const useDeleteEmployeeMonthlyWorkLog = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, month, year }) => myTeamApi.deleteEmployeeMonthlyWorkLog(employeeId, { month, year }),
    onSuccess: (_data, { employeeId, month, year }) =>
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG(employeeId, month, year) }),
  });
};

// Bulk Upload mode — one file can touch any number of the caller's Employees, so on success this
// invalidates every cached MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG entry by prefix (that key shape is
// `['my-team', 'employees', employeeId, 'monthly-worklog', month, year]`, so a 2-element prefix
// matches all of them) rather than trying to enumerate which employee/month combinations were
// touched from the response alone.
export const useImportMyTeamMonthlyWorkLog = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, month, year, onUploadProgress }) =>
      myTeamApi.importMonthlyWorkLog({ file, month, year, onUploadProgress }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-team', 'employees'] }),
  });
};

// Mirrors TeamLeadFillWorkLogDrawer's own filter — a hierarchy node nested under a Service PO is
// shown there for context only, never editable by the Team Lead, so it's excluded here too: this
// total must read as "what the drawer would show as already filled in" for that Employee, not a
// bigger number the drawer itself never displays.
const isTopLevelServicePO = (po) =>
  (po.depth ?? 0) === 0 && !(po.ancestorKeys?.length) && po.hierarchy_node_id == null && po.parent_id == null;

const sumWorkLogHours = (workLog) =>
  (workLog?.service_pos ?? [])
    .filter(isTopLevelServicePO)
    .reduce((sum, po) => sum + Number(po.hours ?? po.existing_hours ?? po.total_hours ?? 0), 0);

// Employee list's "Total Hours" column — one GET .../monthly-worklog per Employee for the
// selected Month/Year, fanned out via useQueries (no combined "all Employees" endpoint for this
// one). Shares
// its cache entry (same MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG key) with useEmployeeMonthlyWorkLog, so
// opening the drawer for a row already warmed by this list re-uses it instead of re-fetching, and
// vice versa.
export const useMyTeamEmployeesMonthlyWorkLogTotals = (employees, { month, year } = {}, { enabled = true } = {}) => {
  const queries = useQueries({
    queries: employees.map((emp) => ({
      queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG(emp.id, month, year),
      queryFn: () => myTeamApi.getEmployeeMonthlyWorkLog(emp.id, { month, year }),
      enabled: enabled && !!emp.id && !!month && !!year,
    })),
  });

  const totalsByEmployeeId = new Map();
  queries.forEach((q, i) => {
    const emp = employees[i];
    if (!emp) return;
    totalsByEmployeeId.set(emp.id, { totalHours: sumWorkLogHours(q.data), isLoading: q.isLoading });
  });

  return totalsByEmployeeId;
};
