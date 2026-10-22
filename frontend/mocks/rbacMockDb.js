// In-memory mock "backend" for the Employee Identity Migration (see
// project_employee_identity_migration in this session's notes / the plan this implements).
// Persisted to sessionStorage so a page refresh mid-demo doesn't lose state; a new browser
// tab/session starts fresh from the seed below.
//
// Login is now directly against an Employee row — `role_ids`/`business_unit_ids` live flat on
// the employee (no primary/additional split, no single `company_id`). `businessUnits` carries
// `is_original_data_visible` now (moved off Role Master's own field — see companies.api.js's new
// create payload), not roles.
//
// Coexistence note (staged migration — BU Admin Master / BU Head Master stay live until backend
// cutover, per explicit product decision): the legacy `users` + `buHeadBuMappings` collections
// below are kept alongside the new `employees` model purely so those two screens keep working
// exactly as before. They are a separate, disconnected dataset from `employees` — a `users` row
// can no longer log in (login is 100% employee-based now), and creating/managing a BU Admin or
// BU Head through these legacy screens does NOT create or update anything in `employees`. This
// intentional duplication is expected during the transition and gets reconciled at real cutover,
// not before.
import { ROLE_HIERARCHY, ROLE_NAMES, ROLE_CREATION_MATRIX, SENIOR_ROLE_NAMES, ADDITIONAL_ROLE_NAMES } from '@/constants/roleHierarchy';
import { getAccessToken } from '@/services/apiClient';

const STORAGE_KEY = 'rbac_mock_db_v2';

// Every seeded account shares this password — documented here so the app is actually
// click-through testable per role.
export const MOCK_PASSWORD = 'Test@1234';
export const MOCK_OTP = '582194';

