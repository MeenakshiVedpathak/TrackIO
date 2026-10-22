import apiClient from '@/services/apiClient';

// Entity Master — reachable by Admin (platform-wide) and Entity Admin (own Entities); backend
// scopes every call accordingly. No company header applies here since neither role belongs to
// a company.
export const entitiesApi = {
  getAll: (params) => apiClient.get('/entities', { params }).then((r) => r.data),
  getById: (id) => apiClient.get(`/entities/${id}`).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/entities', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/entities/${id}`, payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/entities/${id}`).then((r) => r.data),
};
