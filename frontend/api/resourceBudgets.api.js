import apiClient from '@/services/apiClient';

export const resourceBudgetsApi = {
  // Only employees actually staffed/allocated to this Service PO — populates the hours-entry
  // grid before any budget rows exist for it.
  getMappedEmployees: (servicePoId) =>
    apiClient
      .get(`/resource-budgets/service-po/${servicePoId}/mapped-employees`)
      .then((r) => r.data?.data ?? []),

  getByServicePo: (servicePoId) =>
    apiClient.get(`/resource-budgets/service-po/${servicePoId}`).then((r) => r.data?.data ?? []),

  getAll: (params) => apiClient.get('/resource-budgets', { params }).then((r) => r.data?.data ?? []),

  create: (payload) => apiClient.post('/resource-budgets', payload).then((r) => r.data?.data),

  // Upsert across every employee on a PO for a month, in one transaction — the main screen flow.
  // All-or-nothing: a 400 lists every failing emp_id, nothing is saved.
  bulkSave: (payload) => apiClient.post('/resource-budgets/bulk', payload).then((r) => r.data?.data),

  // Only `hours` is accepted.
  update: (id, hours) => apiClient.put(`/resource-budgets/${id}`, { hours }).then((r) => r.data?.data),

  deactivate: (id) => apiClient.delete(`/resource-budgets/${id}`).then((r) => r.data),
};
