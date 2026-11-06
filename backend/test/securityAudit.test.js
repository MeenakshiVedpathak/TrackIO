'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AuditLog, sequelize } = require('../src/models');
const securityAuditService = require('../src/services/securityAuditService');
const auditLogReportService = require('../src/services/auditLogReportService');
const authRepository = require('../src/repositories/authRepository');
const authService = require('../src/services/authService');

/**
 * Security events in the audit log — only a PATTERN is recorded, never a single mistake:
 *   LOGIN_FAILED  on the 3rd wrong password / unknown email (and every further 3rd) within the window
 *   ACCESS_DENIED on the 2nd attempt at the same unmapped form (and every further 2nd)
 * DB-free: the attempt counter (security_attempts) is simulated by stubbing sequelize.query.
 */

/** Simulates security_attempts: INSERT adds a row, SELECT COUNT counts rows with the same kind/subject/detail. */
function withFakeAttempts(run) {
  const originalQuery = sequelize.query;
  const originalCreate = AuditLog.create;
  const attempts = [];
  const audited = [];
  sequelize.query = async (sql, options = {}) => {
    const r = options.replacements || {};
    if (/INSERT INTO security_attempts/.test(sql)) {
      attempts.push({ kind: r.kind, subject: r.subject, detail: r.detail });
      return [];
    }
    if (/SELECT COUNT\(\*\)::int AS attempts/.test(sql)) {
      const count = attempts.filter((a) => a.kind === r.kind && a.subject === r.subject && (r.detail == null || a.detail === r.detail)).length;
      return [{ attempts: count }];
    }
    if (/DELETE FROM security_attempts WHERE kind = 'LOGIN_FAILED'/.test(sql)) {
      for (let i = attempts.length - 1; i >= 0; i--) if (attempts[i].kind === 'LOGIN_FAILED' && attempts[i].subject === r.subject) attempts.splice(i, 1);
      return [];
    }
    return [];
  };
  AuditLog.create = async (values) => { audited.push(values); return values; };
  return Promise.resolve(run({ attempts, audited })).finally(() => {
    sequelize.query = originalQuery;
    AuditLog.create = originalCreate;
  });
}

test('3 wrong passwords: nothing is logged for the 1st and 2nd, a LOGIN_FAILED row on the 3rd', () => withFakeAttempts(async ({ audited }) => {
  const employee = { id: 376 };
  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(await securityAuditService.recordFailedLogin({ email: 'Virat@Gmail.com', employee, deviceId: 'device-test-0001', companyId: 68 }));
  }
  assert.deepEqual(results.map((r) => r.logged), [false, false, true]);
  assert.equal(audited.length, 1);
  assert.equal(audited[0].action, 'LOGIN_FAILED');
  assert.equal(audited[0].user_id, 376);
  assert.equal(audited[0].company_id, 68);
  assert.equal(audited[0].device_id, 'device-test-0001');
  assert.equal(audited[0].new_values.attempts, 3);
  assert.equal(audited[0].new_values.reason, 'Wrong password');
  assert.equal(audited[0].new_values.email, 'virat@gmail.com');   // case-insensitive subject
}));

test('continued guessing keeps being recorded on every further 3rd attempt (6th, 9th)', () => withFakeAttempts(async ({ audited }) => {
  for (let i = 0; i < 6; i++) await securityAuditService.recordFailedLogin({ email: 'a@b.com', employee: { id: 1 } });
  assert.equal(audited.length, 2);
}));

test('an unknown email is counted too, logged with no user and a "Unknown email" reason', () => withFakeAttempts(async ({ audited }) => {
  for (let i = 0; i < 3; i++) await securityAuditService.recordFailedLogin({ email: 'nobody@nowhere.com', employee: null });
  assert.equal(audited.length, 1);
  assert.equal(audited[0].user_id, null);
  assert.equal(audited[0].new_values.reason, 'Unknown email');
}));

test('a password typed into the email box is never stored', () => withFakeAttempts(async ({ audited }) => {
  for (let i = 0; i < 3; i++) await securityAuditService.recordFailedLogin({ email: 'MyS3cretPassw0rd!', employee: null });
  assert.equal(audited.length, 1);
  assert.equal(audited[0].new_values.email, null);
  assert.equal(securityAuditService.safeEmail('MyS3cretPassw0rd!'), null);
  assert.equal(securityAuditService.safeEmail(' Rohit@Example.com '), 'rohit@example.com');
}));

