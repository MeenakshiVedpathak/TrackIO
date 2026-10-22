import apiClient from '@/services/apiClient';

export const formsApi = {
  // Flat list of module + form rows (module rows have module_name: null), ordered by seq.
  getAll: (params) => apiClient.get('/forms', { params }).then((r) => r.data),
  // Module rows only (module_name: null), ordered by seq — source for the Module dropdown.
  getModules: (params) => apiClient.get('/forms/modules', { params }).then((r) => r.data?.data ?? []),
  getById: (id) => apiClient.get(`/forms/${id}`).then((r) => r.data?.data),
  // module_name: null (or omitted) creates a MODULE; a module name creates a FORM under it.
  // Never send seq — the server always computes the next slot.
  create: (payload) => apiClient.post('/forms', payload).then((r) => r.data),
  // Renaming a module cascades to its children server-side. Setting module_name on a form moves
  // it to a different module (appended at the end). A row can never switch between module/form.
  update: (id, payload) => apiClient.put(`/forms/${id}`, payload).then((r) => r.data),
  // Soft-deletes (deactivates). Deleting a module that still has forms under it returns 400.
  delete: (id) => apiClient.delete(`/forms/${id}`).then((r) => r.data),
  // Reorders modules only — items: [{ id, seq }].
  reorderModules: (items) => apiClient.patch('/forms/modules/reorder', { items }).then((r) => r.data),
  // Reorders forms within one module only — items: [{ id, seq }].
  reorderForms: (moduleName, items) =>
    apiClient.patch('/forms/reorder', { module_name: moduleName, items }).then((r) => r.data),
  // Full nested Module -> Category -> Form tree, pre-built server-side. No search/status params.
  getHierarchy: () => apiClient.get('/forms/hierarchy').then((r) => r.data?.data ?? []),
  // Category dropdown source, scoped by module_id — returns [] (not an error) if the module has none.
  getCategories: (params) => apiClient.get('/forms/categories', { params }).then((r) => r.data?.data ?? []),
  createCategory: (payload) => apiClient.post('/forms/categories', payload).then((r) => r.data),
  // module_id is immutable — never send it here; categories never change module.
  updateCategory: (id, payload) => apiClient.put(`/forms/categories/${id}`, payload).then((r) => r.data),
  // 400s if the category still has any forms assigned (active or inactive).
  deleteCategory: (id) => apiClient.delete(`/forms/categories/${id}`).then((r) => r.data),
  // Reorders categories within one module only — items: [{ id, seq }].
  reorderCategories: (moduleId, items) =>
    apiClient.patch('/forms/categories/reorder', { module_id: moduleId, items }).then((r) => r.data),
  // Dedicated move endpoint — only this changes a form's module/category, never PUT /forms/:id.
  // At least one of module_id/category_id is required; omitting category_id while changing
  // module_id resets category to null server-side, so callers should always send both together.
  moveForm: (id, payload) => apiClient.put(`/forms/${id}/move`, payload).then((r) => r.data),
};
