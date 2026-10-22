import apiClient from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, paginate, findUserById, findEmployeeById, findRoleByName,
  mockError,
} from '@/mocks/rbacMockDb';
import { ROLE_NAMES } from '@/constants/roleHierarchy';

// BU Head Master — additive peer of BU Admin Master (reachable by Admin / Entity Admin — see
// rbacForms.js/Sidebar.jsx). Real contract confirmed 2026-08-20 by the backend developer:
//
// - POST /bu-heads requires `company_ids` (min 1) UP FRONT — creation and initial BU mapping
//   happen in the same call, not as a separate step (BuHeadForm.jsx embeds the BU picker).
// - Mapping afterward is INCREMENTAL, not a bulk replace: POST /bu-heads/:id/companies adds one
//   or more, DELETE /bu-heads/:id/companies/:companyId removes exactly one. There is no
//   bulk-replace endpoint — useSyncBuHeadCompanies (useBuHeads.js) diffs the desired selection
//   against what's currently mapped and fires the right add/remove calls underneath a single
//   "Save" button.
// - GET /bu-heads returns no mapped-BU count — BuHeadList.jsx fetches it per row via
//   getMappedCompanies instead.
// - `password` is optional on create — omit it and the backend auto-generates one, returned
//   once as `temporaryPassword` (never retrievable again).
//
// Do NOT send X-Company-Id on any of these 5 endpoints — the caller is Admin/Entity Admin, not
// a BU Head, and apiClient's interceptor only attaches that header when the session itself has
// a selectedBuId (which only a BU Head session ever has), so this is already correct by
// construction.

const isBuHead = (user) => user.role_id === findRoleByName(ROLE_NAMES.BU_HEAD).id;

// Normalizes both mock and real list rows to the same flat shape BuHeadList.jsx renders —
// the real backend nests `employee`/`role`/`additionalRoles`; the mock builds the same shape
// directly.
const serializeBuHeadRow = (employee, user) => ({
  id: user.id,
  employee_id: employee?.id ?? null,
  employee_code: employee?.employee_code ?? null,
  full_name: employee?.full_name ?? null,
  designation: employee?.designation ?? null,
  email: user.email,
  status: user.status,
});

const generateTemporaryPassword = () => `Xk${Math.random().toString(36).slice(2, 8)}!Aa1`;

const validationError = (field, message) => {
  const err = new Error('Request validation failed. Please check the submitted data.');
  err.response = {
    status: 422,
    data: { success: false, code: 'VALIDATION_ERROR', message: err.message, errors: [{ field, message }] },
  };
  return err;
};

const mockCreate = async (payload) => {
  await delay();
  const db = getDb();
  if (!Array.isArray(payload.company_ids) || payload.company_ids.length === 0) {
    throw validationError('company_ids', 'At least one company_id is required.');
  }
  if (db.users.some((u) => u.email.toLowerCase() === payload.email.toLowerCase())) {
    throw mockError(409, `A user with email "${payload.email}" already exists.`);
  }
  if (db.employees.some((e) => e.employee_code === payload.employee_code)) {
    throw mockError(409, `Employee code "${payload.employee_code}" is already in use.`);
  }
  const buHeadRole = findRoleByName(ROLE_NAMES.BU_HEAD);
  const employeeRole = findRoleByName(ROLE_NAMES.EMPLOYEE);
  const employeeId = nextId('employees');
  const userId = nextId('users');
  const usedGeneratedPassword = !payload.password;
  const password = payload.password || generateTemporaryPassword();
  const employee = {
    id: employeeId,
    company_id: null,
    employee_code: payload.employee_code,
    full_name: payload.full_name,
    designation: payload.designation ?? '',
    total_experience: payload.total_experience ?? null,
    company_experience: payload.company_experience ?? null,
    resource_description: payload.resource_description ?? '',
    date_of_joining: payload.date_of_joining ?? null,
    date_of_leaving: payload.date_of_leaving || null,
    status: payload.status ?? 'active',
    primary_manager_user_id: null,
    secondary_manager_user_id: null,
    linked_user_id: userId,
  };
  const user = {
    id: userId,
    company_id: null,
    employee_id: employeeId,
    email: payload.email,
    password,
    // Backend automatically assigns BU Head + Employee — never a free role selector (§4).
    role_id: buHeadRole.id,
    additional_role_ids: [employeeRole.id],
    status: 'active',
    last_login: null,
  };
  db.employees.push(employee);
  db.users.push(user);
  const companyIds = payload.company_ids.map(Number);
  // Mock has no Companies table of its own (Companies are real-backend-only in this app — see
  // companies.api.js) — denormalized placeholder names only, cosmetic in mock mode.
  companyIds.forEach((cid) => {
    db.buHeadBuMappings.push({ id: nextId('buHeadBuMappings'), bu_head_user_id: user.id, company_id: cid, company_name: `Company #${cid}` });
  });
  persist();
  return {
    success: true,
    message: 'BU Head created successfully.',
    data: {
      employee: { id: employee.id, employee_code: employee.employee_code, full_name: employee.full_name, email: user.email },
      buHead: { id: user.id, email: user.email, employee_id: employee.id, role_id: buHeadRole.id, roles: ['BU Head', 'Employee'], company_ids: companyIds },
      companyIds,
      ...(usedGeneratedPassword ? { temporaryPassword: password } : {}),
    },
  };
};