test('a successful login resets the count', () => withFakeAttempts(async ({ audited }) => {
  await securityAuditService.recordFailedLogin({ email: 'virat@gmail.com', employee: { id: 376 } });
  await securityAuditService.recordFailedLogin({ email: 'virat@gmail.com', employee: { id: 376 } });
  await securityAuditService.clearFailedLogins('virat@gmail.com');
  const next = await securityAuditService.recordFailedLogin({ email: 'virat@gmail.com', employee: { id: 376 } });
  assert.equal(next.attempts, 1);
  assert.equal(audited.length, 0);
}));

test('unmapped form: the 1st attempt is not logged, the 2nd is (and every further 2nd)', () => withFakeAttempts(async ({ audited }) => {
  const params = { employee: { id: 376 }, roleName: 'Employee', companyId: 68, formId: 116, formName: 'Audit Logs', path: '/audit-logs', deviceId: 'device-test-0001' };
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await securityAuditService.recordAccessDenied(params));
  assert.deepEqual(results.map((r) => r.logged), [false, true, false, true]);
  assert.equal(audited.length, 2);
  assert.equal(audited[0].action, 'ACCESS_DENIED');
  assert.equal(audited[0].user_id, 376);
  assert.equal(audited[0].actor_role, 'Employee');
  assert.equal(audited[0].device_id, 'device-test-0001');
  assert.equal(audited[0].entity_id, 116);
  assert.equal(audited[0].new_values.form_name, 'Audit Logs');
}));

test('each form has its own count, and one user\'s attempts never count for another user', () => withFakeAttempts(async ({ audited }) => {
  await securityAuditService.recordAccessDenied({ employee: { id: 1 }, formName: 'Roles', path: '/roles' });
  await securityAuditService.recordAccessDenied({ employee: { id: 1 }, formName: 'Forms', path: '/forms' });
  await securityAuditService.recordAccessDenied({ employee: { id: 2 }, formName: 'Roles', path: '/roles' });
  assert.equal(audited.length, 0);
}));

test('auditing never breaks the request: a counter/database failure is swallowed', async () => {
  const originalQuery = sequelize.query;
  try {
    sequelize.query = async () => { throw new Error('db down'); };
    const failed = await securityAuditService.recordFailedLogin({ email: 'a@b.com', employee: null });
    const denied = await securityAuditService.recordAccessDenied({ employee: { id: 1 }, formName: 'Roles' });
    assert.equal(failed.logged, false);
    assert.equal(denied.logged, false);
  } finally {
    sequelize.query = originalQuery;
  }
});

test('login: an unknown email and a wrong password both feed the failed-login counter', async () => {
  const originalFind = authRepository.findEmployeeByEmail;
  const original = securityAuditService.recordFailedLogin;
  const calls = [];
  try {
    securityAuditService.recordFailedLogin = async (args) => { calls.push(args); return { attempts: 1, logged: false }; };

    authRepository.findEmployeeByEmail = async () => null;
    await assert.rejects(authService.login('ghost@nowhere.com', 'x', '1.1.1.1', 'ua'), (err) => err.statusCode === 401 || err.statusCode === 404);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].employee, null);
    assert.equal(calls[0].email, 'ghost@nowhere.com');

    authRepository.findEmployeeByEmail = async () => ({
      id: 5, email: 'a@b.com', password: 'hash', status: 'active', is_deleted: false,
      roles: [{ id: 1, role_name: 'Employee', status: 'active', hierarchy_rank: 8, EmployeeRole: { status: 'active' } }], businessUnits: [],
      validatePassword: async () => false,
    });
    await assert.rejects(authService.login('a@b.com', 'wrong', '1.1.1.1', 'ua'), (err) => err.statusCode === 401);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].employee.id, 5);
  } finally {
    authRepository.findEmployeeByEmail = originalFind;
    securityAuditService.recordFailedLogin = original;
  }
});

test('the audit screen words the two new events in plain English', () => {
  const failed = auditLogReportService.toRecord({
    id: 1, created_at: new Date(), action: 'LOGIN_FAILED', entity_type: 'employees', entity_id: null,
    actor_id: null, actor_name: null, new_values: { attempts: 3, window_minutes: 15, reason: 'Unknown email', email: 'x@y.com' },
  });
  assert.equal(failed.actor_name, 'Unknown user (x@y.com)');
  assert.equal(failed.action_label, 'Failed login');
  assert.equal(failed.summary, '3 failed login attempts in 15 minutes — Unknown email');

  const denied = auditLogReportService.toRecord({
    id: 2, created_at: new Date(), action: 'ACCESS_DENIED', entity_type: 'form_master', entity_id: 116,
    actor_id: 376, actor_name: 'Virat kohli', new_values: { form_name: 'Audit Logs', path: '/audit-logs', attempts: 2 },
  });
  assert.equal(denied.action_label, 'Access denied');
  assert.equal(denied.summary, 'Tried to open "Audit Logs" without access (2 attempts)');
});
