import apiClient from '@/services/apiClient';

// Company Management — Entity Admin only (Entity Admin tier). Unlike every other resource in
// api/, these calls never carry an X-Company-Id header (apiClient's interceptor only attaches
// one when the logged-in user has a company, and an Entity Admin never does — they own Entities,
// not a single company). Create now requires entity_id; GET is scoped server-side to Companies
// under the caller's own Entities.
export const companiesApi = {
  getAll: (params) => apiClient.get('/companies', { params }).then((r) => r.data),
  getById: (id) => apiClient.get(`/companies/${id}`).then((r) => r.data?.data),
  // Creates the BU shell only: { entity_id, company_code, company_name }. No BU Admin/Employee
  // bundling here — a BU Admin is not created as part of BU creation.
  create: (payload) => apiClient.post('/companies', payload).then((r) => r.data),
  // Only company_name/status are accepted here — company_code is create-only per the backend
  // contract.
  update: (id, payload) => apiClient.patch(`/companies/${id}`, payload).then((r) => r.data),
};
