'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AuditLog, sequelize } = require('../src/models');
const { createAuditLog } = require('../src/middlewares/auditLog');
const requestContext = require('../src/utils/requestContext');
const deviceRegistryService = require('../src/services/deviceRegistryService');
const auditLogReportService = require('../src/services/auditLogReportService');
const { generateTokens, verifyToken } = require('../src/config/jwt');
const { auditLogQuerySchema, auditDeviceQuerySchema } = require('../src/validations/auditLogValidation');

/**
 * Tracing activity to a login SESSION and to the DEVICES a person uses:
 *  - the access token carries the session id (`sid`); every audit row stores it
 *  - a person's devices are remembered at login; a device they never used before is flagged (a new
 *    browser profile or an incognito window always looks new)
 * DB-free: the device table is simulated by stubbing sequelize.query.
 */

test('the access token carries the login session id and keeps it across a token rotation', () => {
  const first = generateTokens({ id: 5, email: 'a@b.com', roleIds: [1], roleNames: ['Employee'], hierarchyRank: 8, activeRoleId: 1 });
  assert.equal(verifyToken(first.accessToken).sid, first.familyId);
  const rotated = generateTokens({ id: 5, roleIds: [1] }, { familyId: first.familyId });
  assert.equal(verifyToken(rotated.accessToken).sid, first.familyId);
  assert.notEqual(rotated.jti, first.jti);
});

test('createAuditLog stores the session id of the current request (or an explicit one for the LOGIN row)', async () => {
  const original = AuditLog.create;
  let row = null;
  try {
    AuditLog.create = async (values) => { row = values; return values; };
    requestContext.enter({ employeeId: 376, sessionId: 'sess-from-token-0001', headers: {}, connection: {} });
    await createAuditLog(null, 'DELETE', 'clients', 5, { a: 1 }, null);
    assert.equal(row.session_id, 'sess-from-token-0001');
    await createAuditLog(376, 'LOGIN', 'employees', 376, null, null, null, { sessionId: 'family-login-0002' });
    assert.equal(row.session_id, 'family-login-0002');
    requestContext.enter({ employeeId: 376, headers: {}, connection: {} });   // token issued before `sid` existed
    await createAuditLog(null, 'DELETE', 'clients', 6, { a: 1 }, null);
    assert.equal(row.session_id, null);
  } finally {
    AuditLog.create = original;
  }
});

/** Simulates user_devices for one person. */
function withFakeDevices(run) {
  const original = sequelize.query;
  const devices = new Set();
  sequelize.query = async (sql, options = {}) => {
    const r = options.replacements || {};
    if (/SELECT COUNT\(\*\)::int AS known FROM user_devices/.test(sql)) return [{ known: devices.size }];
    if (/INSERT INTO user_devices/.test(sql)) {
      const inserted = !devices.has(r.deviceId);
      devices.add(r.deviceId);
      return [{ inserted }];
    }
    return [];
  };
  return Promise.resolve(run()).finally(() => { sequelize.query = original; });
}

test('devices: the first device is not flagged; the same device again is not new; a different device IS new', () => withFakeDevices(async () => {
  const login = (deviceId) => deviceRegistryService.registerLogin({ employeeId: 376, deviceId, deviceName: 'Chrome 130 · Windows', userAgent: 'ua', ip: '10.0.0.5' });
  assert.deepEqual(await login('device-aaaaaaaa-1'), { tracked: true, isNewDevice: false, isFirstDevice: true });
  assert.deepEqual(await login('device-aaaaaaaa-1'), { tracked: true, isNewDevice: false, isFirstDevice: false });
  assert.deepEqual(await login('incognito-bbbbbbbb-2'), { tracked: true, isNewDevice: true, isFirstDevice: false });
}));

test('devices: no device id sent -> nothing is tracked, nothing is flagged; a database failure never breaks login', async () => {
  assert.deepEqual(await deviceRegistryService.registerLogin({ employeeId: 376, deviceId: null }), { tracked: false, isNewDevice: false, isFirstDevice: false });
  const original = sequelize.query;
  try {
    sequelize.query = async () => { throw new Error('db down'); };
    assert.deepEqual(await deviceRegistryService.registerLogin({ employeeId: 376, deviceId: 'device-aaaaaaaa-1' }), { tracked: false, isNewDevice: false, isFirstDevice: false });
  } finally {
    sequelize.query = original;
  }
});

test('the audit screen shows the session, the login IP + browser, and a NEW device login in words', () => {
  const loginRow = auditLogReportService.toRecord({
    id: 1, created_at: new Date(), action: 'LOGIN', entity_type: 'employees', entity_id: 376,
    actor_id: 376, actor_name: 'Virat kohli', session_id: 'fam-1', login_ip: '10.0.0.9',
    login_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56',
    new_values: { role: 'Employee', new_device: true },
  });
  assert.equal(loginRow.summary, 'Signed in from a NEW device');
  assert.equal(loginRow.new_device, true);
  assert.equal(loginRow.session_id, 'fam-1');
  assert.equal(loginRow.login_ip, '10.0.0.9');
  assert.equal(loginRow.login_browser, 'Edge 130 · Windows');

  const otherRow = auditLogReportService.toRecord({
    id: 2, created_at: new Date(), action: 'DELETE', entity_type: 'clients', entity_id: 3, actor_id: 376, actor_name: 'Virat kohli',
    session_id: 'fam-1', old_values: { client_name: 'Acme' }, new_values: null,
  });
  assert.equal(otherRow.new_device, null);          // only meaningful on a LOGIN row
  assert.equal(otherRow.session_id, 'fam-1');       // ...but every row can be traced to its session
});

test('query validation: session_id / new_device_only filters; the devices list has its own filters', () => {
  assert.equal(auditLogQuerySchema.validate({ session_id: 'abc-123', new_device_only: 'true' }).error, undefined);
  assert.equal(auditDeviceQuerySchema.validate({ actor_ids: '1,2', search: 'laptop', limit: '20' }).error, undefined);
  assert.ok(auditDeviceQuerySchema.validate({ actor_ids: 'x' }).error);
});
