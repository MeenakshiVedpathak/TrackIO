import axios from 'axios';
import { ROLE_NAMES, NO_COMPANY_ROLES } from '@/constants/roleHierarchy';
import { getDeviceId, getDeviceName } from '@/utils/deviceId';

// Runtime config, not a build-time env var: /env-config.js is a static file served
// alongside the bundle and swapped per environment at deploy time, so one build
// artifact works on localhost/trackio/rutqa/railway/rut-portal without rebuilding.
const BASE_URL = window.APP_CONFIG.apiUrl;

// ── Plain axios for refresh (bypasses interceptor to prevent infinite loop) ──
const plainAxios = axios.create({ baseURL: BASE_URL });

// ── Main API client ──
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Token refresh state ──
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

// ── Request interceptor: attach access token ──
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Stable per-browser id for the Audit Logs "Device ID" column — sent on every request
    // (including /auth/login) so the LOGIN audit row carries it too.
    config.headers['X-Device-Id'] = getDeviceId();
    // Readable label alongside it (e.g. "Chrome on Windows") — omitted entirely when empty
    // (no userAgentData and no user-set name) so the backend's own User-Agent-derived fallback
    // takes over instead of sending a blank header.
    const deviceName = getDeviceName();
    if (deviceName) {
      config.headers['X-Device-Name'] = deviceName;
    }
    // Employee Identity Migration: every employee now carries businessUnits[] (0/1/many) instead
    // of a single `company` — the currently-active BU (auto-selected on login, switchable via
    // UserMenu) drives this header uniformly. Absent for an employee with no BU (Platform
    // Admin/Admin/Entity Admin) since activeBuId is null for them, and for any request that
    // opts out via NO_BU_SCOPE below.
    const activeBuId = getStoredActiveBuId();
    if (activeBuId != null && !config.skipCompanyHeader) {
      config.headers['X-Company-Id'] = activeBuId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Drops X-Company-Id for a request. Deliberately NOT exported: an endpoint that resolves the
// caller's scope from their authenticated identity ignores the header anyway, so stripping it buys
// nothing and only risks breaking against a backend that still reads it. The one case that genuinely
// needs it goes through crossBuScopeForAdmin below.
const NO_BU_SCOPE = { skipCompanyHeader: true };

// Spread into an axios config to drop X-Company-Id for an Admin only:
//   apiClient.get('/service-pos', { params, ...crossBuScopeForAdmin() })
// An Admin is meant to see every BU's Service POs at once, so the BU switcher must not narrow
// their master lists — with no header the backend scopes by role reach instead, and Admin picks a
// BU explicitly via Service PO Master's own BU filter. Every other role, BU Admin included, keeps
// the existing globally-BU-filtered behaviour untouched. Platform Admin and Entity Admin are
// unaffected either way: activeBuId is null for them, so no header is ever sent.
// Reads roles from storage rather than Redux so the api layer stays React-free, same as
// getStoredActiveBuId above.
export const crossBuScopeForAdmin = () =>
  (getStoredRoles().some((r) => r.name === ROLE_NAMES.ADMIN) ? NO_BU_SCOPE : {});

// True when this login's reach is resolved from its token alone, with no X-Company-Id involved:
//   · an account with no mapped BU sends no header regardless (activeBuId is null);
//   · Platform Admin / Admin / Entity Admin are cross-BU by role — they carry no company_id
//     (NO_COMPANY_ROLES), which is exactly why crossBuScopeForAdmin can drop the header for them.
// Every other login (BU Admin, BU Head, Project Admin, Team Lead, Employee, HR…) is BU-scoped.
// Reads from storage rather than Redux for the same reason as crossBuScopeForAdmin above.
export const canScopeAcrossBus = () =>
  getStoredActiveBuId() == null || getStoredRoles().some((r) => NO_COMPANY_ROLES.includes(r.name));

// How many BUs this login is actually mapped to — 1 for a typical BU Admin, several for a BU Head
// or a multi-BU BU Admin. Only meaningful for BU-scoped logins; a cross-BU login's reach comes
// from its role, not this list.
const mappedBuCount = () => getStoredBusinessUnits().length;

// Spread into an axios config to scope one request to an explicitly-chosen BU instead of the
// navbar's globally-active one:
//   apiClient.get('/reports/x', { params, ...explicitBuScope(buId) })
// Every Reports page now owns its BU selection inside its own Filters panel (see
// components/common/BusinessUnitFilter) rather than inheriting the global switcher, and starts
// on "All Business Units":
//   'all'/null -> no X-Company-Id at all, so the backend falls back to the caller's role reach
//                 (an Admin sees every BU) — the same mechanism crossBuScopeForAdmin relies on.
//                 EXCEPT for a BU-scoped login mapped to a single BU (isSingleBuLogin), where
//                 the header is left in place instead: the backend rejects a header-less request
//                 from a BU-scoped caller with 400 "X-Company-Id header is required" — the red
//                 banner a BU Admin used to hit on every report the moment they touched this
//                 filter — and their one BU is by definition "all of theirs" anyway, so sending
//                 it answers the question exactly rather than working around it.
//                 A BU-scoped login mapped to SEVERAL BUs (BU Head, a multi-BU BU Admin) has no
//                 single header that means "all of mine", so a true cross-BU answer needs the
//                 backend to accept a header-less request and scope it to every BU that caller is
//                 mapped to — which shipped 2026-09 (see the auto-map-creator change: a new
//                 Project/Service PO's BU is now resolved from its selected Client rather than
//                 the active header). So only the genuinely-single-BU case still falls back to
//                 leaving the header in place below; every multi-BU case now gets NO_BU_SCOPE and
//                 a true "all of mine" answer.
//   a BU id    -> that id is sent instead of the active one, without touching the global
//                 selection, so switching a report's BU never changes any other screen.
//   undefined  -> opt out entirely and leave the interceptor's global-BU behaviour alone. This
//                 is the important default: /reports/* endpoints are also consumed by screens
//                 outside the Reports suite (Monthly Costs, the AI profile/recommendation
//                 pages), which have no BU picker and must keep following the navbar exactly as
//                 before — so "unscoped" has to be something a caller asks for, never something
//                 it gets by routing through the reports API.
// `skipCompanyHeader` is set on the explicit-id branch too, because the request interceptor
// would otherwise overwrite that header with the globally-active BU.
export const explicitBuScope = (buId) => {
  if (buId === undefined) return {};
  if (buId === null || buId === 'all') {
    return !canScopeAcrossBus() && mappedBuCount() === 1 ? {} : NO_BU_SCOPE;
  }
  return { ...NO_BU_SCOPE, headers: { 'X-Company-Id': String(buId) } };
};

// ── Response interceptor: handle 401 + token rotation ──
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // RBAC mock: a mock session's access token (`mock.<userId>.<ts>`, see rbacMockDb.js) is
    // never valid against the real backend — any still-unmocked endpoint (AI Copilot widget,
    // notifications polling, etc.) legitimately 401s here even though the mock session itself
    // is fine. Without this guard, that single unrelated 401 would trigger the refresh-token
    // dance below (which also 401s against the real backend) and hard-logout the mock session
    // via `handleLogout()` — wiping the demo out from under an otherwise-working screen.
    const isMockSession = getAccessToken()?.startsWith('mock.');

    // Public auth endpoints (login, forgot/reset-password, etc.) return 401 for "wrong
    // credentials," not "your session expired" — running the refresh/logout dance on them
    // wipes local state and hard-redirects to /login before the caller's own catch block
    // (e.g. Login.jsx's showError) ever gets to render the real message.
    const isPublicAuthRequest = original?.url?.startsWith('/auth/') && original.url !== '/auth/profile' && original.url !== '/auth/change-password';

    // Role-Based Login: these mean the access token itself is structurally broken for this
    // session (a loginTicket sent as a Bearer token, or the role this session was scoped to got
    // deactivated mid-session) — retrying the refresh dance can't fix either, so skip straight to
    // logout instead of burning a refresh call that would just 401 again.
    const errorCode = error.response?.data?.code;
    const isRoleScopingError = errorCode === 'ROLE_SELECTION_REQUIRED' || errorCode === 'ROLE_NO_LONGER_ACTIVE';

    if (error.response?.status === 401 && isRoleScopingError && !isMockSession) {
      handleLogout();
      return Promise.reject(error);
    }

    // Startup race: right after login, MainLayout's useSyncBusinessUnits() (GET
    // /employees/:id/business-units) hasn't resolved yet, so getStoredActiveBuId() is still null
    // when a page's own queries (Entities, Forms, active Employees list, etc.) fire on the very
    // same mount — those go out with no X-Company-Id header at all, which a BU-scoped login's
    // backend rejects with this code. React Query's own default retry deliberately skips every
    // 4xx (see lib/queryClient.js), so this never self-healed before — it just failed once and
    // stayed failed until the page was left and re-entered. Retried here exactly once, waiting
    // for the BU sync already in flight to land, rather than gating the whole app's initial
    // render behind it (which would add a loading screen to every login, not just this race).
    if (errorCode === 'COMPANY_HEADER_REQUIRED' && !original._companyRetry) {
      original._companyRetry = true;
      const activeBuId = await waitForActiveBuId();
      if (activeBuId != null) {
        original.headers['X-Company-Id'] = activeBuId;
        return apiClient(original);
      }
      // Never resolved (e.g. this login genuinely has no BU) — surface the original error as-is.
    }

    if (error.response?.status === 401 && !original._retry && !isMockSession && !isPublicAuthRequest) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return apiClient(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        isRefreshing = false;
        handleLogout();
        return Promise.reject(error);
      }

      try {
        const refreshDeviceName = getDeviceName();
        const { data } = await plainAxios.post(
          '/auth/refresh-token',
          { refresh_token: refreshToken },
          { headers: { 'X-Device-Id': getDeviceId(), ...(refreshDeviceName && { 'X-Device-Name': refreshDeviceName }) } }
        );
        // ⚠️ `roles`/`forms` keys here are a guess — per the "refresh-token has the same
        // roles+forms shape as login" API reference. Guarded with `if (...)` below so a
        // wrong/absent key name is a no-op, not a crash.
        const { accessToken, refreshToken: newRefreshToken, roles, forms } = data.data;

        saveTokens(accessToken, newRefreshToken);
        if (refreshDataCallback && (roles || forms)) refreshDataCallback({ roles, forms });
        processQueue(null, accessToken);

        original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        handleLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Token storage helpers (localStorage) ──
const TOKEN_KEYS = {
  ACCESS: 'rut_access_token',
  REFRESH: 'rut_refresh_token',
  ROLES: 'rut_roles',
  ACCESSIBLE_FORMS: 'rut_accessible_forms',
  EMPLOYEE: 'rut_employee',
  AI_COPILOT_CONVERSATION: 'rut_ai_copilot_conversation',
  BUSINESS_UNITS: 'rut_business_units',
  ACTIVE_BU_ID: 'rut_active_bu_id',
};

export const getAccessToken = () => localStorage.getItem(TOKEN_KEYS.ACCESS);
export const getRefreshToken = () => localStorage.getItem(TOKEN_KEYS.REFRESH);

// Roles from login response: [{ id, name, permission, hierarchyRank }]
export const getStoredRoles = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS.ROLES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// Accessible-forms map from POST /roles/forms: { [moduleName]: [{ id, name }] }
export const getStoredAccessibleForms = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS.ACCESSIBLE_FORMS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

// Employee Identity Migration: login's sole identity object — null only before the first login.
export const getStoredEmployee = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS.EMPLOYEE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveTokens = (accessToken, refreshToken) => {
  localStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
  localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
};

export const saveRoles = (roles) => {
  localStorage.setItem(TOKEN_KEYS.ROLES, JSON.stringify(roles ?? []));
};

export const saveAccessibleForms = (accessibleForms) => {
  localStorage.setItem(TOKEN_KEYS.ACCESSIBLE_FORMS, JSON.stringify(accessibleForms ?? {}));
};

export const saveEmployee = (employee) => {
  if (employee) {
    localStorage.setItem(TOKEN_KEYS.EMPLOYEE, JSON.stringify(employee));
  } else {
    localStorage.removeItem(TOKEN_KEYS.EMPLOYEE);
  }
};

// Employee Identity Migration: every employee's `businessUnits[]` — always present, possibly [].
export const getStoredBusinessUnits = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS.BUSINESS_UNITS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveBusinessUnits = (businessUnits) => {
  localStorage.setItem(TOKEN_KEYS.BUSINESS_UNITS, JSON.stringify(businessUnits ?? []));
};

// The currently-active BU, global across the whole app — drives the X-Company-Id header.
export const getStoredActiveBuId = () => {
  const raw = localStorage.getItem(TOKEN_KEYS.ACTIVE_BU_ID);
  return raw ? Number(raw) : null;
};

export const saveActiveBuId = (buId) => {
  if (buId != null) {
    localStorage.setItem(TOKEN_KEYS.ACTIVE_BU_ID, String(buId));
  } else {
    localStorage.removeItem(TOKEN_KEYS.ACTIVE_BU_ID);
  }
};

// Polls localStorage (not Redux — this module stays React-free, same reason
// crossBuScopeForAdmin/canScopeAcrossBus above read from storage) for up to ~2s, waiting for
// MainLayout's useSyncBusinessUnits() fetch (already in flight on every authenticated page load)
// to land and write the active BU id. Resolves with whatever value shows up, or null once the
// window runs out — a login that's genuinely cross-BU (no mapped BU at all) will always hit the
// timeout here, which is expected and harmless: it just means the original error gets surfaced,
// same as before this retry existed.
const waitForActiveBuId = (timeoutMs = 2000, intervalMs = 150) => {
  const existing = getStoredActiveBuId();
  if (existing != null) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const value = getStoredActiveBuId();
      if (value != null || Date.now() - start >= timeoutMs) {
        resolve(value);
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEYS.ACCESS);
  localStorage.removeItem(TOKEN_KEYS.REFRESH);
  localStorage.removeItem(TOKEN_KEYS.ROLES);
  localStorage.removeItem(TOKEN_KEYS.ACCESSIBLE_FORMS);
  localStorage.removeItem(TOKEN_KEYS.EMPLOYEE);
  localStorage.removeItem(TOKEN_KEYS.AI_COPILOT_CONVERSATION);
  localStorage.removeItem(TOKEN_KEYS.BUSINESS_UNITS);
  localStorage.removeItem(TOKEN_KEYS.ACTIVE_BU_ID);
};

// ── Logout handler (avoids circular dependency with store) ──
let logoutCallback = null;

export const registerLogoutCallback = (cb) => {
  logoutCallback = cb;
};

const handleLogout = () => {
  clearAuth();
  if (logoutCallback) logoutCallback();
};

// ── Silent token-refresh data handler (same circular-dependency workaround) ──
// Lets the interceptor push updated roles/forms into the Redux store without
// importing the store directly.
let refreshDataCallback = null;

export const registerRefreshDataCallback = (cb) => {
  refreshDataCallback = cb;
};

// Field-level validation errors (422, Joi) -> { field: message } for RHF's setError.
// ⚠️ Exact error envelope shape unconfirmed beyond "errors[].field" — written defensively so an
// unexpected shape just yields {} and falls back to the generic toast in extractApiError.
export const extractFieldErrors = (error) => {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors)) return {};
  return Object.fromEntries(
    errors
      .filter((e) => e?.field && e?.message)
      .map((e) => [e.field, e.message])
  );
};

