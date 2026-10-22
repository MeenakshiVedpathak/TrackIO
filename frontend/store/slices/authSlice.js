import { createSlice, createSelector } from '@reduxjs/toolkit';
import {
  clearAuth, getAccessToken, getRefreshToken, saveTokens,
  getStoredRoles, saveRoles, getStoredAccessibleForms, saveAccessibleForms,
  getStoredEmployee, saveEmployee,
  getStoredBusinessUnits, saveBusinessUnits,
  getStoredActiveBuId, saveActiveBuId,
} from '@/services/apiClient';

const initialState = {
  // Employee Identity Migration: the login response's sole identity object — there is no more
  // separate `user`. `null` only before the first login (or after logout).
  employee: getStoredEmployee(),
  accessToken: getAccessToken(),
  refreshToken: getRefreshToken(),
  isAuthenticated: !!getAccessToken(),
  // RBAC: roles held by the logged-in employee — flat, no primary/additional split:
  // [{ id, name, permission: 'Read'|'Read & Write', hierarchyRank }]
  roles: getStoredRoles(),
  // RBAC: module -> [{ id, name }] accessible-forms map from POST /roles/forms
  accessibleForms: getStoredAccessibleForms(),
  // False only in the brief window right after a fresh login, while accessibleForms has been
  // cleared and the authoritative POST /roles/forms fetch is still in flight — lets
  // ProtectedRoute show a loader instead of misreading "not loaded yet" as "not authorized".
  // True by default (including on a hard refresh) since the localStorage-restored map above is
  // usable immediately; MainLayout's useSyncAccessibleForms silently refreshes it regardless.
  accessibleFormsLoaded: true,
  // Employee Identity Migration: every employee now carries `businessUnits[]` — [] for an
  // account with none (Platform Admin/Entity Admin never had one either; Admin can be mapped
  // now). No longer BU-Head-only, or split into a separate single-`company` concept.
  businessUnits: getStoredBusinessUnits(),
  // The currently-active BU, global across the app — drives the X-Company-Id header. Required
  // once an employee has more than one BU; auto-selected to the first on login otherwise.
  activeBuId: getStoredActiveBuId(),
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { employee, accessToken, refreshToken, roles } = action.payload;
      state.accessToken = accessToken;
      state.refreshToken = refreshToken;
      state.isAuthenticated = true;
      saveTokens(accessToken, refreshToken);

      const nextEmployee = employee ?? null;
      state.employee = nextEmployee;
      saveEmployee(nextEmployee);

      // Roles are re-issued on every login, so always overwrite (never merge with stale ones).
      const nextRoles = roles ?? [];
      state.roles = nextRoles;
      saveRoles(nextRoles);

      // Role-Based Login: the login/refresh-token response no longer carries `businessUnits` —
      // reset to empty here and let the caller populate it via setBusinessUnits right after,
      // from a separate GET /employees/:id/business-units call. Stale BUs from a prior
      // session/role must not survive into this one even for the brief window before that fetch
      // resolves.
      state.businessUnits = [];
      saveBusinessUnits([]);
      state.activeBuId = null;
      saveActiveBuId(null);

      // Accessible forms are role-derived — clear the previous session's cache until the
      // post-login fetch (Step 3) repopulates it for the new roles.
      state.accessibleForms = {};
      saveAccessibleForms({});
      state.accessibleFormsLoaded = false;
    },
    // Role-Based Login: populates businessUnits from the dedicated GET
    // /employees/:id/business-units call made right after login/select-role — auto-selects the
    // first BU so the employee never has to pick one manually when there's exactly one (or none).
    setBusinessUnits: (state, action) => {
      const nextBusinessUnits = action.payload ?? [];
      state.businessUnits = nextBusinessUnits;
      saveBusinessUnits(nextBusinessUnits);
      const nextActiveBuId = nextBusinessUnits[0]?.id ?? null;
      state.activeBuId = nextActiveBuId;
      saveActiveBuId(nextActiveBuId);
    },
    setTokens: (state, action) => {
      const { accessToken, refreshToken } = action.payload;
      state.accessToken = accessToken;
      state.refreshToken = refreshToken;
      saveTokens(accessToken, refreshToken);
    },
    // Refreshed on silent token rotation — same roles shape as login, re-issued as-is.
    setRoles: (state, action) => {
      const nextRoles = action.payload ?? [];
      state.roles = nextRoles;
      saveRoles(nextRoles);
    },
    setAccessibleForms: (state, action) => {
      const forms = action.payload ?? {};
      state.accessibleForms = forms;
      saveAccessibleForms(forms);
      state.accessibleFormsLoaded = true;
    },
    // Mid-session role switch (POST /auth/switch-role). Deliberately NOT setCredentials:
    // that resets businessUnits/activeBuId for a brand-new session, whereas a role switch must
    // leave the employee's BU mappings and their current BU selection exactly as they were —
    // the BU switcher keeps working across the switch. Only ever dispatched AFTER the backend
    // has confirmed the switch; the frontend never flips the active role on its own.
    switchRole: (state, action) => {
      const { accessToken, refreshToken, roles, employee } = action.payload ?? {};

      // The session is re-scoped to the new role, so the backend normally re-issues the access
      // token. Only replace what it actually sent — a response that rotates the access token
      // but not the refresh token must keep the existing refresh token, not blank it.
      if (accessToken) {
        const nextRefreshToken = refreshToken ?? state.refreshToken;
        state.accessToken = accessToken;
        state.refreshToken = nextRefreshToken;
        // saveTokens writes both keys, so only persist when there's a real refresh token to
        // write alongside — otherwise the literal string "null" lands in localStorage.
        if (nextRefreshToken) saveTokens(accessToken, nextRefreshToken);
      }

      // The switched-to role set is authoritative — overwrite, never merge with the old one.
      const nextRoles = roles ?? [];
      state.roles = nextRoles;
      saveRoles(nextRoles);

      // Only if the response re-serialized the employee. Its `roles[]` is the full assigned-role
      // list that drives the switcher itself, so a stale one would silently shrink the menu.
      if (employee) {
        state.employee = employee;
        saveEmployee(employee);
      }

      // Accessible forms are role-derived: drop the previous role's map so no menu entry from
      // the old role survives the switch. accessibleFormsLoaded=false keeps ProtectedRoute on
      // its loader instead of reading the now-empty map as "not authorized" mid-switch — the
      // caller repopulates it from POST /roles/forms for the new role.
      state.accessibleForms = {};
      saveAccessibleForms({});
      state.accessibleFormsLoaded = false;
    },
    // Switching BU updates the global selection only — no re-login, no full page reload.
    // Callers (UserMenu's BU switcher) are responsible for invalidating React Query so
    // BU-scoped screens refetch against the newly-selected BU rather than showing stale data
    // from the prior one (same fix already used for the analogous stale-data-on-logout bug).
    setActiveBu: (state, action) => {
      const buId = action.payload;
      if (!state.businessUnits.some((bu) => bu.id === buId)) return;
      state.activeBuId = buId;
      saveActiveBuId(buId);
    },
    logout: (state) => {
      state.employee = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.roles = [];
      state.accessibleForms = {};
      state.accessibleFormsLoaded = true;
      state.businessUnits = [];
      state.activeBuId = null;
      clearAuth();
    },
  },
});

