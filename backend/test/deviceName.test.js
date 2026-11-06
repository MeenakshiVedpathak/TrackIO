'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AuditLog } = require('../src/models');
const { createAuditLog } = require('../src/middlewares/auditLog');
const requestContext = require('../src/utils/requestContext');
const deviceName = require('../src/utils/deviceName');

/**
 * The audit log records a readable device name next to the device id. A browser cannot read the
 * laptop's real hostname, so the name is what the app sends (X-Device-Name) or, failing that, a label
 * built from the User-Agent.
 */

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

test('a device name is built from the User-Agent: browser + version + operating system', () => {
  assert.equal(deviceName.fromUserAgent(UA.chromeWindows), 'Chrome 130 · Windows');
  assert.equal(deviceName.fromUserAgent(UA.edgeWindows), 'Edge 130 · Windows');       // Edge is not reported as Chrome
  assert.equal(deviceName.fromUserAgent(UA.firefoxLinux), 'Firefox 131 · Linux');
  assert.equal(deviceName.fromUserAgent(UA.safariMac), 'Safari 17 · macOS');
  assert.equal(deviceName.fromUserAgent(UA.chromeAndroid), 'Chrome 130 · Android');   // Android before Linux
  assert.equal(deviceName.fromUserAgent(UA.safariIphone), 'Safari 17 · iOS');
  assert.equal(deviceName.fromUserAgent(''), null);
  assert.equal(deviceName.fromUserAgent(undefined), null);
});

test('a name the app sends is cleaned: control characters removed, trimmed, capped', () => {
  assert.equal(deviceName.sanitize('  Meenakshi\'s   Laptop \n'), 'Meenakshi\'s Laptop');
  assert.equal(deviceName.sanitize('a\u0000b\u0007c'), 'abc');
  assert.equal(deviceName.sanitize('x'.repeat(500)).length, 120);
  assert.equal(deviceName.sanitize('   '), null);
  assert.equal(deviceName.sanitize(undefined), null);
});

test('requestContext.getDeviceName: X-Device-Name wins, else the User-Agent, else null', () => {
  assert.equal(requestContext.getDeviceName({ headers: { 'x-device-name': 'Office Laptop', 'user-agent': UA.chromeWindows } }), 'Office Laptop');
  assert.equal(requestContext.getDeviceName({ headers: { 'user-agent': UA.chromeWindows } }), 'Chrome 130 · Windows');
  assert.equal(requestContext.getDeviceName({ headers: {} }), null);
  assert.equal(requestContext.getDeviceName(null), null);
});

test('createAuditLog stores the device id AND the device name of the current request', async () => {
  const original = AuditLog.create;
  let row = null;
  try {
    AuditLog.create = async (values) => { row = values; return values; };
    requestContext.enter({
      employeeId: 376, companyId: 68, userRoleName: 'Employee', connection: {},
      headers: { 'x-device-id': 'b7e2c1de-5a4f-4c1e-9a77-1f0d2c3b4a55', 'x-device-name': 'Virat Laptop', 'user-agent': UA.chromeWindows },
    });
    await createAuditLog(null, 'DELETE', 'clients', 5, { a: 1 }, null);
    assert.equal(row.device_id, 'b7e2c1de-5a4f-4c1e-9a77-1f0d2c3b4a55');
    assert.equal(row.device_name, 'Virat Laptop');

    // no X-Device-Name sent -> a name is still recorded, built from the browser
    requestContext.enter({ employeeId: 376, headers: { 'user-agent': UA.edgeWindows }, connection: {} });
    await createAuditLog(null, 'DELETE', 'clients', 6, { a: 1 }, null);
    assert.equal(row.device_name, 'Edge 130 · Windows');
    assert.equal(row.device_id, null);
  } finally {
    AuditLog.create = original;
  }
});
