// Pure data-shaping helpers for the Organization Overview screen (Platform Admin, one API call —
// see api/organizationOverview.api.js). Everything here derives from the single cached response;
// nothing in this file makes a network call. Field mapping matches the confirmed backend contract
// for GET /platform-admin/organization-overview exactly (no field-name guessing).

// Platform Admin / Admin / Entity Admin accounts (and, in principle, any BU-less record) carry a
// null `bu`/`entity` — the contract calls this out explicitly rather than treating it as missing
// data, so it gets its own label instead of "Unassigned".
const PLATFORM_WIDE = 'Platform-wide';

export const normalizeBusinessUnit = (bu) => ({
  id: bu.id,
  name: bu.name ?? 'Unnamed BU',
  entityId: bu.entity_id ?? null,
  entityName: bu.entity_name ?? PLATFORM_WIDE,
  status: bu.status ?? 'active',
  createdAt: bu.created_at ?? null,
});

const normalizeHierarchyNode = (h) => ({
  id: h.id,
  name: h.name ?? 'Unnamed node',
  nodeType: h.node_type ?? null,
  parentId: h.parent_id ?? null,
});

// Generic parent_id -> children tree builder, shared by the Service PO hierarchy below and
// reusable anywhere else a flat parent_id-linked list needs nesting.
export const buildPOTree = (rows) => {
  const byParent = new Map();
  rows.forEach((row) => {
    const key = row.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  });
  const attach = (parentKey) => (byParent.get(parentKey) ?? []).map((row) => ({ ...row, children: attach(row.id) }));
  return attach('root');
};

// Each Service PO's `hierarchy` is a flat array with its OWN root entry (level 1, node_type
// ROOT) restating the PO itself — that root is already represented by the table row this data
// feeds, so only its descendants (PARENT/CHILD) are kept here.
const buildHierarchyChildren = (hierarchy) => {
  const tree = buildPOTree((hierarchy ?? []).map(normalizeHierarchyNode));
  return tree[0]?.children ?? [];
};

const normalizeServicePO = (spo, project) => ({
  id: spo.id,
  poCode: spo.code ?? '—',
  servicePOName: spo.name ?? 'Unnamed PO',
  status: spo.status ?? 'active',
  clientId: spo.client_id ?? null,
  // A Service PO's own bu/client/entity can legitimately differ from its parent project's (the
  // backend contract calls this out) — always read the PO's own fields here, never fall back to
  // the project's.
  clientName: spo.client_name ?? '—',
  buId: spo.bu?.id ?? null,
  buName: spo.bu?.name ?? PLATFORM_WIDE,
  entityId: spo.entity?.id ?? null,
  entityName: spo.entity?.name ?? PLATFORM_WIDE,
  projectId: project.id,
  projectName: project.name,
  children: buildHierarchyChildren(spo.hierarchy),
});

export const normalizeProject = (project) => {
  const base = {
    id: project.project_id,
    code: project.project_code ?? '—',
    name: project.project_name ?? 'Unnamed Project',
    status: project.status ?? 'active',
    clientId: project.client_id ?? null,
    clientName: project.client_name ?? '—',
    buId: project.bu?.id ?? null,
    buName: project.bu?.name ?? PLATFORM_WIDE,
    entityId: project.entity?.id ?? null,
    entityName: project.entity?.name ?? PLATFORM_WIDE,
  };
  return { ...base, servicePOs: (project.service_pos ?? []).map((spo) => normalizeServicePO(spo, base)) };
};

export const normalizeUser = (u) => ({
  id: u.user_id,
  name: u.name ?? 'Unnamed User',
  email: u.email ?? '—',
  employeeId: u.employee_id ?? '—',
  // Always an array — a user can hold more than one role (the contract is explicit that this is
  // never a single role_id).
  roles: (u.roles ?? []).map((r) => r?.name).filter(Boolean),
  buId: u.bu?.id ?? null,
  buName: u.bu?.name ?? PLATFORM_WIDE,
  entityId: u.entity?.id ?? null,
  entityName: u.entity?.name ?? PLATFORM_WIDE,
  status: u.status ?? 'active',
});

const ensureBu = (entity, buKey, seed) => {
  if (!entity.businessUnits.has(buKey)) {
    entity.businessUnits.set(buKey, { ...seed, projects: [], users: [] });
  }
  return entity.businessUnits.get(buKey);
};

const ensureEntity = (entityMap, entityKey, name) => {
  if (!entityMap.has(entityKey)) {
    entityMap.set(entityKey, { id: entityKey, name, businessUnits: new Map() });
  }
  return entityMap.get(entityKey);
};

