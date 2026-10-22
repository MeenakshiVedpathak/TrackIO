import apiClient from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, findEmployeeById, findRoleByName, getCurrentMockEmployee, mockError,
} from '@/mocks/rbacMockDb';
import { ROLE_NAMES } from '@/constants/roleHierarchy';

// Employee Identity Migration: the actor and every Team Lead/Service PO Admin referenced here are
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

const mockGetAvailableTeamLeads = async () => {
  await delay();
  const actor = requireActor();
  const teamLeadRole = findRoleByName(ROLE_NAMES.TEAM_LEAD);
  const actorBuIds = new Set(actor.business_unit_ids ?? []);
  const teamLeads = getDb().employees.filter(
    (e) => (e.role_ids ?? []).includes(teamLeadRole.id) && (e.business_unit_ids ?? []).some((id) => actorBuIds.has(id))
  );
  return teamLeads.map((m) => {
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

const mockAddTeamLead = async (teamLeadUserId) => {
  await delay();
  const actor = requireActor();
  const existing = getDb().teamMappings.find((t) => t.manager_user_id === teamLeadUserId && t.status === 'active');
  if (existing && existing.service_po_admin_user_id !== actor.id) {
    throw mockError(409, "This Team Lead already belongs to a different Project Manager's team.");
  }
  if (existing) throw mockError(409, 'This Team Lead is already on your team.');
  const mapping = {
    id: nextId('teamMappings'),
    company_id: actor.business_unit_ids?.[0] ?? null,
    service_po_admin_user_id: actor.id,
    manager_user_id: teamLeadUserId,
    status: 'active',
  };
  getDb().teamMappings.push(mapping);
  persist();
  return { success: true, message: 'Team Lead added to your team successfully.', data: serializeMapping(mapping) };
};

const mockRemoveTeamLead = async (teamLeadUserId) => {
  await delay();
  const actor = requireActor();
  const mapping = getDb().teamMappings.find((t) => t.manager_user_id === teamLeadUserId && t.service_po_admin_user_id === actor.id);
  if (!mapping) throw mockError(404, 'This Team Lead is not on your team.');
  getDb().teamMappings = getDb().teamMappings.filter((t) => t.id !== mapping.id);
  persist();
  return { success: true, message: 'Team Lead removed from your team.' };
};

const mockGetServicePoGrants = async () => {
  await delay();
  const actor = requireActor();
  const myTeamLeadIds = new Set(
    getDb().teamMappings.filter((t) => t.service_po_admin_user_id === actor.id && t.status === 'active').map((t) => t.manager_user_id)
  );
  return getDb().managerServicePoGrants
    .filter((g) => myTeamLeadIds.has(g.manager_user_id) && g.status === 'active')
    .map((g) => ({ ...g, manager_email: findEmployeeById(g.manager_user_id)?.email ?? null }));
};

const mockGrantServicePo = async (teamLeadUserId, servicePOId) => {
  await delay();
  const actor = requireActor();
  const onMyTeam = getDb().teamMappings.some((t) => t.manager_user_id === teamLeadUserId && t.service_po_admin_user_id === actor.id && t.status === 'active');
  if (!onMyTeam) throw mockError(403, 'This Team Lead is not on your team.');
  const existing = getDb().managerServicePoGrants.find((g) => g.manager_user_id === teamLeadUserId && g.service_po_id === servicePOId && g.status === 'active');
  if (existing) throw mockError(409, 'This Service PO is already granted to this Team Lead.');
  const grant = {
    id: nextId('managerServicePoGrants'),
    company_id: actor.business_unit_ids?.[0] ?? null,
    manager_user_id: teamLeadUserId,
    service_po_id: servicePOId,
    status: 'active',
  };
  getDb().managerServicePoGrants.push(grant);
  persist();
  return { success: true, message: 'Service PO granted to Team Lead.', data: grant };
};

const mockRevokeServicePo = async (teamLeadUserId, servicePOId) => {
  await delay();
  const grant = getDb().managerServicePoGrants.find((g) => g.manager_user_id === teamLeadUserId && g.service_po_id === servicePOId);
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
  getAvailableTeamLeads: () => {
    if (RBAC_MOCK_ENABLED) return mockGetAvailableTeamLeads();
    return apiClient.get('/team-mappings/available-managers').then((r) => r.data?.data ?? []);
  },
  addTeamLead: (teamLeadUserId) => {
    if (RBAC_MOCK_ENABLED) return mockAddTeamLead(teamLeadUserId);
    return apiClient.post('/team-mappings/managers', { manager_user_id: teamLeadUserId }).then((r) => r.data);
  },
  removeTeamLead: (teamLeadUserId) => {
    if (RBAC_MOCK_ENABLED) return mockRemoveTeamLead(teamLeadUserId);
    return apiClient.delete(`/team-mappings/managers/${teamLeadUserId}`).then((r) => r.data);
  },
  getServicePoGrants: () => {
    if (RBAC_MOCK_ENABLED) return mockGetServicePoGrants();
    return apiClient.get('/team-mappings/service-po-grants').then((r) => r.data?.data ?? []);
  },
  grantServicePo: (teamLeadUserId, servicePOId) => {
    if (RBAC_MOCK_ENABLED) return mockGrantServicePo(teamLeadUserId, servicePOId);
    return apiClient.post(`/team-mappings/managers/${teamLeadUserId}/service-pos`, { service_po_id: servicePOId }).then((r) => r.data);
  },
  revokeServicePo: (teamLeadUserId, servicePOId) => {
    if (RBAC_MOCK_ENABLED) return mockRevokeServicePo(teamLeadUserId, servicePOId);
    return apiClient.delete(`/team-mappings/managers/${teamLeadUserId}/service-pos/${servicePOId}`).then((r) => r.data);
  },
};