export const {
  setCredentials, setTokens, setRoles, setAccessibleForms, setBusinessUnits, setActiveBu,
  switchRole, logout,
} = authSlice.actions;

const EMPTY_PERMISSIONS = [];
const EMPTY_ROLES = [];
const EMPTY_FORMS = {};
const EMPTY_BUS = [];

export const selectCurrentEmployee = (state) => state.auth.employee;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;

// Full role objects from login: [{ id, name, permission, hierarchyRank }] — the RBAC source of
// truth. Flat — no positional "primary" role anymore.
export const selectAuthRoles = (state) => state.auth.roles ?? EMPTY_ROLES;
export const selectAuthRoleIds = createSelector([selectAuthRoles], (roles) => roles.map((r) => r.id));

// module -> [{ id, name }]
export const selectAccessibleForms = (state) => state.auth.accessibleForms ?? EMPTY_FORMS;
export const selectAccessibleFormsLoaded = (state) => state.auth.accessibleFormsLoaded ?? true;

// Employee Identity Migration: [] for an account with no BU (Platform Admin/Entity Admin; Admin can be mapped now).
export const selectBusinessUnits = (state) => state.auth.businessUnits ?? EMPTY_BUS;
export const selectActiveBuId = (state) => state.auth.activeBuId ?? null;

