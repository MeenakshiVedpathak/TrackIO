'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Patch sequelize.query BEFORE exercising the repository, so we can inspect the SQL it builds
// without needing any particular data in the database.
const { sequelize } = require('../src/models');
const reportRepo = require('../src/repositories/reportRepository');
const managementRepo = require('../src/repositories/managementReportRepository');

const originalQuery = sequelize.query.bind(sequelize);
let captured = [];

test.before(() => {
  sequelize.query = async (sql) => {
    captured.push(String(sql));
    return [{ total: '0', count: '0' }];
  };
});

test.after(async () => {
  sequelize.query = originalQuery;
  await sequelize.close();
});

test.beforeEach(() => { captured = []; });

const GUARD = 'spc.is_centralised = true';
const COMMON = { month: 8, year: 2026, companyIds: [27], centralisedOwnerIds: [3], limit: 10, offset: 0 };

// A Centralised PO is visible to every BU of the tenant, but employees of OTHER BUs log hours on it.
// Each BU's report must only count its own BU's timesheets against it.

test('Invoice PO Summary: before-month and current-month hours are limited to the caller BU scope for Centralised POs', async () => {
  await reportRepo.getInvoicePOSummary(COMMON);
  const sql = captured.find((s) => s.includes('hours_delivered_current_month'));
  assert.ok(sql, 'data query was issued');
  assert.equal(sql.split(GUARD).length - 1, 2, 'guard appears in both the prev and curr hour subqueries');
  assert.match(sql, /t\.company_id IN \(/);
});

test('Service PO Summary: same Centralised-PO hours scoping', async () => {
  await reportRepo.getServicePOSummary(COMMON);
  const sql = captured.find((s) => s.includes('hours_delivered_before_month'));
  assert.ok(sql);
  assert.equal(sql.split(GUARD).length - 1, 2);
});

test('Service PO Utilisation: timesheets are joined with the Centralised-PO scope', async () => {
  await reportRepo.getServicePOUtilisation({ ...COMMON, startDate: '2026-08-01', endDate: '2026-08-31' });
  const sql = captured.find((s) => s.includes('actual_hours'));
  assert.ok(sql);
  assert.ok(sql.includes(GUARD));
});

test('Management reports: Delivery Head Performance and Timeline Risk hours use the same scoping', async () => {
  await managementRepo.getDeliveryHeadPerformance(COMMON);
  const dh = captured.filter((s) => s.includes(GUARD));
  assert.ok(dh.length > 0, 'delivery head hours are scoped');
  captured = [];
  await managementRepo.getServicePOTimelineRiskRaw({ ...COMMON, asOfDate: '2026-08-31' });
  assert.ok(captured.some((s) => s.includes(GUARD)), 'timeline risk hours are scoped');
});
