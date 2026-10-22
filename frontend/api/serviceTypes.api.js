import apiClient, { explicitBuScope } from '@/services/apiClient';

// `buId` is a pseudo-param on the list call: the Master screen's own Business Unit filter (see
// hooks/useMasterBuFilter) puts it in the params object like any other filter so it lands in the
// React Query key, and it is pulled out here and turned into the request's BU scope instead of a
// query-string field — the backend scopes these lists by the X-Company-Id header. Absent (a
// single-BU login, or any other caller of this api) => the global navbar BU applies exactly as
// before; 'all' => no header, so the caller sees every BU their role can reach.
export const serviceTypesApi = {
  getAll: ({ buId, ...params } = {}) =>
    apiClient.get('/service-types', { params, ...explicitBuScope(buId) }).then((r) => r.data),
  getById: (id) => apiClient.get(`/service-types/${id}`).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/service-types', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/service-types/${id}`, payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/service-types/${id}`, { data: { is_delete: true } }).then((r) => r.data),
};
