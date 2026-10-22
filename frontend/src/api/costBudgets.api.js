import apiClient from '@/services/apiClient';

export const costBudgetsApi = {
  // Both params optional — either alone works as a filter, and it's also the plain "everything"
  // list when neither is passed.
  getAll: (params) => apiClient.get('/cost-budgets', { params }).then((r) => r.data?.data ?? []),

  // Every month ever saved for this PO, active AND inactive (each row carries its own `status`)
  // — used to render a PO's full history and to keep the entry sheet from offering a month that
  // already has a record.
  getByServicePo: (servicePoId) =>
    apiClient.get(`/cost-budgets/service-po/${servicePoId}`).then((r) => r.data?.data ?? []),

  create: (payload) => apiClient.post('/cost-budgets', payload).then((r) => r.data?.data),

  // Only invoice_amount/description are accepted — service_po_id and month are fixed at creation.
  update: (id, payload) => apiClient.put(`/cost-budgets/${id}`, payload).then((r) => r.data?.data),

  // Soft delete (deactivate), 204 No Content.
  deactivate: (id) => apiClient.delete(`/cost-budgets/${id}`).then((r) => r.data),
};
