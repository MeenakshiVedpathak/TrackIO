import { useAuth } from '@/hooks/useAuth';
import { ROLE_NAMES } from '@/constants/roleHierarchy';

// Read vs Read & Write gating. Permission is carried by the ROLE itself (not per-form/module —
// the backend contract has no per-form permission field), so this is a single check per user:
// true if ANY held role carries "Read & Write". An optional roleName narrows the check to only
// consider roles the caller cares about (e.g. useCanWrite('HR') for an HR-only screen where
// only HR's own permission should matter).
// A Platform Admin has no roles at all (sits above the per-company RBAC system), so it always
// gets full write access on the screens it's allowed onto (Role/Forms Master) rather than
// reading as permanently read-only.
export const useCanWrite = (roleName) => {
  const { roleObjects, isPlatformAdmin } = useAuth();
  if (isPlatformAdmin) return true;
  const relevant = roleName ? roleObjects.filter((r) => r.name === roleName) : roleObjects;
  return relevant.some((r) => r.permission === 'Read & Write');
};

// Declarative wrapper for the common case of hiding a single Create/Edit/Delete/Save button.
export const RequireWrite = ({ roleName, children, fallback = null }) => {
  const canWrite = useCanWrite(roleName);
  return canWrite ? children : fallback;
};

// true if the accessible-forms map grants this exact form name, in any module.
// For capabilities that are their own distinct Administration form (e.g. "Role Form Mapping")
// rather than just a permission check — the form itself must be granted, not only Read & Write.
export const useHasForm = (formName) => {
  const { accessibleForms, isPlatformAdmin } = useAuth();
  if (isPlatformAdmin) return true;
  return Object.values(accessibleForms ?? {})
    .flat()
    .some((f) => f.name === formName);
};

// Who may CREATE/EDIT an employee RECORD, as opposed to merely MAPPING roles & Business Units
// onto one that already exists. Employee Master is granted to the BU-scoped senior tier (BU
// Admin / BU Head) purely so they can run that mapping for their own BU — the record itself
// (identity, login, manager, joining/leaving dates, active status, bulk import) stays with
// HR / Admin / Entity Admin.
//
// Note this can't be expressed with useCanWrite alone: a BU Admin's role DOES carry
// "Read & Write", which is what gets them the mapping dialog in the first place — the
// distinction here is over WHICH object, not read vs write.
//
// Frontend affordance only; the real enforcement is the RequireEmployeeRecordAccess guard on
// EMPLOYEE_NEW / EMPLOYEE_EDIT (routes/index.jsx) plus the backend's own checks.
export const useCanManageEmployeeRecords = () => {
  const { hasRole } = useAuth();
  const canWrite = useCanWrite();
  // A Platform Admin holds no roles at all, so hasRole is false for it and canWrite is true —
  // it falls through to `true` here without a special case.
  return canWrite && !hasRole(ROLE_NAMES.BU_ADMIN, ROLE_NAMES.BU_HEAD);
};

// Who may CREATE/EDIT a Business Unit, as opposed to merely LOOKING at the BU Master list.
// A BU is an Entity-tier object: only Admin / Entity Admin (and Platform Admin, which sits above
// the per-company RBAC system entirely) may add one, rename one, or activate/deactivate one.
// BU Master itself is reachable read-only by the BU-scoped senior tier — a BU Admin / BU Head
// needs to SEE the BUs they map employees against — so this is deliberately narrower than
// "can this login open the screen" (route guard) and than useCanWrite (a BU Admin's role does
// carry Read & Write, just not over BUs themselves).
//
// Frontend affordance only: the real enforcement is the Admin/Entity-Admin route guard on
// COMPANY_NEW / COMPANY_EDIT (routes/index.jsx) plus the backend's own checks on
// POST/PATCH /companies.
export const useCanManageBusinessUnits = () => {
  const { hasRole, isPlatformAdmin } = useAuth();
  return isPlatformAdmin || hasRole(ROLE_NAMES.ADMIN, ROLE_NAMES.ENTITY_ADMIN);
};

// Gates the Modified/Original hours-source toggle in Reports & Dashboard, and the Modified
// Hours visibility on the Timesheet Import screens. Set once from the POST /auth/login
// response's roles[] and never refreshed mid-session — a Role Master edit only takes effect
// on the user's next login.
export const useCanViewOriginalData = () => {
  const { isOriginalDataVisible } = useAuth();
  return isOriginalDataVisible;
};

export default useCanWrite;
