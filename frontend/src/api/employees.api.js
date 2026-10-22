import apiClient, { explicitBuScope } from '@/services/apiClient';
import { scopeToParams } from '@/utils/scopeParams';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, paginate, findEmployeeById, findRoleById, findRoleByName,
  getCurrentMockEmployee, assertCanAssignRole, assertValidAdditionalRole, assertAtMostOneSeniorRole,
  mockError, serializeEmployeeFull, businessUnitsForLoginResponse,
} from '@/mocks/rbacMockDb';
import { ROLE_NAMES, SENIOR_ROLE_NAMES } from '@/constants/roleHierarchy';

// Employee Identity Migration: login moved from a separate `users` table directly onto Employee
// Master. `role_ids`/`business_unit_ids`/`password` now live directly on the employee record —
// there is no more secondary /users call to orchestrate (the old two-call create/update dance,
// and the enrichWithRealRole cross-reference against GET /users, are both gone). ⚠️ The real
// backend's controller code for this contract hasn't been written yet (DB schema only, validated
// in an isolated test DB) — field names below (snake_case, matching this app's existing
// convention) and the exact GET /employees role-filter behavior are the agreed target, not a
// confirmed live contract. Confirm against the real Swagger/controller once implemented.

// Real GET /employees supports `business_unit_id` but not `role_id` filtering — this bounds
// how many employees the Role filter/column can consider: enough for a typical
// company, but a match past this bound silently won't be found. Same bound this app already
// accepted for the equivalent pre-migration workaround. Matches the backend's own page-size cap
// (see EmployeeList.jsx's EXPORT_PAGE_LIMIT) so this scan uses the full page it's allowed, not an
// arbitrarily smaller slice of it.
const REAL_ROLE_FILTER_SCAN_LIMIT = 200;

// Fields the Employee List's search box is expected to match. GET /employees' own `search` covers
// the name and the employee code but NOT the email, so an email search comes back empty from the
// backend — hence the fallback scan below, which resolves the same predicate client-side.
const SEARCH_MATCH_FIELDS = ['full_name', 'employee_code', 'email'];

const matchesSearch = (employee, query) =>
  SEARCH_MATCH_FIELDS.some((f) => String(employee?.[f] ?? '').toLowerCase().includes(query));

// Slice a locally-resolved match set into the page the caller asked for, in the same envelope
// shape the real endpoint returns, so callers can't tell a scanned page from a server-paged one.
const pageOfMatches = (matches, { page, limit }, message) => {
  const pageNum = Number(page) || 1;
  const perPage = Number(limit) || 10;
  const start = (pageNum - 1) * perPage;
  const total = matches.length;
  return {
    success: true,
    message: message ?? 'OK',
    data: matches.slice(start, start + perPage),
    meta: {
      total,
      page: pageNum,
      limit: perPage,
      totalPages: Math.ceil(total / perPage) || 0,
      hasNext: pageNum * perPage < total,
      hasPrev: pageNum > 1,
    },
  };
};

const resolveRoles = (roleIds, actorRoleObjects) => {
  const roles = (roleIds ?? []).map((rid) => findRoleById(Number(rid))).filter(Boolean);
  if (!roles.length) throw mockError(422, 'Select at least one role.');
  assertAtMostOneSeniorRole(roleIds);

  const seniorRole = roles.find((r) => SENIOR_ROLE_NAMES.includes(r.role_name));
  const actorSeniorRoleName = (actorRoleObjects ?? []).map((r) => r.role_name).find((n) => SENIOR_ROLE_NAMES.includes(n));

  roles.forEach((r) => {
    if (r.role_name === ROLE_NAMES.EMPLOYEE) return; // always allowed, per the standing HR bypass
    if (r === seniorRole) {
      if (actorSeniorRoleName) assertCanAssignRole(actorSeniorRoleName, r.role_name);
    } else {
      assertValidAdditionalRole(r.role_name);
    }
  });

  return roles;
};

