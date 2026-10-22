// The RBAC redesign's fixed 9-role hierarchy (spec §0). Assignable roles are exactly these —
// anything else (Super Admin, Head Manager, BU HR Head, Division Head, Management, Finance,
// Company Admin) no longer exists. ("Project Manager" was also on that legacy-name list, but it's
// since been reused below (2026-09) as the renamed SERVICE_PO_ADMIN value — coincidental
// name collision with the old removed role, not a resurrection of it.)
export const ROLE_NAMES = {
  PLATFORM_ADMIN: 'Platform Admin',
  ADMIN: 'Admin',
  ENTITY_ADMIN: 'Entity Admin',
  BU_ADMIN: 'BU Admin',
  // BU Head — additive, non-replacing peer of BU Admin (§1 of the BU Head spec): same
  // form/permission tier, but scoped to MULTIPLE companies via a mapping table instead of one
  // `company_id`. Never rename/remove BU Admin when touching this.
  BU_HEAD: 'BU Head',
  PROJECT_ADMIN: 'Project Admin',
  // Renamed via Role Master from "Service PO Admin/Delivery head" to "Project Manager" (2026-09) —
  // the `SERVICE_PO_ADMIN` key below is now just this constant's historical name, not its value.
  // Every place that needs this role (ADDITIONAL_ROLE_NAMES, ROLE_CREATION_MATRIX, the Employee
  // Master PO-mapping trigger, Team Mapping's route guard, UserMenu's role icon) reads it through
  // this one constant rather than a literal string, so this is the only line that had to change —
  // but the exact string here must always match GET /roles' current `role_name` verbatim, or every
  // one of those comparisons silently stops matching again (which is exactly what happened after
  // the rename, before this constant was updated to match).
  SERVICE_PO_ADMIN: 'Project Manager',
  TEAM_LEAD: 'Team Lead',
  EMPLOYEE: 'Employee',
  HR: 'HR',
};

export const ROLE_HIERARCHY = [
  { name: ROLE_NAMES.PLATFORM_ADMIN, hierarchy_rank: 1, inherits_role_id: null },
  { name: ROLE_NAMES.ADMIN, hierarchy_rank: 2, inherits_role_id: null },
  { name: ROLE_NAMES.ENTITY_ADMIN, hierarchy_rank: 3, inherits_role_id: null },
  { name: ROLE_NAMES.BU_ADMIN, hierarchy_rank: 4, inherits_role_id: null },
  // Peer tier with BU Admin (frontend-only ordering aid — neither the real backend nor the mock
  // has ever exposed a numeric hierarchy_rank for BU Admin either, so a tie here doesn't create
  // any new ambiguity).
  { name: ROLE_NAMES.BU_HEAD, hierarchy_rank: 4, inherits_role_id: null },
  { name: ROLE_NAMES.PROJECT_ADMIN, hierarchy_rank: 5, inherits_role_id: null },
  { name: ROLE_NAMES.SERVICE_PO_ADMIN, hierarchy_rank: 6, inherits_role_id: null },
  { name: ROLE_NAMES.TEAM_LEAD, hierarchy_rank: 7, inherits_role_id: null },
  { name: ROLE_NAMES.EMPLOYEE, hierarchy_rank: 8, inherits_role_id: null },
  // HR is a parallel branch, not part of the numeric chain.
  { name: ROLE_NAMES.HR, hierarchy_rank: null, inherits_role_id: null },
];