// `is_original_data_visible` now lives on the BU, not the role (see companies.api.js's create
// payload) — gates the Modified/Original hours-source toggle in Reports & Dashboard. Derived
// reactively off whichever BU is currently active, not stored/dispatched separately, so
// switching BUs updates it automatically. `false` for an account with no active BU.
export const selectIsOriginalDataVisible = createSelector(
  [selectBusinessUnits, selectActiveBuId],
  (businessUnits, activeBuId) => !!businessUnits.find((bu) => bu.id === activeBuId)?.is_original_data_visible
);

// A held role now carries `hierarchyRank` directly — this is the numeric-comparison escape
// hatch (e.g. "is any held role senior enough to do X"). Reads across the WHOLE array (the most
// senior rank held), since there's no positional "primary" role anymore.
export const selectHierarchyRank = createSelector(
  [selectAuthRoles],
  (roles) => roles.reduce((min, r) => (r.hierarchyRank != null && (min == null || r.hierarchyRank < min) ? r.hierarchyRank : min), null)
);

// Platform Admin is the top of the role hierarchy — true if ANY held role is Platform Admin
// (in practice it's always the account's only role, since it's a senior tier and senior tiers
// are capped at one, but this checks the whole array rather than assuming position 0).
export const selectIsPlatformAdmin = createSelector(
  [selectAuthRoles],
  (roles) => roles.some((r) => r.name === 'Platform Admin')
);

// An Employee login is identified by its role name — checks ANY held role, not just one: an
// account can hold Employee alongside another role (e.g. Employee + Manager), and it must still
// pass this to reach Employee self-service routes (ProtectedRoute's `employeeOnly` gate).
export const selectIsEmployee = (state) => (state.auth.roles ?? EMPTY_ROLES).some((r) => r.name === 'Employee');

// True only when Employee is the account's SOLE role. MainLayout uses this (not selectIsEmployee)
// to decide whether to bounce a user straight to the Employee dashboard — a genuinely multi-role
// account (Employee + Manager) must still be able to reach MainLayout for its other role's
// screens, not just the Employee-only ones.
export const selectIsEmployeeOnly = (state) => {
  const roles = state.auth.roles ?? EMPTY_ROLES;
  return roles.length > 0 && roles.every((r) => r.name === 'Employee');
};

// Returns array of role name strings, from the flat roles[] the login response carries.
export const selectUserRoles = createSelector([selectAuthRoles], (roles) => roles.map((r) => r.name).filter(Boolean));

// First role name — display purposes only (e.g. a badge next to the account name). Never used
// for gating logic — use hasRole()/selectIsPlatformAdmin/selectIsEmployee for that.
export const selectUserRole = (state) => selectUserRoles(state)[0] ?? null;
export const selectUserPermissions = (state) => EMPTY_PERMISSIONS;

// true if any held role carries "Read & Write" — the basis for all Create/Edit/Delete gating
export const selectHasWriteAccess = createSelector(
  [selectAuthRoles],
  (roles) => roles.some((r) => r.permission === 'Read & Write')
);

export default authSlice.reducer;
