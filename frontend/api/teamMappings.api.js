import apiClient from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, findEmployeeById, findRoleByName, getCurrentMockEmployee, mockError,
} from '@/mocks/rbacMockDb';

// Employee Identity Migration: the actor and every Manager/Service PO Admin referenced here are
// Employees now (no more separate `users` row) — `*_user_id` field names on the mapping rows are
// kept as-is (pre-existing, unrelated-to-this-migration contract) but now hold employee ids.
const requireActor = () => {
  const actor = getCurrentMockEmployee();
  if (!actor) throw mockError(401, 'Not authenticated.');
  return actor;
};

const serializeMapping = (m) => ({
  ...m,
  manager_email: findEmployeeById(m.manager_user_id)?.email ?? null,
});

const mockGetMyTeam = async () => {
  await delay();
  const actor = requireActor();
  return getDb().teamMappings
    .filter((m) => m.service_po_admin_user_id === actor.id && m.status === 'active')
    .map(serializeMapping);
};

const mockGetAvailableManagers = async () => {
  await delay();
  const actor = requireActor();
  const managerRole = findRoleByName('Manager');
  const actorBuIds = new Set(actor.business_unit_ids ?? []);
  const managers = getDb().employees.filter(
    (e) => (e.role_ids ?? []).includes(managerRole.id) && (e.business_unit_ids ?? []).some((id) => actorBuIds.has(id))
  );
  return managers.map((m) => {
    const owner = getDb().teamMappings.find((t) => t.manager_user_id === m.id && t.status === 'active');
    return {
      id: m.id,
      email: m.email,
      status: m.status,
      current_owner: owner
        ? { service_po_admin_user_id: owner.service_po_admin_user_id, email: findEmployeeById(owner.service_po_admin_user_id)?.email ?? null }
        : null,
    };
  });
};

const mockAddManager = async (managerUserId) => {
  await delay();
  const actor = requireActor();
  const existing = getDb().teamMappings.find((t) => t.manager_user_id === managerUserId && t.status === 'active');
  if (existing && existing.service_po_admin_user_id !== actor.id) {
    throw mockError(409, "This Manager already belongs to a different Service PO Admin's team.");
  }
  if (existing) throw mockError(409, 'This Manager is already on your team.');
  const mapping = {
    id: nextId('teamMappings'),
    company_id: actor.business_unit_ids?.[0] ?? null,
    service_po_admin_user_id: actor.id,
    manager_user_id: managerUserId,
    status: 'active',
  };
  getDb().teamMappings.push(mapping);
  persist();
  return { success: true, message: 'Manager added to your team successfully.', data: serializeMapping(mapping) };
};

const mockRemoveManager = async (managerUserId) => {
  await delay();
  const actor = requireActor();
  const mapping = getDb().teamMappings.find((t) => t.manager_user_id === managerUserId && t.service_po_admin_user_id === actor.id);
  if (!mapping) throw mockError(404, 'This Manager is not on your team.');
  getDb().teamMappings = getDb().teamMappings.filter((t) => t.id !== mapping.id);
  persist();
  return { success: true, message: 'Manager removed from your team.' };
};

const mockGetServicePoGrants = async () => {
  await delay();
  const actor = requireActor();
  const myManagerIds = new Set(
    getDb().teamMappings.filter((t) => t.service_po_admin_user_id === actor.id && t.status === 'active').map((t) => t.manager_user_id)
  );
  return getDb().managerServicePoGrants
    .filter((g) => myManagerIds.has(g.manager_user_id) && g.status === 'active')
    .map((g) => ({ ...g, manager_email: findEmployeeById(g.manager_user_id)?.email ?? null }));
};

const mockGrantServicePo = async (managerUserId, servicePOId) => {
  await delay();
  const actor = requireActor();
  const onMyTeam = getDb().teamMappings.some((t) => t.manager_user_id === managerUserId && t.service_po_admin_user_id === actor.id && t.status === 'active');
  if (!onMyTeam) throw mockError(403, 'This Manager is not on your team.');
  const existing = getDb().managerServicePoGrants.find((g) => g.manager_user_id === managerUserId && g.service_po_id === servicePOId && g.status === 'active');
  if (existing) throw mockError(409, 'This Service PO is already granted to this Manager.');
  const grant = {
    id: nextId('managerServicePoGrants'),
    company_id: actor.business_unit_ids?.[0] ?? null,
    manager_user_id: managerUserId,
    service_po_id: servicePOId,
    status: 'active',
  };
  getDb().managerServicePoGrants.push(grant);
  persist();
  return { success: true, message: 'Service PO granted to Manager.', data: grant };
};

const mockRevokeServicePo = async (managerUserId, servicePOId) => {
  await delay();
  const grant = getDb().managerServicePoGrants.find((g) => g.manager_user_id === managerUserId && g.service_po_id === servicePOId);
  if (!grant) throw mockError(404, 'Grant not found.');
  getDb().managerServicePoGrants = getDb().managerServicePoGrants.filter((g) => g.id !== grant.id);
  persist();
  return { success: true, message: 'Service PO grant revoked.' };
};

// Service PO Admin self-service (§7) — every call uses the caller's own identity.
export const teamMappingsApi = {
  getMyTeam: () => {
    if (RBAC_MOCK_ENABLED) return mockGetMyTeam();
    return apiClient.get('/team-mappings').then((r) => r.data?.data ?? []);
  },
  getAvailableManagers: () => {
    if (RBAC_MOCK_ENABLED) return mockGetAvailableManagers();
    return apiClient.get('/team-mappings/available-managers').then((r) => r.data?.data ?? []);
  },
  addManager: (managerUserId) => {
    if (RBAC_MOCK_ENABLED) return mockAddManager(managerUserId);
    return apiClient.post('/team-mappings/managers', { manager_user_id: managerUserId }).then((r) => r.data);
  },
  removeManager: (managerUserId) => {
    if (RBAC_MOCK_ENABLED) return mockRemoveManager(managerUserId);
    return apiClient.delete(`/team-mappings/managers/${managerUserId}`).then((r) => r.data);
  },
  getServicePoGrants: () => {
    if (RBAC_MOCK_ENABLED) return mockGetServicePoGrants();
    return apiClient.get('/team-mappings/service-po-grants').then((r) => r.data?.data ?? []);
  },
  grantServicePo: (managerUserId, servicePOId) => {
    if (RBAC_MOCK_ENABLED) return mockGrantServicePo(managerUserId, servicePOId);
    return apiClient.post(`/team-mappings/managers/${managerUserId}/service-pos`, { service_po_id: servicePOId }).then((r) => r.data);
  },
  revokeServicePo: (managerUserId, servicePOId) => {
    if (RBAC_MOCK_ENABLED) return mockRevokeServicePo(managerUserId, servicePOId);
    return apiClient.delete(`/team-mappings/managers/${managerUserId}/service-pos/${servicePOId}`).then((r) => r.data);
  },
};