// Who can create whom (spec §0) — enforced authoritatively by the mock/backend; hardcoded here
// too since the spec explicitly says the matrix is fixed and safe to also use client-side for
// filtering the "assign role" dropdown.
export const ROLE_CREATION_MATRIX = {
  [ROLE_NAMES.PLATFORM_ADMIN]: [ROLE_NAMES.ADMIN],
  [ROLE_NAMES.ADMIN]: [ROLE_NAMES.ENTITY_ADMIN, ROLE_NAMES.BU_ADMIN],
  [ROLE_NAMES.ENTITY_ADMIN]: [ROLE_NAMES.BU_ADMIN],
  // BU Admin can now also assign Employee and HR (backend contract update) — previously only
  // Project Admin / Service PO Admin / Team Lead.
  [ROLE_NAMES.BU_ADMIN]: [
    ROLE_NAMES.PROJECT_ADMIN, ROLE_NAMES.SERVICE_PO_ADMIN, ROLE_NAMES.TEAM_LEAD,
    ROLE_NAMES.EMPLOYEE, ROLE_NAMES.HR,
  ],
  // BU Head gets the same assignable set as BU Admin (§14 of the BU Head spec: same forms/
  // permissions) so Employee Master's Roles picker works when a BU Head creates a regular
  // employee. Deliberately NOT added to Admin's/Entity Admin's own entries above — BU Head must
  // only ever be minted via the dedicated BU Head Master "Add BU Head" flow (§16/§19), never as
  // a checkbox in the generic Employee Master role picker.
  [ROLE_NAMES.BU_HEAD]: [
    ROLE_NAMES.PROJECT_ADMIN, ROLE_NAMES.SERVICE_PO_ADMIN, ROLE_NAMES.TEAM_LEAD,
    ROLE_NAMES.EMPLOYEE, ROLE_NAMES.HR,
  ],
  [ROLE_NAMES.PROJECT_ADMIN]: [ROLE_NAMES.SERVICE_PO_ADMIN],
  [ROLE_NAMES.SERVICE_PO_ADMIN]: [ROLE_NAMES.TEAM_LEAD],
  // HR creates Employee via the dedicated Employee-creation flow, not the generic Users screen.
  [ROLE_NAMES.HR]: [],
};

export const getAssignableRoleNames = (actorRoleName) => ROLE_CREATION_MATRIX[actorRoleName] ?? [];

// A custom role created after the RBAC redesign (via Role Master's "Add Role", not one of the
// 9 fixed system roles above) — layered on as an additional operational role the same way HR/
// Team Lead are, but meant to be strictly view-only. That's governed by its own `permission` field
// on the Role Master (see RoleForm.jsx), the same "Read" mechanism the baseline Employee role
// above already relies on — not anything hardcoded here.
// Renamed via Role Master from "Delivery Operation Team Members" to "Delivery Ops" (2026-10) —
// same precedent as SERVICE_PO_ADMIN above: every place that needs this role (just
// ADDITIONAL_ROLE_NAMES below) reads it through this one constant rather than a literal string,
// so this is the only line that had to change — but the value here must always match GET /roles'
// current `role_name` verbatim, or that comparison silently stops matching again.
export const DELIVERY_OPS_ROLE_NAME = 'Delivery Ops';

// Multi-role support: a user's primary role (drives hierarchy tier/scoping) can carry these
// additional operational roles on top, purely additive permissions. Senior tiers (Platform
// Admin, Admin, Entity Admin, BU Admin) can only ever be someone's one primary role — the
// backend 400s if one is sent as an additional role, so this list must stay in sync with it.
export const ADDITIONAL_ROLE_NAMES = [
  ROLE_NAMES.PROJECT_ADMIN, ROLE_NAMES.SERVICE_PO_ADMIN, ROLE_NAMES.TEAM_LEAD,
  ROLE_NAMES.HR, ROLE_NAMES.EMPLOYEE, DELIVERY_OPS_ROLE_NAME,
];

// The tiers that can only ever be a primary role, never additional — a user can hold at most
// one of these at a time (there's no "primary" concept exposed in the Users screen UI, but the
// backend's role_ids[0]/role_ids[1:] split still needs exactly one of these, if any, to lead).
export const SENIOR_ROLE_NAMES = [
  ROLE_NAMES.PLATFORM_ADMIN, ROLE_NAMES.ADMIN, ROLE_NAMES.ENTITY_ADMIN, ROLE_NAMES.BU_ADMIN,
  ROLE_NAMES.BU_HEAD,
];

// Roles that operate platform-wide / across Entities and never carry a company_id.
export const NO_COMPANY_ROLES = [ROLE_NAMES.PLATFORM_ADMIN, ROLE_NAMES.ADMIN, ROLE_NAMES.ENTITY_ADMIN];
