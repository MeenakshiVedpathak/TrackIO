'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Integration test (real dev DB) for the attribution rules of the EMPLOYEE-WISE "Sync Employee Work Logs":
// a synced timesheet row carries company_id = the SYNC BU (a BU the employee is mapped to), not the Service PO's BU.
//   SPO-wise reports      -> hours of ALL employees on the BU's POs (cross-BU included), regardless of t.company_id
//   employee-wise reports -> every row of every employee MAPPED to the BU (cross-BU / Centralised included)
//   BU-wise reports       -> hours grouped by t.company_id (sync BU), headcount by mapping
// Fixtures live in June 2032 and are removed in `after` (only rows this file created).
const { sequelize, EmployeeBusinessUnit, EmployeeServicePOMapping, Timesheet } = require('../src/models');
const mgmt = require('../src/repositories/managementReportRepository');
const util = require('../src/repositories/utilisationReportRepository');

const YEAR = 2032;
const MONTH = 6;
const START = '2032-06-01';
const END = '2032-06-30';

const created = { grants: [], tsIds: [], mappings: [] };
let fx = null;
let creatorId;

const num = (v) => parseFloat(v) || 0;
const approx = (a, b, msg) => assert.ok(Math.abs(num(a) - b) < 0.011, `${msg}: expected ${b}, got ${a}`);

async function addTs(employeeId, poId, day, hours, companyId) {
  const row = await Timesheet.create({
    employee_id: employeeId,
    service_po_id: poId,
    timesheet_date: `${YEAR}-06-${String(day).padStart(2, '0')}`,
    hours_logged: hours,
    modified_hours: hours,
    original_hours: hours,
    company_id: companyId,
    is_publish: true,
    created_by: creatorId,
    updated_by: creatorId,
  });
  created.tsIds.push(row.id);
  return row.id;
}

async function dropTs(ids) {
  await Timesheet.destroy({ where: { id: ids } });
  created.tsIds = created.tsIds.filter((i) => !ids.includes(i));
}

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

async function ensureGrant(employeeId, buId) {
  const [grant, wasCreated] = await EmployeeBusinessUnit.findOrCreate({
    where: { employee_id: employeeId, business_unit_id: buId },
    defaults: { status: 'active' },
  });
  if (!wasCreated && grant.status !== 'active') throw new Error('fixture employee has an inactive grant; pick another');
  if (wasCreated) created.grants.push(grant.id);
}

test.before(async () => {
  const candidates = await q(
    `SELECT c.id AS company_id, (
        SELECT sp.id FROM service_pos sp
         WHERE sp.company_id = c.id AND sp.is_deleted = false AND sp.is_centralised = false
           AND sp.status IN ('in-progress','on-hold','pending','completed')
         ORDER BY sp.id LIMIT 1) AS po_id
       FROM companies c
      WHERE c.is_deleted = false AND c.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM companies ch WHERE ch.parent_business_unit_id = c.id AND ch.is_deleted = false)
      ORDER BY c.id`
  );
  const withPo = candidates.filter((c) => c.po_id);
  assert.ok(withPo.length >= 2, 'dev DB needs two childless BUs that each own a Service PO');
  const [A, B] = withPo;

  // E: mapped to BOTH (no inactive grants to either).
  const [E] = await q(
    `SELECT e.id FROM employees e
      WHERE e.status = 'active' AND e.is_deleted = false
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id
                          AND x.business_unit_id IN (:a, :b) AND x.status <> 'active')
      ORDER BY e.id LIMIT 1`, { a: A.company_id, b: B.company_id });
  assert.ok(E, 'needs an active employee for E');
  // F: NO active mapping to A (neither grant nor legacy company_id), not E.
  const [F] = await q(
    `SELECT e.id FROM employees e
      WHERE e.status = 'active' AND e.is_deleted = false AND e.id <> :e
        AND e.company_id IS DISTINCT FROM :a
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id AND x.business_unit_id = :a)
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id AND x.business_unit_id = :b AND x.status <> 'active')
      ORDER BY e.id LIMIT 1`, { e: E.id, a: A.company_id, b: B.company_id });
  assert.ok(F, 'needs an active employee for F');
  creatorId = E.id;

  await ensureGrant(E.id, A.company_id);
  await ensureGrant(E.id, B.company_id);
  await ensureGrant(F.id, B.company_id);
  fx = { A, B, E: E.id, F: F.id, poA: A.po_id, poB: B.po_id };

  // Sync of A took E (own PO 10h + cross-BU PO 20h), stamped A. Sync of B took F (own 5h + cross-BU 7h), stamped B.
  await addTs(fx.E, fx.poA, 1, 10, A.company_id);
  await addTs(fx.E, fx.poB, 2, 20, A.company_id);
  await addTs(fx.F, fx.poB, 3, 5, B.company_id);
  await addTs(fx.F, fx.poA, 4, 7, B.company_id);
});

