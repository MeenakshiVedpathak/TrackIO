import apiClient, { explicitBuScope } from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, findEmployeeById, getCurrentMockEmployee, mockError,
} from '@/mocks/rbacMockDb';

const requireActor = () => {
  const actor = getCurrentMockEmployee();
  if (!actor) throw mockError(401, 'Not authenticated.');
  return actor;
};

const serializeEmployee = (e) => ({
  id: e.id,
  employee_code: e.employee_code,
  full_name: e.full_name,
  designation: e.designation,
  status: e.status,
  business_unit_ids: e.business_unit_ids ?? [],
  mapping_type: e.primary_manager_employee_id === e.__actorId ? 'PRIMARY' : 'SECONDARY',
});

const mockGetEmployees = async (params) => {
  await delay();
  const actor = requireActor();
  let list = getDb().employees
    .filter((e) => e.primary_manager_employee_id === actor.id || e.secondary_manager_employee_id === actor.id);
  if (params?.buId && params.buId !== 'all') {
    const targetBuId = Number(params.buId);
    list = list.filter((e) => (e.business_unit_ids ?? []).includes(targetBuId));
  }
  return list.map((e) => serializeEmployee({ ...e, __actorId: actor.id }));
};

const mockGetServicePos = async () => {
  await delay();
  const actor = requireActor();
  return getDb().managerServicePoGrants.filter((g) => g.manager_user_id === actor.id && g.status === 'active');
};

const mockMapEmployee = async (employeeId) => {
  await delay();
  const actor = requireActor();
  const employee = findEmployeeById(employeeId);
  if (!employee) throw mockError(404, 'Employee not found.');
  const actorBuIds = new Set(actor.business_unit_ids ?? []);
  if (!(employee.business_unit_ids ?? []).some((id) => actorBuIds.has(id))) throw mockError(404, 'Employee not found.');
  if (employee.primary_manager_employee_id === actor.id) throw mockError(409, 'You are already this Employee\'s Primary manager.');
  if (employee.secondary_manager_employee_id) throw mockError(409, 'This Employee already has a Secondary manager.');
  employee.secondary_manager_employee_id = actor.id;
  persist();
  return {
    success: true,
    message: 'Employee mapped successfully.',
    data: { id: nextId('employeeServicePoGrants'), manager_user_id: actor.id, employee_id: employee.id, mapping_type: 'SECONDARY', status: 'active' },
  };
};

const mockUnmapEmployee = async (employeeId) => {
  await delay();
  const actor = requireActor();
  const employee = findEmployeeById(employeeId);
  if (!employee || employee.secondary_manager_employee_id !== actor.id) {
    throw mockError(404, "This Employee isn't yours.");
  }
  employee.secondary_manager_employee_id = null;
  persist();
};

const mockGrantServicePo = async (employeeId, servicePOId) => {
  await delay();
  const actor = requireActor();
  const owned = getDb().managerServicePoGrants.some((g) => g.manager_user_id === actor.id && g.service_po_id === servicePOId && g.status === 'active');
  if (!owned) throw mockError(403, 'This Service PO has not been granted to you by a Service PO Admin.');
  const existing = getDb().employeeServicePoGrants.find((g) => g.employee_id === employeeId && g.service_po_id === servicePOId && g.status === 'active');
  if (existing) throw mockError(409, 'This Service PO is already granted to this Employee.');
  const grant = { id: nextId('employeeServicePoGrants'), employee_id: employeeId, service_po_id: servicePOId, granted_by_manager_user_id: actor.id, status: 'active' };
  getDb().employeeServicePoGrants.push(grant);
  persist();
  return { success: true, message: 'Service PO granted to Employee.', data: grant };
};

// Not in the spec's endpoint list explicitly, but the natural GET counterpart of the POST/DELETE
// `.../employees/:employeeId/service-pos[/...]` pair already specified — needed so the UI can
// show which POs are already granted to a given Employee before granting/revoking more.
const mockGetEmployeeServicePos = async (employeeId) => {
  await delay();
  return getDb().employeeServicePoGrants.filter((g) => g.employee_id === employeeId && g.status === 'active');
};

const mockRevokeServicePo = async (employeeId, servicePOId) => {
  await delay();
  const grant = getDb().employeeServicePoGrants.find((g) => g.employee_id === employeeId && g.service_po_id === servicePOId);
  if (!grant) throw mockError(404, 'Grant not found.');
  getDb().employeeServicePoGrants = getDb().employeeServicePoGrants.filter((g) => g.id !== grant.id);
  persist();
  return { success: true, message: 'Service PO grant revoked.' };
};

