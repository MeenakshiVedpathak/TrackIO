// The real backend doesn't implement the RBAC redesign spec yet (verified against `bakend/src`
// directly — no hierarchy_rank/is_system fields, no Entity/BU/Project/Service PO Admin roles, no
// /admins, /entity-admins list, /team-mappings, or /my-team routes exist there). This flag mocks
// every endpoint the spec touches so the frontend can be built and demoed now. Flip it off (env
// var, not a code change) the moment the real backend ships this contract.
export const RBAC_MOCK_ENABLED = import.meta.env.VITE_RBAC_MOCK !== 'false';

if (RBAC_MOCK_ENABLED && typeof window !== 'undefined' && !window.__rbacMockBannerShown) {
  window.__rbacMockBannerShown = true;
  // eslint-disable-next-line no-console
  console.info(
    '%c[RBAC MOCK] Auth, Users, Employees, Roles, Admins, Entity Admins, Team Mappings and My ' +
    'Team are all served from an in-memory mock (bakend/ does not implement the new RBAC ' +
    'contract yet). Set VITE_RBAC_MOCK=false once the real backend ships it.',
    'color: #b45309; font-weight: bold;'
  );
}