test.after(async () => {
  if (created.tsIds.length) await Timesheet.destroy({ where: { id: created.tsIds } }).catch(() => {});
  if (fx) {
    await Timesheet.destroy({
      where: { employee_id: [fx.E, fx.F], timesheet_date: { [Op.gte]: START, [Op.lte]: END } },
    }).catch(() => {});
  }
  if (created.mappings.length) await EmployeeServicePOMapping.destroy({ where: { id: created.mappings } }).catch(() => {});
  if (created.grants.length) await EmployeeBusinessUnit.destroy({ where: { id: created.grants } }).catch(() => {});
  await sequelize.close();
});

const staffing = (poId, companyIds) => mgmt.getResourceStaffingPlanAccuracy({
  month: MONTH, year: YEAR, poId, companyIds, limit: 100, offset: 0,
});

test('SPO-wise (staffing plan accuracy, actual side): BU A PO = E10 + F7, BU B PO = E20 + F5 — cross-BU hours count under the PO owner BU', async () => {
  const { A, B, E, F, poA, poB } = fx;
  const a = await staffing(poA, [A.company_id]);
  const byEmpA = Object.fromEntries(a.rows.map((r) => [r.employee_id, num(r.actual_hours)]));
  approx(byEmpA[E], 10, 'E on PO_A');
  approx(byEmpA[F], 7, 'F (cross-BU, stamped B) on PO_A');
  approx(a.rows.reduce((s, r) => s + num(r.actual_hours), 0), 17, 'PO_A total');

  const b = await staffing(poB, [B.company_id]);
  const byEmpB = Object.fromEntries(b.rows.map((r) => [r.employee_id, num(r.actual_hours)]));
  approx(byEmpB[E], 20, 'E cross-BU hours stamped A still show on B\'s PO_B');
  approx(byEmpB[F], 5, 'F on PO_B');
  approx(b.rows.reduce((s, r) => s + num(r.actual_hours), 0), 25, 'PO_B total');
});

test('SPO-wise: Service PO profitability hours_delivered / Service line mix / timeline raw agree with the PO-owner rule', async () => {
  const { A, B, poA, poB } = fx;
  for (const [bu, po, expected] of [[A, poA, 17], [B, poB, 25]]) {
    const prof = await mgmt.getServicePOProfitability({ month: MONTH, year: YEAR, poId: po, isBillable: undefined, companyIds: [bu.company_id], limit: 10, offset: 0, status: 'all' });
    // Profitability only lists billable POs; when the fixture PO is billable its hours must match.
    const row = prof.rows.find((r) => r.service_po_id === po);
    if (row) approx(row.hours_delivered, expected, `profitability hours PO ${po}`);

    const tl = await mgmt.getServicePOTimelineRiskRaw({
      companyIds: [bu.company_id], poId: po, status: 'all', limit: 10, offset: 0,
      asOfDate: END, monthStart: START, monthEnd: END,
    });
    const trow = tl.rows.find((r) => r.service_po_id === po);
    if (trow) approx(trow.hours_in_month, expected, `timeline hours_in_month PO ${po}`);

    const dh = await mgmt.getDeliveryHeadPerformance({ month: MONTH, year: YEAR, companyIds: [bu.company_id], limit: 500, offset: 0 });
    assert.ok(Array.isArray(dh.rows)); // runs; per-PO attribution is shared with the CTE above

    const mix = await mgmt.getServiceLineBusinessMix({ month: MONTH, year: YEAR, companyIds: [bu.company_id] });
    const mixHours = mix.rows.reduce((s, r) => s + num(r.hours_delivered), 0);
    approx(mixHours, expected, `service line mix hours for BU ${bu.company_id} (anchored on sp.company_id)`);
  }
});

