import { useDispatch, useSelector } from 'react-redux';
import { queryClient } from '@/lib/queryClient';
import {
  selectCurrentEmployee,
  selectIsAuthenticated,
  selectUserRole,
  selectUserRoles,
  selectUserPermissions,
  selectAuthRoles,
  selectAuthRoleIds,
  selectAccessibleForms,
  selectAccessibleFormsLoaded,
  selectIsOriginalDataVisible,
  selectHasWriteAccess,
  selectHierarchyRank,
  selectIsPlatformAdmin,
  selectIsEmployee,
  selectIsEmployeeOnly,
  selectBusinessUnits,
  selectActiveBuId,
  logout,
  setCredentials,
  setAccessibleForms,
  setBusinessUnits,
  setActiveBu,
  switchRole,
} from '@/store/slices/authSlice';
import { ROUTES } from '@/constants/routes';
import { computeHomeRoute, FORM_NAMES } from '@/constants/rbacForms';

export const useAuth = () => {
  const dispatch = useDispatch();
  const employee = useSelector(selectCurrentEmployee); // login's sole identity object, or null
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const role = useSelector(selectUserRole);       // first role — for display
  const roles = useSelector(selectUserRoles);     // all role names — for hasRole checks
  const permissions = useSelector(selectUserPermissions);
  const roleObjects = useSelector(selectAuthRoles);   // [{ id, name, permission, hierarchyRank }] — RBAC source of truth
  const roleIds = useSelector(selectAuthRoleIds);
  const accessibleForms = useSelector(selectAccessibleForms); // { [module]: [{ id, name }] }
  const accessibleFormsLoaded = useSelector(selectAccessibleFormsLoaded); // false only right after a fresh login, until forms are fetched
  const isOriginalDataVisible = useSelector(selectIsOriginalDataVisible); // gates Modified/Original toggle, derived from the active BU
  const hasWriteAccess = useSelector(selectHasWriteAccess);   // any role carries "Read & Write"
  const hierarchyRank = useSelector(selectHierarchyRank); // the most senior held role's position in the RBAC hierarchy
  const isPlatformAdmin = useSelector(selectIsPlatformAdmin); // true if ANY held role is Platform Admin
  const isEmployee = useSelector(selectIsEmployee); // true if Employee is ANY held role
  const isEmployeeOnly = useSelector(selectIsEmployeeOnly); // true only if Employee is the SOLE held role
  const businessUnits = useSelector(selectBusinessUnits); // [] for an employee with no BU (Platform Admin/Entity Admin; Admin can be mapped now)
  const activeBuId = useSelector(selectActiveBuId); // the currently-active BU, global across the app

  // true if the user has ANY of the specified roles
  const hasRole = (...requiredRoles) => roles.some((r) => requiredRoles.includes(r));

  // Every role ASSIGNED to this employee, which is not the same thing as `roleObjects` above:
  // that one holds the role(s) this SESSION is currently scoped to (what login's role picker
  // settled on), while this is the full set the account may switch between. Normalized to
  // { id, name } because the employee payload names it `role_name` where the session roles use
  // `name`. Empty for an account whose employee payload predates the field — the role switcher
  // simply stays hidden then, rather than showing a broken list.
  const assignedRoles = (employee?.roles ?? [])
    .map((r) => ({ id: r.id, name: r.role_name ?? r.name }))
    .filter((r) => r.id != null && r.name);

  // The session's current role. Single-active-role sessions are what /auth/select-role and
  // /auth/switch-role produce, so this reads the first entry rather than inventing a separate
  // "active role" field the store doesn't have.
  const activeRoleId = roleObjects[0]?.id ?? null;

  // Only meaningful for an account holding more than one role — drives whether the profile
  // menu shows a switcher at all.
  const canSwitchRole = assignedRoles.length > 1;

  // Where "back to home" should actually land — Dashboard (or, for an Employee-only account,
  // Employee Dashboard) is no longer guaranteed to be accessible to everyone (see
  // ProtectedRoute's `allowIfNoFormsMapped`), so anything that used to hardcode ROUTES.DASHBOARD
  // / ROUTES.EMPLOYEE_DASHBOARD as a safe fallback (NotFound's button, MainLayout's employee-only
  // tier guard) should use this instead to avoid bouncing an account straight back into Not
  // Authorized just because its actual mapped forms don't include that particular one.
  const homeRoute = isEmployeeOnly
    ? computeHomeRoute(accessibleForms, { homeFormName: FORM_NAMES.EMPLOYEE_DASHBOARD, homeRoute: ROUTES.EMPLOYEE_DASHBOARD })
    : isPlatformAdmin
      ? ROUTES.ADMINS
      : computeHomeRoute(accessibleForms);

  const hasPermission = (permission) => permissions.includes(permission);

  const handleLogout = () => {
    dispatch(logout());
    queryClient.clear();
  };

  const updateCredentials = (payload) => dispatch(setCredentials(payload));

  const updateAccessibleForms = (forms) => dispatch(setAccessibleForms(forms));

  const updateBusinessUnits = (bus) => dispatch(setBusinessUnits(bus));

  // Switching BU updates the global selection only — no re-login, no full page reload. Callers
  // (UserMenu's BU switcher) are responsible for invalidating React Query so BU-scoped screens
  // refetch, same as handleLogout's queryClient.clear() above.
  const selectBu = (buId) => dispatch(setActiveBu(buId));

  // Applies a role switch the backend has ALREADY confirmed — never call this with anything
  // other than a successful /auth/switch-role response body. Callers must refetch the
  // accessible-forms map afterwards (the reducer intentionally clears it).
  const applyRoleSwitch = (payload) => dispatch(switchRole(payload));

  return {
    employee,
    isAuthenticated,
    role,
    roles,
    permissions,
    roleObjects,
    roleIds,
    assignedRoles,
    activeRoleId,
    canSwitchRole,
    accessibleForms,
    accessibleFormsLoaded,
    isOriginalDataVisible,
    hasWriteAccess,
    hierarchyRank,
    isPlatformAdmin,
    isEmployee,
    isEmployeeOnly,
    businessUnits,
    activeBuId,
    homeRoute,
    hasRole,
    hasPermission,
    logout: handleLogout,
    setCredentials: updateCredentials,
    setAccessibleForms: updateAccessibleForms,
    setBusinessUnits: updateBusinessUnits,
    setActiveBu: selectBu,
    applyRoleSwitch,
  };
};

export default useAuth;
