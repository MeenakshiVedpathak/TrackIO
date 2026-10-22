import apiClient, { crossBuScopeForAdmin, explicitBuScope } from '@/services/apiClient';

// For an Admin ONLY, Service PO Master is exempt from the global BU filter: the BU switcher must
// not narrow which Service POs they see, so every READ here drops X-Company-Id for that role and
// the backend scopes by role reach instead — Admin narrows to one BU explicitly via the list's own
// BU filter (?company_id). Every other role, BU Admin included, is unchanged and stays globally
// BU-scoped. Writes always keep the header: create/update resolve a new PO's company_id off the
// active BU (ServicePOForm.jsx:238), and close/delete/import are BU-scoped by design.
export const servicePOsApi = {
  // `buId` is the Master screen's own BU filter for a BU-mapped login with more than one BU (see
  // hooks/useMasterBuFilter) — pulled out of params and applied as the request's BU scope. It is
  // never set for an Admin: that role narrows by the ?company_id param above instead, and
  // explicitBuScope(undefined) leaves crossBuScopeForAdmin's cross-BU behaviour untouched.
  getAll: ({ buId, ...params } = {}) =>
    apiClient.get('/service-pos', { params, ...crossBuScopeForAdmin(), ...explicitBuScope(buId) }).then((r) => r.data),
  // `buId` narrows the picker to one BU for screens that ask the user to choose a BU before a
  // Service PO. Omitted (undefined) everywhere else, which leaves crossBuScopeForAdmin's
  // cross-BU behaviour for an Admin — and the global BU header for everyone else — untouched.
  getActiveList: (buId) =>
    apiClient
      .get('/service-pos/active/list', { ...crossBuScopeForAdmin(), ...explicitBuScope(buId) })
      .then((r) => r.data?.data ?? []),
  getById: (id) => apiClient.get(`/service-pos/${id}`, { ...crossBuScopeForAdmin() }).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/service-pos', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/service-pos/${id}`, payload).then((r) => r.data),
  close: (id) => apiClient.post(`/service-pos/${id}/close`).then((r) => r.data),
  allocate: (id, employeeIds) =>
    apiClient.post(`/service-pos/${id}/allocate`, { employee_ids: employeeIds }).then((r) => r.data),
  deallocate: (id, employeeId) =>
    apiClient.delete(`/service-pos/${id}/resources/${employeeId}`, { data: { is_delete: true } }).then((r) => r.data),
  delete: (id) => apiClient.delete(`/service-pos/${id}`).then((r) => r.data),
  getUtilisation: (id) => apiClient.get(`/service-pos/${id}/utilisation`, { ...crossBuScopeForAdmin() }).then((r) => r.data?.data),
  importFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post('/service-pos/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data?.data);
  },
};