const mockGetAll = async (params) => {
  await delay();
  const rows = getDb().users
    .filter(isBuHead)
    .map((u) => serializeBuHeadRow(findEmployeeById(u.employee_id), u));
  const result = paginate(rows, { ...params, searchFields: ['full_name', 'email', 'employee_code'] });
  return { success: true, message: 'BU Heads fetched successfully.', data: result.data, meta: result.meta };
};

const mockUpdateStatus = async (id, status) => {
  await delay();
  const user = findUserById(Number(id));
  if (!user || !isBuHead(user)) throw mockError(404, 'BU Head not found.');
  user.status = status;
  persist();
  return {
    success: true,
    message: `BU Head ${status === 'active' ? 'activated' : 'deactivated'} successfully.`,
    data: serializeBuHeadRow(findEmployeeById(user.employee_id), user),
  };
};

const mockGetMappedCompanies = async (buHeadId) => {
  await delay();
  const user = findUserById(Number(buHeadId));
  if (!user || !isBuHead(user)) throw mockError(404, 'BU Head not found.');
  const rows = getDb().buHeadBuMappings.filter((m) => m.bu_head_user_id === user.id);
  return { success: true, message: 'Mapped BUs fetched successfully.', data: rows.map((m) => ({ id: m.company_id, name: m.company_name })) };
};

const mockAddCompanies = async (buHeadId, companyIds) => {
  await delay();
  const db = getDb();
  const user = findUserById(Number(buHeadId));
  if (!user || !isBuHead(user)) throw mockError(404, 'BU Head not found.');
  const existing = new Set(db.buHeadBuMappings.filter((m) => m.bu_head_user_id === user.id).map((m) => m.company_id));
  const ids = companyIds.map(Number);
  const dupe = ids.find((cid) => existing.has(cid));
  if (dupe != null) throw mockError(409, `Company #${dupe} is already mapped to this BU Head.`);
  ids.forEach((cid) => {
    db.buHeadBuMappings.push({ id: nextId('buHeadBuMappings'), bu_head_user_id: user.id, company_id: cid, company_name: `Company #${cid}` });
  });
  persist();
  const rows = db.buHeadBuMappings.filter((m) => m.bu_head_user_id === user.id);
  return { success: true, message: 'BUs mapped successfully.', data: rows.map((m) => ({ id: m.company_id, name: m.company_name })) };
};

const mockRemoveCompany = async (buHeadId, companyId) => {
  await delay();
  const db = getDb();
  const user = findUserById(Number(buHeadId));
  if (!user || !isBuHead(user)) throw mockError(404, 'BU Head not found.');
  const idx = db.buHeadBuMappings.findIndex((m) => m.bu_head_user_id === user.id && m.company_id === Number(companyId));
  if (idx === -1) throw mockError(404, `Company #${companyId} is not mapped to this BU Head.`);
  db.buHeadBuMappings.splice(idx, 1);
  persist();
  return { success: true, message: 'BU unmapped successfully.', data: null };
};

export const buHeadsApi = {
  // payload: employeeBaseFields + email + optional password + required company_ids (min 1).
  // Single call — backend creates Employee + User + BU Head/Employee roles + initial BU mapping
  // transactionally (§16 of the BU Head spec).
  create: (payload) => {
    if (RBAC_MOCK_ENABLED) return mockCreate(payload);
    return apiClient.post('/bu-heads', payload).then((r) => r.data);
  },
  getAll: (params) => {
    if (RBAC_MOCK_ENABLED) return mockGetAll(params);
    return apiClient.get('/bu-heads', { params }).then((r) => ({
      ...r.data,
      data: (r.data.data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        status: row.status,
        employee_id: row.employee?.id ?? null,
        employee_code: row.employee?.employee_code ?? null,
        full_name: row.employee?.full_name ?? null,
        designation: row.employee?.designation ?? null,
      })),
    }));
  },
  updateStatus: (id, status) => {
    if (RBAC_MOCK_ENABLED) return mockUpdateStatus(id, status);
    return apiClient.patch(`/bu-heads/${id}/status`, { status }).then((r) => r.data);
  },
  getMappedCompanies: (buHeadId) => {
    if (RBAC_MOCK_ENABLED) return mockGetMappedCompanies(buHeadId);
    return apiClient.get(`/bu-heads/${buHeadId}/companies`).then((r) => ({
      ...r.data,
      data: (r.data.data ?? []).map((m) => ({ id: m.company?.id ?? m.company_id, name: m.company?.company_name ?? '' })),
    }));
  },
  // Incremental add — the backend has no bulk-replace endpoint; one call can add multiple ids.
  addCompanies: (buHeadId, companyIds) => {
    if (RBAC_MOCK_ENABLED) return mockAddCompanies(buHeadId, companyIds);
    return apiClient.post(`/bu-heads/${buHeadId}/companies`, { company_ids: companyIds }).then((r) => r.data);
  },
  // Incremental remove — exactly one company per call.
  removeCompany: (buHeadId, companyId) => {
    if (RBAC_MOCK_ENABLED) return mockRemoveCompany(buHeadId, companyId);
    return apiClient.delete(`/bu-heads/${buHeadId}/companies/${companyId}`).then((r) => r.data);
  },
};
