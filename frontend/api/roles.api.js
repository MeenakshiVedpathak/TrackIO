import apiClient from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, paginate, findRoleById, serializeRole, formsForRoleNames, mockError,
} from '@/mocks/rbacMockDb';

const mockGetAll = async (params) => {
  await delay();
  const result = paginate(getDb().roles, { ...params, searchFields: ['role_name'] });
  return { success: true, message: 'OK', data: result.data.map(serializeRole), meta: result.meta };
};

const mockGetById = async (id) => {
  await delay();
  return serializeRole(findRoleById(Number(id)));
};

const mockCreate = async (payload) => {
  await delay();
  const role = {
    id: nextId('roles'),
    role_name: payload.role_name,
    permission: payload.permission,
    status: payload.status ?? 'active',
    hierarchy_rank: null,
    inherits_role_id: null,
    is_original_data_visible: !!payload.is_original_data_visible,
    is_system: false,
    created_at: new Date().toISOString(),
  };
  getDb().roles.push(role);
  persist();
  return { success: true, message: 'Role created successfully.', data: serializeRole(role) };
};

const mockUpdate = async (id, payload) => {
  await delay();
  const role = findRoleById(Number(id));
  if (!role) throw mockError(404, 'Role not found.');
  if (role.is_system) throw mockError(403, `"${role.role_name}" is a system role and cannot be modified.`);
  Object.assign(role, payload);
  persist();
  return { success: true, message: 'Role updated successfully.', data: serializeRole(role) };
};

const mockDelete = async (id) => {
  await delay();
  const role = findRoleById(Number(id));
  if (!role) throw mockError(404, 'Role not found.');
  if (role.is_system) throw mockError(403, `"${role.role_name}" is a system role and cannot be deleted.`);
  const inUse = getDb().employees.some((e) => (e.role_ids ?? []).includes(role.id));
  if (inUse) throw mockError(409, 'This role is still assigned to at least one employee.');
  getDb().roles = getDb().roles.filter((r) => r.id !== role.id);
  persist();
  return { success: true, message: 'Role deleted successfully.' };
};

const mockGetAccessibleForms = async (roleIds) => {
  await delay();
  const roleNames = (roleIds ?? []).map((id) => findRoleById(Number(id))?.role_name).filter(Boolean);
  return formsForRoleNames(roleNames);
};

export const rolesApi = {
  getAll: (params) => {
    if (RBAC_MOCK_ENABLED) return mockGetAll(params);
    return apiClient.get('/roles', { params }).then((r) => r.data);
  },
  getById: (id) => {
    if (RBAC_MOCK_ENABLED) return mockGetById(id);
    return apiClient.get(`/roles/${id}`).then((r) => r.data?.data);
  },
  create: (payload) => {
    if (RBAC_MOCK_ENABLED) return mockCreate(payload);
    return apiClient.post('/roles', payload).then((r) => r.data);
  },
  update: (id, payload) => {
    if (RBAC_MOCK_ENABLED) return mockUpdate(id, payload);
    return apiClient.put(`/roles/${id}`, payload).then((r) => r.data);
  },
  // Hard delete — no request body. Blocked (409) if the role is assigned to any user, and
  // (403) if it's one of the 9 fixed system roles.
  delete: (id) => {
    if (RBAC_MOCK_ENABLED) return mockDelete(id);
    return apiClient.delete(`/roles/${id}`).then((r) => r.data);
  },

  // RBAC: menu/navigation source of truth — always pass the roleIds from the logged-in
  // user's own stored roles, never a client-tampered list.
  getAccessibleForms: (roleIds) => {
    if (RBAC_MOCK_ENABLED) return mockGetAccessibleForms(roleIds);
    return apiClient.post('/roles/forms', { roleIds }).then((r) => {
      const raw = r.data?.data ?? {};
      return Object.fromEntries(
        Object.entries(raw)
          .map(([moduleName, forms]) => [
            moduleName,
            (forms ?? [])
              .filter((f) => f.status === true)
              .map(({ id, name }) => ({ id, name })),
          ])
          .filter(([, forms]) => forms.length > 0)
      );
    });
  },

  // Same endpoint, raw — used by the Role Form Mapping admin checklist, which needs the
  // status flag intact (to know which checkboxes start checked) rather than a pre-filtered
  // "only what's granted" list.
  getFormsChecklist: (roleIds) => {
    if (RBAC_MOCK_ENABLED) return mockGetAccessibleForms(roleIds);
    return apiClient.post('/roles/forms', { roleIds }).then((r) => r.data?.data ?? {});
  },

  // RBAC: Role <-> Form mapping
  getRoleFormMappings: (roleId) =>
    apiClient.get(`/roles/form-mappings/${roleId}`).then((r) => r.data?.data ?? []),
  // Bulk replace — give it every form_id that should be active for the role; the backend
  // activates those and soft-unmaps everything else in one transaction. Replaces the old
  // one-request-per-checkbox POST/DELETE pair entirely.
  replaceRoleFormMappings: (roleId, formIds) =>
    apiClient.put(`/roles/form-mappings/${roleId}`, { form_ids: formIds }).then((r) => r.data),
};