export const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const buildSeed = () => {
  const roles = ROLE_HIERARCHY.map((r, i) => ({
    id: i + 1,
    role_name: r.name,
    permission: r.name === ROLE_NAMES.EMPLOYEE ? 'Read' : 'Read & Write',
    status: 'active',
    hierarchy_rank: r.hierarchy_rank,
    inherits_role_id: null,
    // Role Master's own field (unchanged screen/concept, unrelated to this migration) — no
    // longer what the login response's isOriginalDataVisible gate reads from (that moved to
    // businessUnits, see below), but Role Master itself still owns and edits this.
    is_original_data_visible: [ROLE_NAMES.HR, ROLE_NAMES.BU_ADMIN].includes(r.name),
    is_system: true,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  const roleId = (name) => roles.find((r) => r.role_name === name).id;
  // Project Admin / Service PO Admin "inherit Manager's capabilities" per spec §3.1, modeled as
  // a chain matching the hierarchy diagram: Project Admin -> Service PO Admin -> Manager.
  roles.find((r) => r.role_name === ROLE_NAMES.SERVICE_PO_ADMIN).inherits_role_id = roleId(ROLE_NAMES.PROJECT_ADMIN);
  roles.find((r) => r.role_name === ROLE_NAMES.PROJECT_ADMIN).inherits_role_id = roleId(ROLE_NAMES.MANAGER);

  // Companies are real-backend-only in this app (never mocked — see companies.api.js), so this
  // is a small denormalized placeholder table purely so mock employees have something to hold
  // `business_unit_ids` against and the login response can echo real-looking `businessUnits`.
  const businessUnits = [
    { id: 1, name: 'Mock BU Alpha', is_original_data_visible: true },
    { id: 2, name: 'Mock BU Beta', is_original_data_visible: false },
  ];

  // One employee row IS the login now — no separate `users` collection. Every account tier from
  // the old seed is preserved 1:1 (same emails) so nothing regresses; `multibu@mock.test` is new,
  // replacing the old BU-Head-only multi-BU seed to exercise the now-universal BU switcher.
  const employees = [
    { id: 1, employee_code: 'EMP-PLAT', full_name: 'Priya PlatformAdmin', designation: 'Platform Admin', total_experience: 12, company_experience: 5, resource_description: '', date_of_joining: '2020-01-01', date_of_leaving: null, status: 'active', email: 'platformadmin@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.PLATFORM_ADMIN)], business_unit_ids: [], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: false },
    // Admin can now carry mapped BUs (unlike Platform Admin/Entity Admin, which stay BU-less) —
    // seeded with both mock BUs so the switcher exercises for this role too.
    { id: 2, employee_code: 'EMP-ADMIN', full_name: 'Amit Admin', designation: 'Admin', total_experience: 10, company_experience: 4, resource_description: '', date_of_joining: '2020-06-01', date_of_leaving: null, status: 'active', email: 'admin@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.ADMIN)], business_unit_ids: [1, 2], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: false },
    { id: 3, employee_code: 'EMP-EADMIN', full_name: 'Elena EntityAdmin', designation: 'Entity Admin', total_experience: 9, company_experience: 3, resource_description: '', date_of_joining: '2021-02-01', date_of_leaving: null, status: 'active', email: 'entityadmin@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.ENTITY_ADMIN)], business_unit_ids: [], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: false },
    { id: 4, employee_code: 'EMP-BUADM', full_name: 'Baldev BuAdmin', designation: 'BU Admin', total_experience: 8, company_experience: 3, resource_description: '', date_of_joining: '2021-06-01', date_of_leaving: null, status: 'active', email: 'buadmin@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.BU_ADMIN), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    // Exercises the universal (no-longer-BU-Head-only) multi-BU switcher and a senior role held
    // alongside an operational one, same combination BU Admin + Employee already had.
    { id: 5, employee_code: 'EMP-MULTI', full_name: 'Morgan MultiBu', designation: 'BU Admin', total_experience: 8, company_experience: 4, resource_description: '', date_of_joining: '2021-03-01', date_of_leaving: null, status: 'active', email: 'multibu@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.BU_ADMIN), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1, 2], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    { id: 6, employee_code: 'EMP-PROJ', full_name: 'Priti ProjectAdmin', designation: 'Project Admin', total_experience: 7, company_experience: 3, resource_description: '', date_of_joining: '2022-01-01', date_of_leaving: null, status: 'active', email: 'projectadmin@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.PROJECT_ADMIN), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    { id: 7, employee_code: 'EMP-SPOA', full_name: 'Sanjay ServicePoAdmin', designation: 'Service PO Admin', total_experience: 6, company_experience: 3, resource_description: '', date_of_joining: '2022-03-01', date_of_leaving: null, status: 'active', email: 'servicepoadmin@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.SERVICE_PO_ADMIN), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    { id: 8, employee_code: 'EMP-MGR1', full_name: 'Manisha Manager', designation: 'Manager', total_experience: 6, company_experience: 3, resource_description: '', date_of_joining: '2022-04-01', date_of_leaving: null, status: 'active', email: 'manager@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.MANAGER), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    { id: 9, employee_code: 'EMP-MGR2', full_name: 'Rohit Manager', designation: 'Manager', total_experience: 5, company_experience: 2, resource_description: '', date_of_joining: '2022-05-01', date_of_leaving: null, status: 'active', email: 'manager2@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.MANAGER), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    { id: 10, employee_code: 'EMP-HR01', full_name: 'Hema HR', designation: 'HR', total_experience: 4, company_experience: 2, resource_description: '', date_of_joining: '2022-07-01', date_of_leaving: null, status: 'active', email: 'hr@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.HR), roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: null, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    { id: 11, employee_code: 'EMP-0001', full_name: 'Stage3 Smoketest Employee', designation: 'Software Engineer', total_experience: 3.5, company_experience: 1.0, resource_description: '', date_of_joining: '2025-01-15', date_of_leaving: null, status: 'active', email: 'employee@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: 8, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
    // Extra non-login-documented row purely for list-page variety/pagination testing.
    { id: 12, employee_code: 'EMP-0002', full_name: 'Jordan Lee', designation: 'QA Engineer', total_experience: 2.0, company_experience: 2.0, resource_description: '', date_of_joining: '2024-06-01', date_of_leaving: null, status: 'active', email: 'jordan.lee@mock.test', password: MOCK_PASSWORD, role_ids: [roleId(ROLE_NAMES.EMPLOYEE)], business_unit_ids: [1], primary_manager_employee_id: 9, secondary_manager_employee_id: null, is_timesheet_approval_required: true },
  ];

  // Legacy dataset backing BU Admin Master / BU Head Master only (see coexistence note above) —
  // disconnected from the `employees` seed above, same shape this app used before this
  // migration. `buhead@mock.test` cannot log in through the new employee-based login (that's
  // the whole point of the migration); it's here purely so BU Head Master's own list has a row.
  const legacyUsers = [
    { id: 101, company_id: 1, employee_id: null, email: 'legacy-buadmin@mock.test', password: MOCK_PASSWORD, role_id: roleId(ROLE_NAMES.BU_ADMIN), status: 'active', last_login: null },
    { id: 102, company_id: null, employee_id: null, email: 'buhead@mock.test', password: MOCK_PASSWORD, role_id: roleId(ROLE_NAMES.BU_HEAD), additional_role_ids: [roleId(ROLE_NAMES.EMPLOYEE)], status: 'active', last_login: null },
  ];

  return {
    meta: { nextIds: { employees: 13, roles: roles.length + 1, teamMappings: 2, managerServicePoGrants: 1, employeeServicePoGrants: 1, users: 103, buHeadBuMappings: 3 } },
    roles,
    businessUnits,
    employees,
    users: legacyUsers,
    // BU Head <-> BU (Company) mapping — Companies are real-backend-only in this app (never
    // mocked, see companies.api.js), so BU names are denormalized placeholders here, cosmetic in
    // mock mode only.
    buHeadBuMappings: [
      { id: 1, bu_head_user_id: 102, company_id: 1, company_name: 'Mock BU Alpha' },
      { id: 2, bu_head_user_id: 102, company_id: 2, company_name: 'Mock BU Beta' },
    ],
    teamMappings: [
      { id: 1, company_id: 1, service_po_admin_user_id: 7, manager_user_id: 8, status: 'active' },
    ],
    managerServicePoGrants: [],
    employeeServicePoGrants: [],
    otpStore: {},
  };
};

const load = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to a fresh seed
  }
  return buildSeed();
};

let db = load();

export const persist = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // sessionStorage unavailable (private mode, quota) — mock still works for this page load
  }
};

export const resetMockDb = () => {
  db = buildSeed();
  persist();
};

export const getDb = () => db;

export const nextId = (collection) => {
  const id = db.meta.nextIds[collection];
  db.meta.nextIds[collection] += 1;
  return id;
};

// ── Lookups ──
export const findRoleById = (id) => db.roles.find((r) => r.id === id);
export const findRoleByName = (name) => db.roles.find((r) => r.role_name === name);
export const findEmployeeById = (id) => db.employees.find((e) => e.id === id);
export const findEmployeeByEmail = (email) => db.employees.find((e) => e.email.toLowerCase() === email.toLowerCase());
export const findBusinessUnitById = (id) => db.businessUnits.find((b) => b.id === id);
// Legacy lookup — BU Admin Master / BU Head Master only (see coexistence note above).
export const findUserById = (id) => db.users.find((u) => u.id === id);

// The mock's "auth" — no real JWT, just `mock.<employeeId>` issued at login and decoded back
// here. Every mocked endpoint that needs to know "who is calling" reads it directly off
// localStorage rather than threading a token through every function (there's no real network
// hop to carry it on for a mock).
export const issueTokenFor = (employeeId) => `mock.${employeeId}.${Date.now()}`;
export const getCurrentMockEmployee = () => {
  const token = getAccessToken();
  if (!token?.startsWith('mock.')) return null;
  const employeeId = Number(token.split('.')[1]);
  return findEmployeeById(employeeId) ?? null;
};

export const serializeRole = (role) => role && {
  id: role.id,
  role_name: role.role_name,
  permission: role.permission,
  status: role.status,
  hierarchy_rank: role.hierarchy_rank,
  inherits_role_id: role.inherits_role_id,
  is_original_data_visible: role.is_original_data_visible,
  is_system: role.is_system,
};

// Full employee record (list/detail views) — roles/businessUnits resolved flat, no
// primary/additional split. Never includes `password`.
export const serializeEmployeeFull = (employee) => {
  if (!employee) return null;
  const { password, role_ids, business_unit_ids, ...rest } = employee;
  return {
    ...rest,
    roles: (role_ids ?? []).map(findRoleById).filter(Boolean).map((r) => ({ id: r.id, role_name: r.role_name })),
    businessUnits: (business_unit_ids ?? []).map(findBusinessUnitById).filter(Boolean),
  };
};

// Login response's flat `roles[]` — no primary/additional distinction, no
// `is_original_data_visible` (that moved to `businessUnits`, see below).
export const rolesForLoginResponse = (employeeId) => {
  const employee = findEmployeeById(employeeId);
  return (employee.role_ids ?? []).map((rid) => {
    const role = findRoleById(rid);
    return { id: role.id, name: role.role_name, permission: role.permission, hierarchyRank: role.hierarchy_rank };
  });
};

// Login response's `businessUnits[]` — always present, `[]` for an employee with none (e.g.
// Platform Admin/Entity Admin; Admin can be mapped to BUs now).
export const businessUnitsForLoginResponse = (employeeId) => {
  const employee = findEmployeeById(employeeId);
  return (employee.business_unit_ids ?? []).map(findBusinessUnitById).filter(Boolean);
};

// module -> [{ id, name }], matching the shape POST /roles/forms already returns and Sidebar's
// buildNavGroups already consumes — see constants/rbacForms.js FORM_NAMES for the exact strings.
// 'BU Head Master' deliberately NOT seeded here — Sidebar.jsx injects it via a hardcoded
// Admin/Entity Admin check (mirroring Entity Admins), so it isn't duplicated.
const FORMS_BY_ROLE = {
  [ROLE_NAMES.PLATFORM_ADMIN]: {},
  [ROLE_NAMES.ADMIN]: { 'Entity Management': [{ id: 101, name: 'Entity Master' }, { id: 102, name: 'BU Master' }] },
  [ROLE_NAMES.ENTITY_ADMIN]: { 'Entity Management': [{ id: 101, name: 'Entity Master' }, { id: 102, name: 'BU Master' }] },
  // 'BU Master' mirrors the Role-Form Mapping this tier gets on the real backend: a BU Admin
  // needs to SEE the BUs they map employees against, but reaches that screen READ-ONLY — no Add
  // BU, no edit, no activate/deactivate (see pages/companies/CompanyList.jsx's
  // useCanManageBusinessUnits and the Admin/Entity-Admin guard on COMPANY_NEW/COMPANY_EDIT).
  [ROLE_NAMES.BU_ADMIN]: {
    'Entity Management': [{ id: 102, name: 'BU Master' }],
    Administration: [{ id: 103, name: 'Roles' }, { id: 104, name: 'Forms' }],
    People: [{ id: 105, name: 'Employee Master' }],
  },
  // BU Head gets the identical form set as BU Admin — never diverge this from BU_ADMIN's own
  // entry above. Currently unreachable via login (no employee holds this role — BU Head Master
  // is the only mint path and its accounts are legacy `users` rows that can't log in), kept for
  // parity/robustness.
  [ROLE_NAMES.BU_HEAD]: {
    'Entity Management': [{ id: 102, name: 'BU Master' }],
    Administration: [{ id: 103, name: 'Roles' }, { id: 104, name: 'Forms' }],
    People: [{ id: 105, name: 'Employee Master' }],
  },
  [ROLE_NAMES.PROJECT_ADMIN]: {},
  [ROLE_NAMES.SERVICE_PO_ADMIN]: {},
  [ROLE_NAMES.MANAGER]: {},
  [ROLE_NAMES.HR]: { People: [{ id: 105, name: 'Employee Master' }] },
  [ROLE_NAMES.EMPLOYEE]: {
    Core: [{ id: 401, name: 'Employee Dashboard' }],
    'Work Log': [{ id: 402, name: 'My Work Log' }, { id: 403, name: 'Monthly Summary' }],
    Report: [{ id: 404, name: 'PO Wise Report' }],
  },
};

// A multi-role employee's forms are the union across every held role (roles is a real flat
// array now, not one primary role) — de-duplicated per module/form id.
export const formsForRoleNames = (roleNames) => {
  const merged = {};
  roleNames.forEach((name) => {
    const forms = FORMS_BY_ROLE[name] ?? {};
    Object.entries(forms).forEach(([moduleName, rows]) => {
      merged[moduleName] = merged[moduleName] ?? [];
      rows.forEach((row) => {
        if (!merged[moduleName].some((f) => f.id === row.id)) merged[moduleName].push(row);
      });
    });
  });
  return merged;
};

export const roleMatrixError = (actorRoleName, targetRoleName) => {
  const allowed = ROLE_CREATION_MATRIX[actorRoleName] ?? [];
  return `"${actorRoleName}" cannot assign role "${targetRoleName}". Allowed roles: ${allowed.join(', ') || 'none'}.`;
};

export const assertCanAssignRole = (actorRoleName, targetRoleName) => {
  const allowed = ROLE_CREATION_MATRIX[actorRoleName] ?? [];
  if (!allowed.includes(targetRoleName)) {
    const err = new Error(roleMatrixError(actorRoleName, targetRoleName));
    err.mockStatus = 403;
    throw err;
  }
};

// Multi-role support: any number of non-senior/operational roles may be held alongside the
// (at most one) senior role — shared by every mocked endpoint that assigns roles.
export const assertValidAdditionalRole = (roleName) => {
  if (!ADDITIONAL_ROLE_NAMES.includes(roleName)) {
    const err = new Error(
      `"${roleName}" cannot be held as an additional role — only Project Admin, Service PO Admin, Manager, HR, or Employee may be assigned as additional roles.`
    );
    err.response = { status: 400, data: { success: false, message: err.message } };
    throw err;
  }
};

// Preserved invariant (explicitly confirmed, not dropped, when roles moved off `users.role_id`
// onto a flat `employee_roles` table): an employee can hold at most one senior tier (rank <= 4 —
// Platform Admin/Admin/Entity Admin/BU Admin) at a time, plus any number of operational roles.
// The frontend's Roles multi-select may warn on selecting a second senior role, but this is the
// actual enforcement point (mirroring the real backend's planned server-side check).
export const assertAtMostOneSeniorRole = (roleIds) => {
  const seniorCount = roleIds
    .map(findRoleById)
    .filter(Boolean)
    .filter((r) => SENIOR_ROLE_NAMES.includes(r.role_name))
    .length;
  if (seniorCount > 1) {
    const err = new Error('An employee can hold at most one senior-tier role (Platform Admin, Admin, Entity Admin, or BU Admin) at a time.');
    err.response = { status: 422, data: { success: false, code: 'VALIDATION_ERROR', message: err.message, errors: [{ field: 'role_ids', message: err.message }] } };
    throw err;
  }
};

// Mimics the axios error shape (`err.response.data.message`/`.status`) so existing
// extractApiError()/extractFieldErrors() callers work unchanged against mock failures.
export const mockError = (status, message) => {
  const err = new Error(message);
  err.response = { status, data: { success: false, message } };
  return err;
};

// Generic in-memory list -> paginated envelope, shared by every mocked list endpoint (Roles,
// Employees, Entity Admins). `searchFields` are checked case-insensitively as substrings;
// `sortBy`/`sortOrder`("asc"/"desc"/"ASC"/"DESC") sort in place on a copy.
export const paginate = (list, { page = 1, limit = 10, search, searchFields = [], status, sortBy, sortOrder, filter } = {}) => {
  let rows = [...list];
  if (filter) rows = rows.filter(filter);
  if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((r) => searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
  }
  if (sortBy) {
    const dir = String(sortOrder ?? 'asc').toLowerCase() === 'desc' ? -1 : 1;
    rows.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : a[sortBy] < b[sortBy] ? -1 : 0) * dir);
  }
  const total = rows.length;
  const pageNum = Number(page) || 1;
  const perPage = Number(limit) || 10;
  const start = (pageNum - 1) * perPage;
  const data = rows.slice(start, start + perPage);
  return { data, meta: { page: pageNum, limit: perPage, current_page: pageNum, per_page: perPage, total } };
};

// Fixed default rather than a random string, per product decision — every employee added
// without an explicit password gets this same starter password instead of a one-off generated one.
export const generateTemporaryPassword = () => 'Gtt@1234';
