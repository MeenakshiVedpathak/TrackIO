import apiClient from '@/services/apiClient';

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
export const clientsApi = {
  getAll: ({ buId, ...params } = {}) => {
    const companyIdParam = buId && buId !== 'all' ? { company_id: buId } : {};
    return apiClient
      .get('/clients', { params: { ...params, ...companyIdParam } })
      .then((r) => r.data);
  },
  getActiveList: () => apiClient.get('/clients/active/list').then((r) => r.data?.data ?? []),
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
