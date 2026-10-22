import apiClient from '@/services/apiClient';
import { scopeToParams } from '@/utils/scopeParams';

// BU filtering on GET /clients uses the `company_id` query param — NOT the X-Company-Id header.
// The backend scoping rules differ by role:
//   Admin / Entity Admin / Platform Admin:
//     no company_id → all clients (their own BU-less + every BU in their entity)
//     company_id=<id> → only that BU's clients
//   BU-scoped roles (BU Admin, BU Head, etc.):
//     no company_id → all their mapped BUs (backend resolves from token)
//     company_id=<id> → only that BU (must be one of their own)
//
// `buId` is extracted from the params object so it lands in the React Query key and triggers
// a refetch on change, but is forwarded as `company_id` in the query string rather than as
// a header. `buId === 'all'` or null/undefined → omitted entirely (no filter param).
//
// `skipCompanyHeader: true` is required here — without it, the request interceptor still
// attaches X-Company-Id from the globally-active BU (frozen to the login's first mapped BU
// since the navbar switcher that used to change it is commented out in UserMenu.jsx)
// regardless of what this screen's own BU filter says, and the backend was observed scoping
// by that stale header even with no company_id sent — so "All Business Units" silently
// narrowed to just the one frozen BU instead of every BU the caller can see. Same fix as
// timesheets.api.js's getHistory for the identical symptom.
export const clientsApi = {
  getAll: ({ buId, ...params } = {}) => {
    const companyIdParam = buId && buId !== 'all' ? { company_id: buId } : {};
    return apiClient
      .get('/clients', { params: { ...params, ...companyIdParam }, skipCompanyHeader: true })
      .then((r) => r.data);
  },
  // Same header-scoping pitfall as getAll above: without skipCompanyHeader, the interceptor
  // attaches X-Company-Id from the globally-active BU regardless of the caller, silently narrowing
  // a multi-BU login's clients to just that one BU (e.g. Service PO/Project create's Client
  // dropdown, which must span every BU that login is mapped to).
  // scope: optional { entityIds, businessUnitIds } (arrays) — narrows options to the selected Entity/BU.
  getActiveList: (scope) =>
    apiClient
      .get('/clients/active/list', { skipCompanyHeader: true, params: scopeToParams(scope) })
      .then((r) => r.data?.data ?? []),
  getById: (id) => apiClient.get(`/clients/${id}`).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/clients', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/clients/${id}`, payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/clients/${id}`, { data: { is_delete: true } }).then((r) => r.data),
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/clients/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};
