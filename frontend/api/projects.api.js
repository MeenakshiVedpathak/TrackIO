import apiClient, { explicitBuScope } from '@/services/apiClient';
 
// `buId` is a pseudo-param on the list call: the Master screen's own Business Unit filter (see
// hooks/useMasterBuFilter) puts it in the params object like any other filter so it lands in the
// React Query key, and it is pulled out here and turned into the request's BU scope instead of a
// query-string field — the backend scopes these lists by the X-Company-Id header. Absent (a
// single-BU login, or any other caller of this api) => the global navbar BU applies exactly as
// before; 'all' => no header, so the caller sees every BU their role can reach.
export const projectsApi = {
  getAll: ({ buId, ...params } = {}) =>
    apiClient.get('/projects', { params, ...explicitBuScope(buId) }).then((r) => r.data),
  getActiveList: () => apiClient.get('/projects/active/list').then((r) => r.data?.data ?? []),
  getById: (id) => apiClient.get(`/projects/${id}`).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/projects', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/projects/${id}`, payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/projects/${id}`).then((r) => r.data),
  // Each row carries its own Client (Code or Name) — the backend resolves that row's Business
  // Unit off the actor/Client exactly like a single create does, so no company_id is sent here.
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/projects/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};