const mockGetAll = async (params) => {
  await delay();
  const result = paginate(getDb().employees, {
    ...params,
    searchFields: ['full_name', 'employee_code', 'email'],
    filter: (e) => {
      if (params?.role_id) {
        const targetId = Number(params.role_id);
        if (!(e.role_ids ?? []).includes(targetId)) return false;
      }
      const buParam = params?.business_unit_id ?? params?.company_id;
      if (buParam && buParam !== 'all') {
        const targetBuId = Number(buParam);
        if (!(e.business_unit_ids ?? []).includes(targetBuId)) return false;
      }
      return true;
    },
  });
  return { success: true, message: 'OK', data: result.data.map(serializeEmployeeFull), meta: result.meta };
};

const mockGetActiveList = async () => {
  await delay();
  return getDb().employees.filter((e) => e.status === 'active').map(serializeEmployeeFull);
};

const mockGetById = async (id) => {
  await delay();
  return serializeEmployeeFull(findEmployeeById(Number(id)));
};

const mockCreate = async (payload) => {
  await delay();
  const db = getDb();
  if (!payload.email) throw mockError(422, 'Email is required.');
  if (!payload.password) throw mockError(422, 'Password is required.');
  if (db.employees.some((e) => e.email.toLowerCase() === payload.email.toLowerCase())) {
    throw mockError(409, 'An employee with this email already exists.');
  }

  const actor = getCurrentMockEmployee();
  const actorRoleObjects = (actor?.role_ids ?? []).map(findRoleById).filter(Boolean);
  const roleIds = payload.role_ids?.length ? payload.role_ids : [findRoleByName(ROLE_NAMES.EMPLOYEE).id];
  resolveRoles(roleIds, actorRoleObjects);

  const employee = {
    id: nextId('employees'),
    employee_code: payload.employee_code,
    full_name: payload.full_name,
    email: payload.email,
    password: payload.password,
    designation: payload.designation ?? null,
    total_experience: payload.total_experience ?? null,
    company_experience: payload.company_experience ?? null,
    resource_description: payload.resource_description ?? '',
    payroll_entity: payload.payroll_entity ?? null,
    location: payload.location ?? null,
    sub_location: payload.sub_location ?? null,
    original_entity: payload.original_entity ?? null,
    date_of_joining: payload.date_of_joining,
    date_of_leaving: payload.date_of_leaving ?? null,
    status: payload.status ?? 'active',
    role_ids: roleIds.map(Number),
    // Business Units are no longer picked on the create form itself — they start empty and are
    // assigned afterwards via Employee List's "Map Roles & Business Units" table action.
    business_unit_ids: (payload.business_unit_ids ?? []).map(Number),
    primary_manager_employee_id: payload.primary_manager_employee_id ? Number(payload.primary_manager_employee_id) : null,
    secondary_manager_employee_id: payload.secondary_manager_employee_id ? Number(payload.secondary_manager_employee_id) : null,
    is_timesheet_approval_required: payload.is_timesheet_approval_required ?? true,
  };
  db.employees.push(employee);
  persist();

  return { success: true, message: 'Employee created successfully.', data: serializeEmployeeFull(employee) };
};

const mockUpdate = async (id, payload) => {
  await delay();
  const employee = findEmployeeById(Number(id));
  if (!employee) throw mockError(404, 'Employee not found.');

  const { role_ids, business_unit_ids, email, primary_manager_employee_id, secondary_manager_employee_id, ...next } = { ...payload };

  if (email) {
    const emailTaken = getDb().employees.some(
      (e) => e.id !== employee.id && e.email.toLowerCase() === email.toLowerCase()
    );
    if (emailTaken) throw mockError(409, 'An employee with this email already exists.');
    employee.email = email;
  }

  if (role_ids != null) {
    const actor = getCurrentMockEmployee();
    const actorRoleObjects = (actor?.role_ids ?? []).map(findRoleById).filter(Boolean);
    resolveRoles(role_ids, actorRoleObjects);
    employee.role_ids = role_ids.map(Number);
  }

  if (business_unit_ids != null) {
    if (!Array.isArray(business_unit_ids) || business_unit_ids.length === 0) {
      throw mockError(422, 'Select at least one business unit.');
    }
    employee.business_unit_ids = business_unit_ids.map(Number);
  }

  if ('primary_manager_employee_id' in payload) {
    employee.primary_manager_employee_id = primary_manager_employee_id != null ? Number(primary_manager_employee_id) : null;
  }
  if ('secondary_manager_employee_id' in payload) {
    employee.secondary_manager_employee_id = secondary_manager_employee_id != null ? Number(secondary_manager_employee_id) : null;
  }

  Object.assign(employee, next);
  persist();
  return { success: true, message: 'Employee updated successfully.', data: serializeEmployeeFull(employee) };
};