test('employee-wise (employee x project utilisation): BU A -> E 30h incl. cross-BU, F absent; BU B -> F 12h and E 30h; A+B counts each once', async () => {
  const { A, B, E, F } = fx;
  const run = (companyIds) => util.getEmployeeProjectUtilisation({
    startDate: START, endDate: END, companyIds, limit: 500, offset: 0,
  });
  const sumFor = (rows, id) => rows.filter((r) => r.employee_id === id).reduce((s, r) => s + num(r.adjusted_hours), 0);

  const a = await run([A.company_id]);
  approx(sumFor(a.rows, E), 30, 'E under A');
  assert.equal(a.rows.filter((r) => r.employee_id === E).length, 2, 'E has 2 project rows (own + cross-BU), no duplicates');
  assert.equal(a.rows.some((r) => r.employee_id === F), false, 'F is not mapped to A');

  const b = await run([B.company_id]);
  approx(sumFor(b.rows, F), 12, 'F under B');
  approx(sumFor(b.rows, E), 30, 'E under B although stamped A (mapped to B too)');

  const both = await run([A.company_id, B.company_id]);
  approx(sumFor(both.rows, E), 30, 'E once over A+B');
  approx(sumFor(both.rows, F), 12, 'F once over A+B');
  assert.equal(both.rows.filter((r) => r.employee_id === E).length, 2);
  assert.equal(both.totals.employee_count, both.rows.map((r) => r.employee_id).filter((v, i, arr) => arr.indexOf(v) === i).length);
});

test('BU-wise utilisation: hours grouped by sync BU (A 30h, B 12h) while headcount is by mapping; BU scorecard follows', async () => {
  const { A, B } = fx;
  const r = await util.getBuWiseUtilisation({
    startDate: START, endDate: END, monthsInRange: 1, companyIds: [A.company_id, B.company_id], limit: 100, offset: 0,
  });
  const rowA = r.rows.find((x) => x.bu_id === A.company_id);
  const rowB = r.rows.find((x) => x.bu_id === B.company_id);
  assert.ok(rowA && rowB);
  assert.ok(num(rowA.total_employees) >= 1 && num(rowB.total_employees) >= 2, 'headcount by mapping (E counted in both A and B)');

  // Only categories counted by the report contribute; derive the expectation from the fixture POs.
  const cats = await q(
    `SELECT sp.id, LOWER(TRIM(sc.name)) AS cat,
            (LOWER(TRIM(sp.service_po_name)) IN ('idle','on bench','leave','leaves') OR st.service_type_name ILIKE '%leave%') AS excluded
       FROM service_pos sp JOIN service_types st ON st.id = sp.service_type_id JOIN service_categories sc ON sc.id = st.service_category_id
      WHERE sp.id IN (:a, :b)`, { a: fx.poA, b: fx.poB });
  const counted = (id) => {
    const c = cats.find((x) => x.id === id);
    return c && !c.excluded && ['billable', 'non-billable', 'customer non-billable'].includes(c.cat);
  };
  const expA = (counted(fx.poA) ? 10 : 0) + (counted(fx.poB) ? 20 : 0);
  const expB = (counted(fx.poB) ? 5 : 0) + (counted(fx.poA) ? 7 : 0);
  approx(rowA.total_logged_hours, expA, 'BU A hours = rows stamped A');
  approx(rowB.total_logged_hours, expB, 'BU B hours = rows stamped B');

  // Nothing lost between BUs: totals over A+B equal the sum of the 4 fixture rows (that the report counts).
  approx(r.totals.total_logged_hours, expA + expB, 'sum over BUs');

  const sc = await mgmt.getBUPerformanceScorecard({ month: MONTH, year: YEAR, companyIds: [A.company_id, B.company_id], limit: 100, offset: 0 });
  const sA = sc.rows.find((x) => x.company_id === A.company_id);
  const sB = sc.rows.find((x) => x.company_id === B.company_id);
  assert.ok(sA && sB);
  assert.ok(num(sA.avg_utilization_pct) > 0, 'scorecard A utilisation counts hours stamped A (incl. cross-BU PO_B hours)');
  assert.ok(num(sB.avg_utilization_pct) > 0, 'scorecard B utilisation counts hours stamped B (incl. cross-BU PO_A hours)');
});