const fetchApprovalSummaryPage = (params) =>
  apiClient.get('/my-team/timesheets/approval-summary', { params }).then((r) => r.data);

// Manager self-service (§8). GET employees/service-pos existed pre-redesign; POST/DELETE
// employees (claim/release the Secondary-manager slot) are net-new.
export const myTeamApi = {
  getEmployees: (params) => {
    if (RBAC_MOCK_ENABLED) return mockGetEmployees(params);
    const { buId, ...restParams } = params || {};
    const scope = buId && buId !== 'all' ? explicitBuScope(buId) : {};
    return apiClient.get('/my-team/employees', {
      params: { ...restParams, ...(buId && buId !== 'all' ? { business_unit_id: buId } : {}) },
      ...scope,
    }).then((r) => r.data?.data ?? []);
  },
  // Manager Timesheet Access & Approval — real backend only, no mock (RBAC_MOCK_ENABLED is
  // false in this environment and the mock db has no timesheet fixtures).
  // Aggregated approval table: one row per date (log_type=daily) or per month (log_type=monthly),
  // pre-totaled server-side, each embedding its own underlying entries inline (so the drill-down
  // drawer needs no separate fetch). approval_status is 'pending'|'approved'; approval_required
  // mirrors the Employee's is_timesheet_approval_required (false there means status is always
  // 'approved'). Never reads `drafts` — an Employee's own unsynced entries are not approval-eligible.
  getApprovalSummary: (params) => fetchApprovalSummaryPage(params),
  // Single endpoint for single-row, bulk-daily, and monthly approval alike — pass exactly one of
  // `dates` (array) or `months` (array of {month,year}); a single-element array covers the
  // "approve this one date/month" case, so no separate single-approve call is needed.
  approveTimesheets: ({ employeeId, dates, months }) =>
    apiClient.post('/my-team/timesheets/approve', {
      employee_id: Number(employeeId),
      ...(dates ? { dates } : { months }),
    }).then((r) => r.data),
  // Work Log Rejection Workflow (2026-08-23 spec) — entry-level, unlike the date/month-level
  // bulk endpoint above. Only a `pending` entry can be rejected; a 409 means someone else
  // already acted on it (caller should refetch). `remark` is mandatory server-side (1-1000
  // chars, trimmed) but the UI must also block submit on empty remark, not rely on the 422 alone.
  rejectTimesheetEntry: (id, remark) =>
    apiClient.put(`/my-team/timesheets/${id}/reject`, { remark }).then((r) => r.data),
  // Single-row approve — exists alongside the bulk date/month endpoint above so a Manager can
  // approve one still-pending entry inside a bucket that also has rejected entries (bulk approve
  // would otherwise be the only option and doesn't distinguish per-entry status).
  approveTimesheetEntry: (id) =>
    apiClient.put(`/my-team/timesheets/${id}/approve`).then((r) => r.data),
  getServicePos: () => {
    if (RBAC_MOCK_ENABLED) return mockGetServicePos();
    return apiClient.get('/my-team/service-pos').then((r) => r.data?.data ?? []);
  },
  getEmployeeServicePos: (employeeId) => {
    if (RBAC_MOCK_ENABLED) return mockGetEmployeeServicePos(employeeId);
    return apiClient.get(`/my-team/employees/${employeeId}/service-pos`).then((r) => r.data?.data ?? []);
  },
  mapEmployee: (employeeId) => {
    if (RBAC_MOCK_ENABLED) return mockMapEmployee(employeeId);
    return apiClient.post('/my-team/employees', { employee_id: employeeId }).then((r) => r.data);
  },
  unmapEmployee: (employeeId) => {
    if (RBAC_MOCK_ENABLED) return mockUnmapEmployee(employeeId);
    return apiClient.delete(`/my-team/employees/${employeeId}`).then((r) => r.data);
  },
  grantServicePo: (employeeId, servicePOId) => {
    if (RBAC_MOCK_ENABLED) return mockGrantServicePo(employeeId, servicePOId);
    return apiClient.post(`/my-team/employees/${employeeId}/service-pos`, { service_po_id: servicePOId }).then((r) => r.data);
  },
  revokeServicePo: (employeeId, servicePOId) => {
    if (RBAC_MOCK_ENABLED) return mockRevokeServicePo(employeeId, servicePOId);
    return apiClient.delete(`/my-team/employees/${employeeId}/service-pos/${servicePOId}`).then((r) => r.data);
  },
};