const mockDelete = async (id) => {
  await delay();
  const employee = findEmployeeById(Number(id));
  if (!employee) throw mockError(404, 'Employee not found.');
  employee.status = 'inactive';
  persist();
  return { success: true, message: 'Employee deleted successfully.' };
};

// Business Unit filtering is server-side now (GET /employees?business_unit_id=<id>), but role
// filtering still has no server-side equivalent — scan a bounded batch and resolve the role
// predicate client-side against the `roles` array the endpoint returns inline on each row. When a
// BU is selected too it goes on the batch request itself, so the scan starts from an already
// BU-filtered set and the two filters intersect (rather than the bound being spent on employees
// the chosen BU excludes anyway).
//
// The BU scope rides on X-Company-Id (explicitBuScope), the same mechanism every other master/
// report uses — NOT also as a `business_unit_id` query param, which this used to send in addition
// to the header. Sending both was never confirmed against the real controller and risked the
// backend's param validation rejecting the request outright whenever a role AND a BU were both
// selected, which read as "neither filter works" even though the BU-only path (below, no
// role_id) was fine.
const realGetAllFiltered = async ({ roleId, businessUnitId, entityIds, businessUnitIds }, employeeParams) => {
  const { status, search } = employeeParams;
  const scope = businessUnitId && businessUnitId !== 'all' ? explicitBuScope(businessUnitId) : explicitBuScope(null);
  const batchRes = await apiClient
    .get('/employees', {
      params: {
        page: 1, limit: REAL_ROLE_FILTER_SCAN_LIMIT, status, search,
        ...(entityIds && { entityIds }),
        ...(businessUnitIds && { businessUnitIds }),
      },
      ...scope,
    })
    .then((r) => r.data);
  const targetRoleId = roleId != null ? Number(roleId) : null;
  // Strict `===` previously missed matches whenever the backend serializes ids as strings —
  // coerce both sides so a real numeric id always matches regardless of wire type.
  const matches = (batchRes?.data ?? []).filter(
    (e) => targetRoleId == null || (e.roles ?? []).some((r) => Number(r.id) === targetRoleId)
  );

  return pageOfMatches(matches, employeeParams, batchRes?.message);
};

// Email search fallback. The backend's `search` matches name/code only, so searching an email (or
// any fragment of one — a domain, say) returns an empty page even when an employee plainly
// matches. When that happens, re-fetch one bounded, UNSEARCHED page and resolve the search
// locally across SEARCH_MATCH_FIELDS, which includes the email.
//
// Deliberately a fallback rather than the primary path: it only costs a second request on a
// search that already found nothing, it leaves the working name/code path entirely server-side,
// and it becomes dead weight (never triggered) the day GET /employees searches email itself.
// Same REAL_ROLE_FILTER_SCAN_LIMIT bound — and the same caveat — as the role filter above: past
// that many employees in scope, a match can fall outside the scanned page.
const realSearchFallback = async ({ roleId, businessUnitId, entityIds, businessUnitIds }, employeeParams) => {
  const { search, status, sortBy, sortOrder } = employeeParams;
  const scope = businessUnitId && businessUnitId !== 'all' ? explicitBuScope(businessUnitId) : explicitBuScope(null);
  const batchRes = await apiClient
    .get('/employees', {
      params: {
        page: 1, limit: REAL_ROLE_FILTER_SCAN_LIMIT, status, sortBy, sortOrder,
        ...(entityIds && { entityIds }),
        ...(businessUnitIds && { businessUnitIds }),
      },
      ...scope,
    })
    .then((r) => r.data);

  const query = String(search).toLowerCase();
  const targetRoleId = roleId != null ? Number(roleId) : null;
  const matches = (batchRes?.data ?? []).filter(
    (e) => matchesSearch(e, query)
      && (targetRoleId == null || (e.roles ?? []).some((r) => Number(r.id) === targetRoleId))
  );

  return pageOfMatches(matches, employeeParams, batchRes?.message);
};

