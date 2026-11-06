'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Integration test (real dev DB) for the EMPLOYEE-WISE sync attribution rules of the reports in
// reportRepository.js. It creates its own fixtures for a distinctive far-future month (Sept 2032) and removes
// exactly the rows it created.
//
//   BU A, BU B (childless)   PO_A (owned by A)   PO_B (owned by B)   [CPO: a Centralised PO, if the DB has one]
//   E: mapped to BOTH A and B.   F: mapped to B only.
//   Sync of A took E: E->PO_A 10h, E->PO_B 20h (cross-BU)  [t.company_id = A]
//   Sync of B took F: F->PO_B 5h,  F->PO_A 7h  (cross-BU)  [t.company_id = B]
//   Centralised (optional): E->CPO 4h [A], F->CPO 3h [B]
//
//   SPO-wise: BU A -> PO_A = 10+7 = 17; BU B -> PO_B = 20+5 = 25 (cross-BU employees' hours included).
//   Employee-wise: BU A -> E = 30 (F absent); BU B -> F = 12 and E = 30 (E is mapped to B too).
//   Never double counted: E / F appear once even when both BUs are selected.
const { sequelize, EmployeeBusinessUnit, Timesheet } = require('../src/models');
const repo = require('../src/repositories/reportRepository');

const YEAR = 2032;
const MONTH = 9;
const START = '2032-09-01';
const END = '2032-09-30';
const PAGE = { limit: 1000, offset: 0 };
const num = (v) => parseFloat(v) || 0;
const sum = (rows, key) => rows.reduce((s, r) => s + num(r[key]), 0);
const near = (actual, expected, msg) => assert.ok(Math.abs(num(actual) - expected) < 0.011, `${msg}: got ${actual}, expected ${expected}`);

const created = { grants: [], timesheets: [] };
let fx = null;

