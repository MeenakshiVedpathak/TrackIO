import apiClient from '@/services/apiClient';

// Backs the Employee's "mapped projects" list used by the Timesheet Project dropdown
// (GET /employee-timesheets/projects) — distinct from the existing servicePOs.api.js
// allocate/deallocate resource-planning mechanism.
//
// Deliberately NO X-Company-Id special-casing anywhere here. Service PO employee mapping spans the
// caller's whole authorized Admin/company scope — every BU they manage — but the backend resolves
// that from the authenticated identity, and these endpoints neither require nor read the header.
// apiClient's interceptor attaches it globally and it is simply ignored, so stripping it would buy
// nothing and would break these calls against a backend that predates that fix (where the PO-side
// GET below still *required* the header for a multi-BU caller).
export const employeeServicePOMappingApi = {
  create: (employeeId, servicePOId) =>
    apiClient
      .post('/employee-servicepo-mapping', { employee_id: employeeId, service_po_id: servicePOId })
      .then((r) => r.data),
  delete: (id) => apiClient.delete(`/employee-servicepo-mapping/${id}`).then((r) => r.data),
  activate: (id) => apiClient.put(`/employee-servicepo-mapping/${id}/activate`).then((r) => r.data),
  deactivate: (id) => apiClient.put(`/employee-servicepo-mapping/${id}/deactivate`).then((r) => r.data),
  getByEmployee: (employeeId, status) =>
    apiClient
      .get(`/employee-servicepo-mapping/employee/${employeeId}`, { params: status ? { status } : {} })
      .then((r) => r.data?.data ?? []),
  // THE source of truth for a PO's already-mapped employees, and what the right panel renders.
  // Deliberately not GET /service-pos/:id's embedded `employees` — that field belongs to Resource
  // Allocation/staffing, a different feature, and is empty or wrong for this screen.
  getByServicePO: (servicePOId, status) =>
    apiClient
      .get(`/employee-servicepo-mapping/service-po/${servicePOId}`, { params: status ? { status } : {} })
      .then((r) => r.data?.data ?? []),

  // Service PO → Map Employees' left panel. One paginated, searchable call returning both the
  // employees eligible to be mapped to this PO and the ids already mapped, scoped server-side to
  // the caller's entire authorized Admin/company scope. Replaces the generic employee-list
  // endpoints this screen used to call, which scoped to the caller's own team or their selected BU
  // and so showed a fraction of the real list.
  //
  // `businessUnitId` is an explicit, opt-in narrowing filter (the panel's own Entity → BU
  // dropdowns) applied ON TOP of that full scope — not a substitute for it, and never sent
  // automatically from the caller's currently-selected BU.
  //
  // Returns the inner `data` object whole — `eligible_employees`, `mapped_employee_ids` and `meta`
  // are all needed, so this must not be unwrapped to an array.
  // 403 if the caller has no Service PO mapping authority; 404 for a PO id outside their scope.
  getServicePOOptions: (servicePOId, { search, page = 1, limit = 50, businessUnitId } = {}) =>
    apiClient
      .get(`/employee-servicepo-mapping/service-po/${servicePOId}/options`, {
        params: { page, limit, ...(search && { search }), ...(businessUnitId && { business_unit_id: businessUnitId }) },
      })
      .then((r) => r.data?.data),
  // Entity → Business Unit filter dropdowns above the left panel (EntityBuFilterBar). Deliberately
  // NOT GET /entities or GET /companies: both 403 a BU Admin/Service PO Admin/Delivery Head (Entity
  // Admin/Admin only), and GET /companies additionally ignores `entity_id` for a BU Admin and
  // returns only their own directly-mapped BUs — narrower than this screen's own "owning Admin's
  // full scope". This endpoint reuses that exact same scope, so the dropdowns can never offer an
  // Entity/BU the left panel itself wouldn't actually honour. Not scoped to one Service PO — the
  // caller's authorized scope is identical across every Service PO they can open this screen for.
  getMappingFilterOptions: () =>
    apiClient.get('/employee-servicepo-mapping/filter-options').then((r) => r.data?.data),
  // Employee Master's "Manage Service PO Mapping" action — backend pre-filters eligible POs by
  // the employee's BU (or returns the whole tenant + `unrestricted: true` for Service PO
  // Admin/Delivery Head), so the frontend just renders what comes back.
  getOptions: (employeeId) =>
    apiClient.get(`/employee-servicepo-mapping/employee/${employeeId}/options`).then((r) => r.data?.data),
  // Replaces the full mapped set in one call — always send every checked id, not a diff.
  saveMapping: (employeeId, servicePoIds) =>
    apiClient
      .put(`/employee-servicepo-mapping/employee/${employeeId}`, { service_po_ids: servicePoIds })
      .then((r) => r.data),
};