// True for a request that never got a response at all — the server timed out, DNS/CORS/offline
// failed outright, or the client aborted past its own timeout — as opposed to one that got a real
// HTTP response back (2xx/4xx/5xx), which `error.response` would carry. Exported so callers that
// want to react to connectivity failures specifically (see lib/queryClient.js's background-query
// toast) don't have to re-derive this from axios' error codes themselves.
export const isNetworkOrTimeoutError = (error) =>
  !error?.response
  && (error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK' || error?.message === 'Network Error' || /timeout/i.test(error?.message ?? ''));

// ── API error normalizer ──
export const extractApiError = (error) => {
  // Checked before `error.response.data`: a request that timed out or never left the browser
  // carries no response body to read a message out of, and used to fall through to axios' own
  // technical wording ("timeout of 30000ms exceeded") landing verbatim in a toast.
  if (isNetworkOrTimeoutError(error)) {
    return error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message ?? '')
      ? 'The request took too long to respond. Please check your connection and try again.'
      : 'Unable to connect to server. Please check your connection.';
  }
  if (error?.response?.data) {
    const { message, errors } = error.response.data;
    if (errors?.length) {
      return errors.map((e) => e.message).join(', ');
    }
    return message || 'An unexpected error occurred.';
  }
  return error?.message || 'An unexpected error occurred.';
};

export default apiClient;