export const employeesApi = {
  getAll: async (params) => {
    if (RBAC_MOCK_ENABLED) return mockGetAll(params);
    // entityIds/businessUnitIds are read out for the role-filter/search-fallback scans below
    // (which only ever pick `status`/`search`/etc. off employeeParams by name, silently dropping
    // anything not on that list) but also kept in employeeParams itself (note: no `...rest`
    // shorthand here — they're destructured by name AND left in place) so the plain
    // non-role-filter path a few lines down still passes them straight through via its
    // `...employeeParams` spread, same convention every other Master api.js already uses.
    const { role_id, business_unit_id, company_id, ...employeeParams } = params ?? {};
    const { entityIds, businessUnitIds } = employeeParams;
    const buId = business_unit_id ?? company_id;
    if (role_id) {
      const filtered = await realGetAllFiltered({ roleId: role_id, businessUnitId: buId, entityIds, businessUnitIds }, employeeParams);
      // Its scan seeds itself from a server-side `search`, so an email search starves it the same
      // way it starves the unfiltered list — fall back to the local match, role predicate intact.
      if (employeeParams.search && !(filtered?.data ?? []).length) {
        return realSearchFallback({ roleId: role_id, businessUnitId: buId, entityIds, businessUnitIds }, employeeParams);
      }
      return filtered;
    }
    // explicitBuScope(null) suppresses X-Company-Id for cross-BU logins (Admin/Entity Admin/
    // Platform Admin) so that "All Business Units" truly returns all employees, not just those
    // scoped to whatever BU the navbar's global switcher happens to have active.
    // explicitBuScope(undefined) would leave the interceptor's global header in place — that's
    // the wrong behaviour when the caller explicitly asked for the unscoped list.
    // GET /employees does NOT actually scope by the X-Company-Id header alone — confirmed live:
    // picking a Business Unit in the filter left the list unfiltered. The header is still sent
    // (harmless, and every other master's convention), but `business_unit_id` also has to ride
    // along as a real query-string field for the real controller to apply it — the same
    // combination this endpoint used to send before an earlier cleanup dropped the query param on
    // the (unconfirmed) assumption the header alone would do. Left off the role_id branch below,
    // since that combination was the one that previously risked a 400.
    const scope = buId && buId !== 'all' ? explicitBuScope(buId) : explicitBuScope(null);
    const res = await apiClient
      .get('/employees', {
        params: { ...employeeParams, ...(buId && buId !== 'all' ? { business_unit_id: buId } : {}) },
        ...scope,
      })
      .then((r) => r.data);
    // Nothing matched server-side — the search may have been an email, which GET /employees
    // doesn't look at. Resolve it locally before reporting "no records found".
    if (employeeParams.search && !(res?.data ?? []).length) {
      return realSearchFallback({ roleId: null, businessUnitId: buId }, employeeParams);
    }
    return res;
  },

  getActiveList: (buId, reportScope) => {
    if (RBAC_MOCK_ENABLED) return mockGetActiveList(buId);
    // explicitBuScope(null) suppresses X-Company-Id for cross-BU logins, same as getAll above.
    const scope = buId && buId !== 'all' ? explicitBuScope(buId) : explicitBuScope(null);
    return apiClient
      .get('/employees/active/list', { ...scope, params: scopeToParams(reportScope) })
      .then((r) => r.data?.data ?? r.data ?? []);
  },

  // NOTE: Service PO → Map Employees does NOT source its employee list from here. The generic
  // employee endpoints scope to the caller's own team or their selected BU, which is the wrong
  // scope for PO mapping — see employeeServicePOMapping.api.js's getServicePOOptions.

  getById: async (id) => {
    if (RBAC_MOCK_ENABLED) return mockGetById(id);
    return apiClient.get(`/employees/${id}`).then((r) => r.data?.data);
  },

  // Role-Based Login: businessUnits no longer rides along on the login/refresh-token response —
  // fetched here instead, right after login/select-role completes, keyed off `employee.id` from
  // that response. Powers the BU switcher (UserMenu) the same way the old login-embedded array did.
  getBusinessUnits: async (employeeId) => {
    if (RBAC_MOCK_ENABLED) {
      await delay();
      return {
        success: true,
        message: 'Employee business units fetched successfully.',
        data: { employee_id: Number(employeeId), businessUnits: businessUnitsForLoginResponse(Number(employeeId)) },
      };
    }
    return apiClient.get(`/employees/${employeeId}/business-units`).then((r) => r.data);
  },

  // Powers the Employee List row action's "Map Roles & Business Units" dialog. GET /employees
  // (list) doesn't carry role/BU data, so the dialog can't seed its checkboxes from row data —
  // this dedicated endpoint reads the same employee_roles/employee_business_units tables the
  // existing detail GET and PUT already use, just scoped to one employee.
  getMappings: async (id) => {
    if (RBAC_MOCK_ENABLED) {
      await delay();
      const employee = findEmployeeById(Number(id));
      if (!employee) throw mockError(404, 'Employee not found.');
      return {
        employee_id: employee.id,
        role_ids: employee.role_ids ?? [],
        business_unit_ids: employee.business_unit_ids ?? [],
      };
    }
    return apiClient.get(`/employees/${id}/mappings`).then((r) => r.data?.data);
  },

  // Posts role_ids/business_unit_ids/password directly to /employees — no second call to
  // provision a login, since the employee IS the login now.
  create: (payload) => {
    if (RBAC_MOCK_ENABLED) return mockCreate(payload);
    return apiClient.post('/employees', payload).then((r) => r.data);
  },

  // Sending role_ids/business_unit_ids at all replaces the entire respective set — the backend
  // does the add/keep/remove reconciliation server-side against the full array sent, not a diff
  // the frontend computes (per the confirmed update semantics).
  update: (id, payload) => {
    if (RBAC_MOCK_ENABLED) return mockUpdate(id, payload);
    return apiClient.put(`/employees/${id}`, payload).then((r) => r.data);
  },

  delete: (id) => {
    if (RBAC_MOCK_ENABLED) return mockDelete(id);
    return apiClient.delete(`/employees/${id}`, { data: { is_delete: true } }).then((r) => r.data);
  },

  // ⚠️ Guessed contract, mirroring the retired PUT /users/:id/reset-password shape exactly,
  // just re-targeted at the employee directly (there's no more separate User id to look up) —
  // confirm once the real controller code lands.
  resetPassword: (id, newPassword, confirmPassword) => {
    if (RBAC_MOCK_ENABLED) {
      return (async () => {
        await delay();
        if (newPassword !== confirmPassword) throw mockError(422, 'Passwords do not match.');
        const employee = findEmployeeById(Number(id));
        if (!employee) throw mockError(404, 'Employee not found.');
        employee.password = newPassword;
        persist();
        return { success: true, message: 'Password reset successfully.' };
      })();
    }
    return apiClient.put(`/employees/${id}/reset-password`, { new_password: newPassword, confirm_password: confirmPassword }).then((r) => r.data);
  },

  // Service PO's Delivery Head dropdown — a real, freshly-shipped backend feature unrelated to
  // this migration, so this always hits the real backend regardless of RBAC_MOCK_ENABLED.
  getEligibleDeliveryHeads: () =>
    apiClient.get('/employees/eligible-delivery-heads').then((r) => r.data),

  // Add/Edit Employee's Primary/Secondary Team Lead dropdowns. GET /employees (list) deliberately
  // skips the role/BU join for pagination cost reasons, so eligibility can't be filtered
  // client-side off that response — this dedicated endpoint applies the same
  // manager.view_mapped_employees eligibility rule assertValidManager() enforces at save time,
  // server-side, in one query. Always hits the real backend regardless of RBAC_MOCK_ENABLED.
  getEligibleTeamLeads: () =>
    apiClient.get('/employees/eligible-managers').then((r) => r.data),

  // Unaffected by this migration — always hits the real backend.
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/employees/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }).then((r) => r.data);
  },
};
