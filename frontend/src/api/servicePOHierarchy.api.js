import apiClient from '@/services/apiClient';

// Hierarchy nodes are a lightweight, separate sub-resource under a Service PO (node_name +
// display_order only) — completely independent of Service PO CRUD.
//   GET    /service-pos/:servicePoId/hierarchy                 -> full tree
//   POST   /service-pos/:servicePoId/hierarchy/parent           -> create a Parent
//   POST   /service-pos/:servicePoId/hierarchy/:parentId/child  -> create a Child under a Parent
//   PUT    /service-pos/hierarchy/:hierarchyId                  -> rename/reorder (flat path, no servicePoId)
//   DELETE /service-pos/hierarchy/:hierarchyId                  -> delete; Parent cascades to Children
//
// Node ids (id / service_po_id / parent_hierarchy_id) come back as strings (BIGINT precision) —
// never coerce them to Number, just pass them through as-is.
export const servicePOHierarchyApi = {
  getTree: (servicePOId) =>
    apiClient.get(`/service-pos/${servicePOId}/hierarchy`).then((r) => r.data?.data ?? r.data ?? []),

  createParent: (servicePOId, { name, displayOrder }) =>
    apiClient
      .post(`/service-pos/${servicePOId}/hierarchy/parent`, {
        node_name: name,
        ...(displayOrder != null && { display_order: displayOrder }),
      })
      .then((r) => r.data?.data ?? r.data),

  createChild: (servicePOId, parentHierarchyId, { name, displayOrder }) =>
    apiClient
      .post(`/service-pos/${servicePOId}/hierarchy/${parentHierarchyId}/child`, {
        node_name: name,
        ...(displayOrder != null && { display_order: displayOrder }),
      })
      .then((r) => r.data?.data ?? r.data),

  renameNode: (hierarchyId, { name, displayOrder }) =>
    apiClient
      .put(`/service-pos/hierarchy/${hierarchyId}`, {
        ...(name != null && { node_name: name }),
        ...(displayOrder != null && { display_order: displayOrder }),
      })
      .then((r) => r.data?.data ?? r.data),

  deleteNode: (hierarchyId) =>
    apiClient.delete(`/service-pos/hierarchy/${hierarchyId}`).then((r) => r.data),
};
