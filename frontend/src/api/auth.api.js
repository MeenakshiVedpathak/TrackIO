import apiClient from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, persist, findEmployeeByEmail, findEmployeeById,
  rolesForLoginResponse, formsForRoleNames, issueTokenFor,
  getCurrentMockEmployee, mockError, MOCK_OTP, serializeEmployeeFull,
} from '@/mocks/rbacMockDb';

const mockLogin = async (email, password) => {
  await delay();
  const employee = findEmployeeByEmail(email);
  if (!employee) throw mockError(404, 'Email ID is not registered.');
  if (employee.password !== password) throw mockError(401, 'Incorrect password.');
  if (employee.status !== 'active') throw mockError(403, 'This account is inactive.');

  employee.last_login = new Date().toISOString();
  persist();

  const roles = rolesForLoginResponse(employee.id);

  // Real backend: no `businessUnits` on the login response anymore (fetched separately via
  // GET /employees/:id/business-units) — the mock mirrors that shape. The mock also never models
  // the real backend's multi-active-role `requiresRoleSelection` interstitial: mock employees'
  // `role_ids` are already treated as one flat simultaneous set, not a pick-one choice.
  return {
    success: true,
    message: 'Login successful.',
    data: {
      accessToken: issueTokenFor(employee.id),
      refreshToken: `refresh.${issueTokenFor(employee.id)}`,
      expiresIn: '15m',
      employee: serializeEmployeeFull(employee),
      roles,
      forms: formsForRoleNames(roles.map((r) => r.name)),
    },
  };
};

const mockRefresh = async (refreshToken) => {
  await delay();
  const match = /mock\.(\d+)\./.exec(refreshToken ?? '');
  const employeeId = match ? Number(match[1]) : null;
  const employee = employeeId ? findEmployeeById(employeeId) : null;
  if (!employee) throw mockError(401, 'Invalid or expired refresh token.');
  const roles = rolesForLoginResponse(employee.id);
  return {
    success: true,
    message: 'Token refreshed.',
    data: {
      accessToken: issueTokenFor(employee.id),
      refreshToken: `refresh.${issueTokenFor(employee.id)}`,
      expiresIn: '15m',
      roles,
      forms: formsForRoleNames(roles.map((r) => r.name)),
    },
  };
};

// Every seeded account shares one fixed OTP so the forgot-password flow is demoable without a
// real mailbox — see MOCK_OTP in rbacMockDb.js.
const mockForgotPassword = async (email) => {
  await delay();
  const employee = findEmployeeByEmail(email);
  if (!employee) throw mockError(404, 'Email ID is not registered.');
  return { success: true, message: `OTP sent to ${email}. (Mock OTP: ${MOCK_OTP})` };
};

const mockVerifyOtp = async (email, otp) => {
  await delay();
  if (otp !== MOCK_OTP) throw mockError(422, 'Invalid or expired OTP.');
  return { success: true, message: 'OTP verified.' };
};

const mockResetPassword = async (email, otp, password, confirmPassword) => {
  await delay();
  if (otp !== MOCK_OTP) throw mockError(422, 'Invalid or expired OTP.');
  if (password !== confirmPassword) throw mockError(422, 'Passwords do not match.');
  const employee = findEmployeeByEmail(email);
  if (!employee) throw mockError(404, 'Email ID is not registered.');
  employee.password = password;
  persist();
  return { success: true, message: 'Password reset successfully.' };
};

const mockChangePassword = async (newPassword) => {
  await delay();
  const employee = getCurrentMockEmployee();
  if (!employee) throw mockError(401, 'Not authenticated.');
  employee.password = newPassword;
  persist();
  return { success: true, message: 'Password changed successfully.' };
};

// Every method returns the raw parsed response body as-is (no unwrapping past `r.data`) —
// callers check the shape they expect for that specific call.
export const authApi = {
  login: (email, password) => {
    if (RBAC_MOCK_ENABLED) return mockLogin(email, password);
    return apiClient.post('/auth/login', { email, password }).then((r) => r.data);
  },

  logout: (refreshToken) => {
    if (RBAC_MOCK_ENABLED) return Promise.resolve({ success: true, message: 'Logged out.' });
    return apiClient.post('/auth/logout', { refresh_token: refreshToken }).then((r) => r.data);
  },

  refreshToken: (refreshToken) => {
    if (RBAC_MOCK_ENABLED) return mockRefresh(refreshToken);
    return apiClient.post('/auth/refresh-token', { refresh_token: refreshToken }).then((r) => r.data);
  },

  // Second step of login when an account has more than one active role — /auth/login returns
  // `requiresRoleSelection: true` + a short-lived `loginTicket` instead of tokens in that case.
  // Not reachable in RBAC_MOCK_ENABLED mode: mockLogin never returns requiresRoleSelection.
  selectRole: (loginTicket, roleId) =>
    apiClient.post('/auth/select-role', { loginTicket, roleId }).then((r) => r.data),

  // Mid-session role switch for an account that holds more than one role — the same effect as
  // login's /auth/select-role, but on an already-authenticated session: no re-login, no logout,
  // and the response re-issues the session scoped to the newly-selected role. Real-only, like
  // selectRole above — the mock DB models roles as one flat simultaneous set, so it has no
  // single-active-role session to switch between. The backend re-validates that the role
  // actually belongs to the caller; the roleId sent here is only a request, never authorization.
  switchRole: (roleId) =>
    apiClient.post('/auth/switch-role', { roleId }).then((r) => r.data),

  // Microsoft Entra ID SSO — the backend re-derives the employee from the verified ID token
  // itself, so only the raw token is sent (no email/name/claims from the MSAL result). Response
  // shape is identical to /auth/login, including the multi-role `requiresRoleSelection` case.
  microsoftLogin: (idToken) =>
    apiClient.post('/auth/microsoft', { idToken }).then((r) => r.data),

  getProfile: () =>
    apiClient.get('/auth/profile').then((r) => r.data),

  // PUT, not POST — and only `newPassword`. The backend identifies which account to update
  // purely from whichever Bearer token is attached, so this never sends an account type or
  // needs the current password.
  changePassword: (newPassword) => {
    if (RBAC_MOCK_ENABLED) return mockChangePassword(newPassword);
    return apiClient.put('/auth/change-password', { newPassword }).then((r) => r.data);
  },

  forgotPassword: (email) => {
    if (RBAC_MOCK_ENABLED) return mockForgotPassword(email);
    return apiClient.post('/auth/forgot-password', { email }).then((r) => r.data);
  },

  verifyOtp: (email, otp) => {
    if (RBAC_MOCK_ENABLED) return mockVerifyOtp(email, otp);
    return apiClient.post('/auth/verify-otp', { email, otp }).then((r) => r.data);
  },

  resendOtp: (email) => {
    if (RBAC_MOCK_ENABLED) return mockForgotPassword(email);
    return apiClient.post('/auth/resend-otp', { email }).then((r) => r.data);
  },

  resetPassword: (email, otp, password, confirmPassword) => {
    if (RBAC_MOCK_ENABLED) return mockResetPassword(email, otp, password, confirmPassword);
    return apiClient.post('/auth/reset-password', { email, otp, password, confirmPassword }).then((r) => r.data);
  },
};