test.before(async () => {
  const candidates = await sequelize.query(
    `SELECT c.id AS company_id, (
        SELECT sp.id FROM service_pos sp
         WHERE sp.company_id = c.id AND sp.is_deleted = false AND sp.is_centralised = false
           AND sp.status IN ('in-progress','on-hold','pending','completed')
         ORDER BY sp.id DESC LIMIT 1
      ) AS po_id
       FROM companies c
      WHERE c.is_deleted = false AND c.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM companies ch WHERE ch.parent_business_unit_id = c.id AND ch.is_deleted = false)
      ORDER BY c.id DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const withPo = candidates.filter((c) => c.po_id);
  assert.ok(withPo.length >= 2, 'dev DB needs two childless BUs that each own an eligible Service PO');
  const [A, B] = withPo;

  // E: no inactive/odd grant for A or B. F: additionally NOT mapped to A in any way.
  const eRows = await sequelize.query(
    `SELECT e.id FROM employees e
      WHERE e.status = 'active' AND e.is_deleted = false
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id
                         AND x.business_unit_id IN (:a, :b) AND x.status <> 'active')
      ORDER BY e.id DESC LIMIT 1`,
    { replacements: { a: A.company_id, b: B.company_id }, type: sequelize.QueryTypes.SELECT }
  );
  assert.ok(eRows.length, 'dev DB needs an active employee for E');
  const E = eRows[0].id;
  const fRows = await sequelize.query(
    `SELECT e.id FROM employees e
      WHERE e.status = 'active' AND e.is_deleted = false AND e.id <> :e
        AND e.company_id IS DISTINCT FROM :a
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id AND x.business_unit_id = :a)
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id
                         AND x.business_unit_id = :b AND x.status <> 'active')
      ORDER BY e.id DESC LIMIT 1`,
    { replacements: { a: A.company_id, b: B.company_id, e: E }, type: sequelize.QueryTypes.SELECT }
  );
  assert.ok(fRows.length, 'dev DB needs an active employee for F that is not mapped to BU A');
  const F = fRows[0].id;

  for (const [emp, bu] of [[E, A.company_id], [E, B.company_id], [F, B.company_id]]) {
    const [grant, wasCreated] = await EmployeeBusinessUnit.findOrCreate({
      where: { employee_id: emp, business_unit_id: bu },
      defaults: { status: 'active' },
    });
    if (wasCreated) created.grants.push(grant.id);
  }

  // A Centralised PO of the tenant of BU A (visible through buLessServicePOInTenantSql), if any.
  const { buLessServicePOInTenantSql } = require('../src/utils/servicePOTenantSql');
  const cpo = await sequelize.query(
    `SELECT sp.id FROM service_pos sp
      WHERE sp.is_deleted = false AND sp.is_centralised = true AND sp.company_id IS NULL
        AND ${buLessServicePOInTenantSql('sp', 'companyIds')}
      ORDER BY sp.id LIMIT 1`,
    { replacements: { companyIds: [A.company_id] }, type: sequelize.QueryTypes.SELECT }
  );

  fx = { A: A.company_id, B: B.company_id, PO_A: A.po_id, PO_B: B.po_id, E, F, CPO: cpo.length ? cpo[0].id : null };

  const rows = [
    [E, fx.PO_A, '2032-09-21', 10, fx.A],
    [E, fx.PO_B, '2032-09-22', 20, fx.A],
    [F, fx.PO_B, '2032-09-21', 5, fx.B],
    [F, fx.PO_A, '2032-09-22', 7, fx.B],
  ];
  if (fx.CPO) {
    rows.push([E, fx.CPO, '2032-09-23', 4, fx.A], [F, fx.CPO, '2032-09-23', 3, fx.B]);
  }
  for (const [emp, po, date, hours, companyId] of rows) {
    const t = await Timesheet.create({
      employee_id: emp, service_po_id: po, timesheet_date: date, hours_logged: hours, modified_hours: hours,
      original_hours: hours, company_id: companyId, is_publish: true, created_by: E, updated_by: E,
    });
    created.timesheets.push(t.id);
  }
});

test.after(async () => {
  if (created.timesheets.length) await Timesheet.destroy({ where: { id: created.timesheets } }).catch(() => {});
  if (created.grants.length) await EmployeeBusinessUnit.destroy({ where: { id: created.grants } }).catch(() => {});
  await sequelize.close();
});

const cpoHours = (emp) => ({ [fx.E]: 4, [fx.F]: 3 }[emp] || 0);

// ---------------------------------------------------------------- SPO-wise
test('SPO-wise: Service PO Utilisation counts every employee (cross-BU included) on the BU\'s own PO', async () => {
  const a = await repo.getServicePOUtilisation({ companyIds: [fx.A], poId: fx.PO_A, startDate: START, endDate: END, ...PAGE });
  assert.equal(a.rows.length, 1);
  near(a.rows[0].actual_hours, 17, 'PO_A under BU A = E10 + F7');
  near(a.rows[0].original_actual_hours, 17, 'original twin consistent');
  // distinct_resources is not date-windowed (pre-existing), so other months' staff may add to it.
  assert.ok(parseInt(a.rows[0].distinct_resources, 10) >= 2);

  const b = await repo.getServicePOUtilisation({ companyIds: [fx.B], poId: fx.PO_B, startDate: START, endDate: END, ...PAGE });
  near(b.rows[0].actual_hours, 25, 'PO_B under BU B = E20 (t.company_id = A!) + F5');
});

test('SPO-wise: Client Service PO Hours / Service PO Hours Trend / Client-wise analytics', async () => {
  for (const [bu, po, expected] of [[fx.A, fx.PO_A, 17], [fx.B, fx.PO_B, 25]]) {
    const r = await repo.getClientServicePOHours({ companyIds: [bu], startDate: START, endDate: END, poId: po });
    assert.equal(r.length, 1);
    near(r[0].hours, expected, `getClientServicePOHours ${po}`);
    near(r[0].original_hours, expected, 'original twin');

    const trend = await repo.getServicePOHoursTrend({ companyIds: [bu], startDate: START, endDate: END, poId: po });
    assert.equal(trend.length, 1);
    near(trend[0].total_hours, expected, `getServicePOHoursTrend ${po}`);

    const cw = await repo.getClientWiseAnalyticsHours({ companyIds: [bu], startDate: START, endDate: END, poId: po });
    assert.equal(cw.length, 1);
    near(cw[0].total_hours, expected, `getClientWiseAnalyticsHours ${po}`);
    assert.equal(parseInt(cw[0].total_projects, 10), 1);
  }
  // A PO of BU B is NOT in BU A's scope, whoever logged on it.
  const none = await repo.getClientServicePOHours({ companyIds: [fx.A], startDate: START, endDate: END, poId: fx.PO_B });
  assert.equal(none.length, 0);
});

test('SPO-wise: selecting both BUs counts each PO once (no double counting)', async () => {
  const r = await repo.getClientServicePOHours({ companyIds: [fx.A, fx.B], startDate: START, endDate: END, poId: fx.PO_A });
  assert.equal(r.length, 1);
  near(r[0].hours, 17, 'PO_A, scope A+B');
});

test('SPO-wise: Centralised PO only counts the scope\'s own BU share', { skip: false }, async (t) => {
  if (!fx.CPO) return t.skip('no Centralised PO in the dev DB');
  const a = await repo.getClientServicePOHours({ companyIds: [fx.A], startDate: START, endDate: END, poId: fx.CPO });
  assert.equal(a.length, 1);
  near(a[0].hours, cpoHours(fx.E), 'BU A sees only E\'s 4h (t.company_id = A), not F\'s 3h');
  const both = await repo.getClientServicePOHours({ companyIds: [fx.A, fx.B], startDate: START, endDate: END, poId: fx.CPO });
  near(both[0].hours, 7, 'A+B = 4 + 3');
});

// ---------------------------------------------------------------- Employee-wise
test('Employee-wise: Timesheet Summary lists ALL of the mapped employee\'s rows incl. cross-BU', async () => {
  const q = (companyIds, employeeId) => repo.getTimesheetSummary({ companyIds, employeeId, startDate: START, endDate: END, ...PAGE });
  const eA = await q([fx.A], fx.E);
  near(sum(eA.rows, 'hours_logged'), 30 + (fx.CPO ? 4 : 0), 'E under A');
  assert.equal(eA.count, 2 + (fx.CPO ? 1 : 0));
  near(sum(eA.rows, 'original_hours_logged'), 30 + (fx.CPO ? 4 : 0), 'original twin');

  const fA = await q([fx.A], fx.F);
  assert.equal(fA.count, 0, 'F is not mapped to A -> absent from A\'s report');

  const fB = await q([fx.B], fx.F);
  near(sum(fB.rows, 'hours_logged'), 12 + (fx.CPO ? 3 : 0), 'F under B (PO_B 5 + cross-BU PO_A 7)');
  const eB = await q([fx.B], fx.E);
  near(sum(eB.rows, 'hours_logged'), 30 + (fx.CPO ? 4 : 0), 'E is mapped to B too -> shows under B although synced from A');

  const eBoth = await q([fx.A, fx.B], fx.E);
  assert.equal(eBoth.count, 2 + (fx.CPO ? 1 : 0), 'E once, not duplicated across A+B');
  const fBoth = await q([fx.A, fx.B], fx.F);
  assert.equal(fBoth.count, 2 + (fx.CPO ? 1 : 0), 'F once');
});

test('Employee-wise: Employee Utilization Summary', async () => {
  const q = (companyIds, employeeId) => repo.getEmployeeUtilizationSummary({ month: MONTH, year: YEAR, companyIds, employeeId, ...PAGE });
  const eA = await q([fx.A], fx.E);
  assert.equal(eA.rows.length, 1);
  near(num(eA.rows[0].billable_total) + num(eA.rows[0].non_billable_total), 30 + (fx.CPO ? 4 : 0), 'E under A');
  assert.equal((await q([fx.A], fx.F)).rows.length, 0);
  const fB = await q([fx.B], fx.F);
  near(num(fB.rows[0].billable_total) + num(fB.rows[0].non_billable_total), 12 + (fx.CPO ? 3 : 0), 'F under B');
  const eBoth = await q([fx.A, fx.B], fx.E);
  assert.equal(eBoth.rows.length, 1);
  near(num(eBoth.rows[0].billable_total) + num(eBoth.rows[0].non_billable_total), 30 + (fx.CPO ? 4 : 0), 'E once in A+B');
});

test('Employee-wise: Resource Allocation (employee x PO pairs)', async () => {
  const q = (companyIds, employeeId) => repo.getResourceAllocation({ companyIds, employeeId, month: MONTH, year: YEAR, ...PAGE });
  const eA = await q([fx.A], fx.E);
  near(sum(eA.rows, 'total_hours_logged'), 30 + (fx.CPO ? 4 : 0), 'E under A');
  assert.equal(eA.count, 2 + (fx.CPO ? 1 : 0));
  assert.equal((await q([fx.A], fx.F)).count, 0);
  near(sum((await q([fx.B], fx.F)).rows, 'total_hours_logged'), 12 + (fx.CPO ? 3 : 0), 'F under B');
  assert.equal((await q([fx.A, fx.B], fx.E)).count, 2 + (fx.CPO ? 1 : 0), 'no duplicate pair rows');
});

test('Employee-wise: Resource Utilization / Monthly / Resource-Monthly utilization pivots', async () => {
  const total = (rows) => sum(rows, 'hours');
  const base = { month: MONTH, year: YEAR, ...PAGE };
  for (const fn of ['getResourceUtilization', 'getMonthlyResourceUtilization', 'getResourceMonthlyUtilization']) {
    const eA = await repo[fn]({ ...base, companyIds: [fx.A], employeeId: fx.E });
    near(total(eA.rows), 30 + (fx.CPO ? 4 : 0), `${fn}: E under A incl. cross-BU`);
    near(sum(eA.rows, 'original_hours'), 30 + (fx.CPO ? 4 : 0), `${fn}: original twin`);
    assert.equal(eA.count, 1, `${fn}: E counted once`);

    const fA = await repo[fn]({ ...base, companyIds: [fx.A], employeeId: fx.F });
    assert.equal(fA.count, 0, `${fn}: F absent under A`);
    const fB = await repo[fn]({ ...base, companyIds: [fx.B], employeeId: fx.F });
    near(total(fB.rows), 12 + (fx.CPO ? 3 : 0), `${fn}: F under B`);
    const eB = await repo[fn]({ ...base, companyIds: [fx.B], employeeId: fx.E });
    near(total(eB.rows), 30 + (fx.CPO ? 4 : 0), `${fn}: E under B (mapped to both)`);

    const eBoth = await repo[fn]({ ...base, companyIds: [fx.A, fx.B], employeeId: fx.E });
    assert.equal(eBoth.count, 1, `${fn}: E once for A+B`);
    near(total(eBoth.rows), 30 + (fx.CPO ? 4 : 0), `${fn}: no double count for A+B`);
    if (eBoth.summary) assert.equal(eBoth.summary.employee_count, 1);
  }
});

test('Employee-wise: Resource x Project utilization', async () => {
  const base = { month: MONTH, year: YEAR, ...PAGE };
  const eA = await repo.getResourseProjectUtilizationReport({ ...base, companyIds: [fx.A], employeeIds: [fx.E] });
  near(sum(eA.rows, 'project_hours'), 30 + (fx.CPO ? 4 : 0), 'E under A');
  assert.equal(eA.count, 1);
  const fA = await repo.getResourseProjectUtilizationReport({ ...base, companyIds: [fx.A], employeeIds: [fx.F] });
  assert.equal(fA.count, 0);
  const fB = await repo.getResourseProjectUtilizationReport({ ...base, companyIds: [fx.B], employeeIds: [fx.F] });
  near(sum(fB.rows, 'project_hours'), 12 + (fx.CPO ? 3 : 0), 'F under B');
  const eBoth = await repo.getResourseProjectUtilizationReport({ ...base, companyIds: [fx.A, fx.B], employeeIds: [fx.E] });
  assert.equal(eBoth.count, 1);
  near(sum(eBoth.rows, 'project_hours'), 30 + (fx.CPO ? 4 : 0), 'A+B once');
});

test('Employee-wise: trend reports (utilization trend, bench detail, resource trend, hours by category)', async () => {
  const f = (companyIds, employeeId) => ({ companyIds, employeeId, startDate: START, endDate: END });
  const withCpo = (n, c) => n + (fx.CPO ? c : 0);

  const ut = await repo.getMonthlyUtilizationTrend(f([fx.A], fx.E));
  near(sum(ut, 'total_hours'), withCpo(30, 4), 'utilization trend E under A');
  assert.equal(ut[0].employee_count, 1);
  const utBoth = await repo.getMonthlyUtilizationTrend(f([fx.A, fx.B], fx.E));
  near(sum(utBoth, 'total_hours'), withCpo(30, 4), 'utilization trend A+B once');
  assert.equal(utBoth[0].employee_count, 1);
  assert.equal((await repo.getMonthlyUtilizationTrend(f([fx.A], fx.F))).length, 0);
  near(sum(await repo.getMonthlyUtilizationTrend(f([fx.B], fx.F)), 'total_hours'), withCpo(12, 3), 'utilization trend F under B');

  near(sum(await repo.getEmployeeBenchDetailReport(f([fx.A], fx.E)), 'hours'), withCpo(30, 4), 'bench detail E under A');
  assert.equal((await repo.getEmployeeBenchDetailReport(f([fx.A], fx.F))).length, 0);
  near(sum(await repo.getEmployeeBenchDetailReport(f([fx.B], fx.F)), 'hours'), withCpo(12, 3), 'bench detail F under B');
  near(sum(await repo.getEmployeeBenchDetailReport(f([fx.A, fx.B], fx.E)), 'hours'), withCpo(30, 4), 'bench detail A+B once');

  near(sum(await repo.getResourceUtilizationTrend(f([fx.A], fx.E)), 'total_hours'), withCpo(30, 4), 'resource trend E under A');
  near(sum(await repo.getResourceUtilizationTrend(f([fx.B], fx.E)), 'total_hours'), withCpo(30, 4), 'resource trend E under B');
  assert.equal((await repo.getResourceUtilizationTrend(f([fx.A], fx.F))).length, 0);

  near(sum(await repo.getMonthlyHoursByCategory(f([fx.A], fx.E)), 'hours'), withCpo(30, 4), 'hours by category E under A');
  near(sum(await repo.getMonthlyHoursByCategory(f([fx.A, fx.B], fx.E)), 'hours'), withCpo(30, 4), 'hours by category A+B once');
  near(sum(await repo.getMonthlyHoursByCategory(f([fx.A, fx.B], fx.E)), 'original_hours'), withCpo(30, 4), 'original twin');
});