test('Centralised PO: only the viewer BU\'s own share counts (t.company_id guard) — skipped without a Centralised PO in A\'s tenant', async (t) => {
  const { A, B, E, F } = fx;
  const [c] = await q(
    `SELECT sp.id FROM service_pos sp WHERE sp.company_id IS NULL AND sp.is_centralised = true AND sp.is_deleted = false ORDER BY sp.id LIMIT 1`);
  if (!c) return t.skip('no Centralised PO in the dev DB');
  const ids = [await addTs(E, c.id, 10, 3, A.company_id), await addTs(F, c.id, 11, 2, B.company_id)];
  try {
    const a = await staffing(c.id, [A.company_id]);
    if (!a.rows.length) return t.skip('Centralised PO is outside the fixture BU tenant');
    const sum = a.rows.reduce((s, r) => s + num(r.actual_hours), 0);
    approx(sum, 3, 'BU A sees only its own timesheets on the Centralised PO');
    const b = await staffing(c.id, [B.company_id]);
    approx(b.rows.reduce((s, r) => s + num(r.actual_hours), 0), 2, 'BU B sees only its own share');

    // Employee-wise: the employee's Centralised rows show under every BU they are mapped to.
    const u = await util.getEmployeeProjectUtilisation({ startDate: START, endDate: END, companyIds: [B.company_id], limit: 500, offset: 0 });
    const eRows = u.rows.filter((r) => r.employee_id === E);
    approx(eRows.reduce((s, r) => s + num(r.adjusted_hours), 0), 33, 'E incl. Centralised under B');
  } finally {
    await dropTs(ids);
  }
});

test('Bench reports (employee-wise): E\'s bench hours stamped A show under B too and are counted once over A+B', async (t) => {
  const { A, B, E } = fx;
  const [bench] = await q(`SELECT id FROM service_pos WHERE LOWER(service_po_name) IN ('idle','on bench') AND is_deleted = false ORDER BY id LIMIT 1`);
  if (!bench) return t.skip('no Idle/On Bench PO in the dev DB');
  const ids = [await addTs(E, bench.id, 15, 4, A.company_id)];
  try {
    const run = (companyIds) => mgmt.getMonthWiseBench({ startMonth: MONTH, startYear: YEAR, endMonth: MONTH, endYear: YEAR, companyIds });
    for (const scope of [[A.company_id], [B.company_id], [A.company_id, B.company_id]]) {
      const [m] = await run(scope);
      approx(m.total_bench_hours, 4, `bench hours for scope ${scope}`);
      assert.equal(Number(m.resources_on_bench), 1, `E counted once for scope ${scope}`);
    }
    const rw = await mgmt.getResourceWiseBench({
      startMonth: MONTH, startYear: YEAR, endMonth: MONTH, endYear: YEAR, companyIds: [A.company_id, B.company_id], limit: 500, offset: 0,
    });
    assert.equal(rw.rows.filter((r) => r.employee_id === E).length, 1, 'one row for E (multi-BU)');
  } finally {
    await dropTs(ids);
  }
});

test('Resource cost utilization (employee-wise): E\'s logged hours are not dropped by t.company_id', async () => {
  const { A, B, E } = fx;
  for (const po of [fx.poA, fx.poB]) {
    const [m, wasCreated] = await EmployeeServicePOMapping.findOrCreate({
      where: { employee_id: E, service_po_id: po }, defaults: { status: 'active', created_by: creatorId },
    });
    if (wasCreated) created.mappings.push(m.id);
    else if (m.status !== 'active') return; // cannot assert without touching real data
  }
  const loggedFor = async (bu) => {
    const r = await mgmt.getResourceCostUtilization({
      startMonth: MONTH, startYear: YEAR, endMonth: MONTH, endYear: YEAR, companyIds: [bu.company_id],
      employeeIds: [E], isBillable: 'all', exportAll: true,
    });
    return r.rows.reduce((s, row) => s + row.months.reduce((x, m) => x + num(m.loggedHours), 0), 0);
  };
  // E (synced from A, stamped A, mapped to A and B) must show the SAME 30h under both BUs.
  approx(await loggedFor(A), 30, 'E logged hours under A');
  approx(await loggedFor(B), 30, 'E logged hours under B (t.company_id = A must not hide them)');
});