// Primary hierarchy for Tab 1 (Overview): Entity -> BU -> Projects (with Client + Service PO
// tree, already nested per-project) and BU -> Users, all derived from the three top-level arrays
// in the one API response. `projects` here are already-normalized (normalizeProject), so their
// Service PO hierarchy is already built — this just buckets them under the right Entity/BU.
export const buildOrganizationTree = (businessUnits, projects, users) => {
  const entityMap = new Map();

  businessUnits.forEach((bu) => {
    const entityKey = bu.entityId ?? bu.entityName;
    const entity = ensureEntity(entityMap, entityKey, bu.entityName);
    ensureBu(entity, bu.id ?? bu.name, bu);
  });

  projects.forEach((project) => {
    const entityKey = project.entityId ?? project.entityName;
    const entity = ensureEntity(entityMap, entityKey, project.entityName);
    const bu = ensureBu(entity, project.buId ?? project.buName, {
      id: project.buId, name: project.buName, entityId: project.entityId, entityName: project.entityName, status: 'active',
    });
    bu.projects.push(project);
  });

  users.forEach((user) => {
    const entityKey = user.entityId ?? user.entityName;
    const entity = ensureEntity(entityMap, entityKey, user.entityName);
    const bu = ensureBu(entity, user.buId ?? user.buName, {
      id: user.buId, name: user.buName, entityId: user.entityId, entityName: user.entityName, status: 'active',
    });
    bu.users.push(user);
  });

  return Array.from(entityMap.values()).map((entity) => ({
    ...entity,
    businessUnits: Array.from(entity.businessUnits.values()),
  }));
};

export const computeSummaryCounts = (businessUnits, projects, users) => {
  const entityIds = new Set(businessUnits.map((bu) => bu.entityId ?? bu.entityName));
  const buIds = new Set(businessUnits.map((bu) => bu.id ?? bu.name));
  const projectIds = new Set(projects.map((p) => p.id ?? p.name));
  const servicePOCount = projects.reduce((sum, p) => sum + p.servicePOs.length, 0);
  return {
    totalEntities: entityIds.size,
    totalBUs: buIds.size,
    totalProjects: projectIds.size,
    totalServicePOs: servicePOCount,
    totalUsers: users.length,
  };
};

export const includesTerm = (value, term) => String(value ?? '').toLowerCase().includes(term);

export const matchesBusinessUnit = (bu, term) =>
  includesTerm(bu.name, term) || includesTerm(bu.entityName, term);

// Matches a Service PO root OR any of its nested Parent/Child hierarchy nodes, so searching for a
// module/task name still surfaces (and keeps expanded) the PO it belongs to.
export const matchesServicePONode = (node, term) => {
  const own =
    includesTerm(node.projectName, term) || includesTerm(node.clientName, term) ||
    includesTerm(node.servicePOName, term) || includesTerm(node.poCode, term) ||
    includesTerm(node.buName, term) || includesTerm(node.entityName, term) ||
    includesTerm(node.name, term);
  if (own) return true;
  return (node.children ?? []).some((child) => matchesServicePONode(child, term));
};

export const matchesUser = (user, term) =>
  includesTerm(user.name, term) || includesTerm(user.email, term) || includesTerm(user.employeeId, term) ||
  includesTerm(user.buName, term) || includesTerm(user.entityName, term) ||
  user.roles.some((role) => includesTerm(role, term));

// Prunes the Overview tree (Tab 1) down to branches touched by the search term — a matching
// Entity/BU name keeps its whole subtree; otherwise only the individual Projects/Users under it
// that themselves match are kept, so the tree stays useful instead of listing everything.
export const filterOrganizationTree = (tree, term) => {
  if (!term) return tree;
  const t = term.toLowerCase();
  return tree
    .map((entity) => {
      const entityMatches = includesTerm(entity.name, t);
      const businessUnits = entity.businessUnits
        .map((bu) => {
          const buMatches = includesTerm(bu.name, t);
          if (entityMatches || buMatches) return bu;
          const projects = bu.projects.filter(
            (p) => includesTerm(p.name, t) || includesTerm(p.clientName, t) ||
              p.servicePOs.some((po) => matchesServicePONode(po, t))
          );
          const users = bu.users.filter((u) => matchesUser(u, t));
          return projects.length || users.length ? { ...bu, projects, users } : null;
        })
        .filter(Boolean);
      return entityMatches || businessUnits.length ? { ...entity, businessUnits } : null;
    })
    .filter(Boolean);
};
