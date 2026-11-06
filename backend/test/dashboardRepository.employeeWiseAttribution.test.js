'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Integration test (real dev DB) for how the dashboards / timesheet aggregates attribute hours after the
// EMPLOYEE-WISE "Sync Employee Work Logs":
//   sync of BU A took employee E : E->PO_A 10h, E->PO_B 20h (cross-BU)  stamped company_id = A
//   sync of BU B took employee F : F->PO_B  5h, F->PO_A  7h (cross-BU)  stamped company_id = B
//   E is mapped to A and B, F to B only.
// EMPLOYEE-wise widgets follow the employee's BU mapping; SPO-wise widgets follow the Service PO's BU.
// Uses a distinctive far-future month (April 2032, kept away from the June/July 2032 used by the sync tests,
// which run in parallel) and removes every row/grant it created.
const { sequelize, Employee, EmployeeBusinessUnit, Timesheet } = require('../src/models');
const dashboardRepo = require('../src/repositories/dashboardRepository');
const timesheetRepository = require('../src/repositories/timesheetRepository');
const { buLessServicePOInTenantSql } = require('../src/utils/servicePOTenantSql');

const YEAR = 2032;
const MONTH = 4;
const WINDOW = { startDate: `${YEAR}-04-01`, endDate: `${YEAR}-04-30` };

const created = { grants: [] };
let fx = null;

const num = (v) => parseFloat(v) || 0;
const approx = (actual, expected, msg) => assert.ok(Math.abs(num(actual) - expected) < 0.011, `${msg}: ${actual} vs ${expected}`);

async function insertRow(employeeId, poId, day, hours, companyId, userId) {
  await Timesheet.create({
    employee_id: employeeId,
    service_po_id: poId,
    timesheet_date: `${YEAR}-04-${String(day).padStart(2, '0')}`,
    hours_logged: hours,
    modified_hours: hours,
    original_hours: hours,
    company_id: companyId,
    is_publish: true,
    created_by: userId,
    updated_by: userId,
  });
}

test.before(async () => {
  const candidates = await sequelize.query(
    `SELECT c.id AS company_id, (
        SELECT sp.id FROM service_pos sp
         WHERE sp.company_id = c.id AND sp.is_deleted = false AND sp.is_centralised = false
           AND sp.status IN ('in-progress','on-hold','pending','completed')
         ORDER BY sp.id LIMIT 1
      ) AS po_id
       FROM companies c
      WHERE c.is_deleted = false AND c.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM companies ch WHERE ch.parent_business_unit_id = c.id AND ch.is_deleted = false)
      ORDER BY c.id`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const withPo = candidates.filter((c) => c.po_id);
  assert.ok(withPo.length >= 2, 'dev DB needs two childless BUs that each own an eligible Service PO');
  const [A, B] = withPo;

  // Highest ids first, so we never collide with tests that take the lowest-id employee.
  const emps = await Employee.findAll({ where: { status: 'active', is_deleted: false }, order: [['id', 'DESC']], raw: true, limit: 60 });
  const grantRows = await EmployeeBusinessUnit.findAll({ where: { business_unit_id: { [Op.in]: [A.company_id, B.company_id] } }, raw: true });
  const hasGrantToA = new Set(grantRows.filter((g) => g.business_unit_id === A.company_id && g.status === 'active').map((g) => g.employee_id));
  const E = emps[0];
  const F = emps.find((e) => e.id !== E.id && e.company_id !== A.company_id && !hasGrantToA.has(e.id));
  assert.ok(E && F, 'dev DB needs two active employees');

  const addGrant = async (employeeId, buId) => {
    const [grant, wasCreated] = await EmployeeBusinessUnit.findOrCreate({
      where: { employee_id: employeeId, business_unit_id: buId },
      defaults: { status: 'active' },
    });
    if (!wasCreated && grant.status !== 'active') throw new Error('fixture employee has an inactive grant for a test BU');
    if (wasCreated) created.grants.push(grant.id);
  };
  await addGrant(E.id, A.company_id);
  await addGrant(E.id, B.company_id);
  await addGrant(F.id, B.company_id);

  // Optional Centralised PO in the Admin tenant of A and B.
  const [cen] = await sequelize.query(
    `SELECT sp.id FROM service_pos sp
      WHERE sp.company_id IS NULL AND sp.is_centralised = true AND sp.is_deleted = false
        AND ${buLessServicePOInTenantSql('sp', 'ids')}
      ORDER BY sp.id LIMIT 1`,
    { replacements: { ids: [A.company_id, B.company_id] }, type: sequelize.QueryTypes.SELECT }
  );

  const userId = E.id;
  await insertRow(E.id, A.po_id, 10, 10, A.company_id, userId);
  await insertRow(E.id, B.po_id, 11, 20, A.company_id, userId); // cross-BU, stamped with the SYNC BU (A)
  await insertRow(F.id, B.po_id, 10, 5, B.company_id, userId);
  await insertRow(F.id, A.po_id, 11, 7, B.company_id, userId); // cross-BU, stamped with the SYNC BU (B)
  if (cen) {
    await insertRow(E.id, cen.id, 12, 4, A.company_id, userId);
    await insertRow(F.id, cen.id, 12, 3, B.company_id, userId);
  }
  fx = { A, B, E, F, cenId: cen ? cen.id : null };
});

test.after(async () => {
  if (fx) {
    await Timesheet.destroy({
      where: { employee_id: { [Op.in]: [fx.E.id, fx.F.id] }, timesheet_date: { [Op.gte]: `${YEAR}-04-01`, [Op.lte]: `${YEAR}-04-30` } },
    }).catch(() => {});
  }
  if (created.grants.length) await EmployeeBusinessUnit.destroy({ where: { id: created.grants } }).catch(() => {});
  await sequelize.close();
});

const filters = (companyId, extra = {}) => ({ ...WINDOW, companyId, ...extra });
const byEmployee = (rows) => new Map(rows.map((r) => [r.employee_id, r]));
const poHours = (rows, poId) => rows.filter((r) => r.service_po_id === poId).reduce((s, r) => s + num(r.hours), 0);

test('EMPLOYEE-wise: hours per employee follow the employee mapping, incl. cross-BU rows, never t.company_id', async () => {
  const { A, B, E, F, cenId } = fx;
  const cenE = cenId ? 4 : 0;
  const cenF = cenId ? 3 : 0;

  const a = byEmployee(await dashboardRepo.getAnalyticsHoursByEmployee(filters([A.company_id])));
  approx(a.get(E.id).hours, 30 + cenE, 'BU A: E incl. cross-BU (+centralised)');
  assert.equal(a.has(F.id), false, 'BU A: F (mapped to B only) is absent although F logged 7h on A\'s PO');

  const b = byEmployee(await dashboardRepo.getAnalyticsHoursByEmployee(filters([B.company_id])));
  approx(b.get(F.id).hours, 12 + cenF, 'BU B: F');
  approx(b.get(E.id).hours, 30 + cenE, 'BU B: E still shows (mapped to B) although synced from A (t.company_id = A)');

  const ab = byEmployee(await dashboardRepo.getAnalyticsHoursByEmployee(filters([A.company_id, B.company_id])));
  approx(ab.get(E.id).hours, 30 + cenE, 'A+B: E counted once');
  approx(ab.get(F.id).hours, 12 + cenF, 'A+B: F counted once');

  // Tiles / breakdown / bench use the same employee scope and must agree with the per-employee figures.
  const tiles = await dashboardRepo.getAnalyticsTiles(filters([A.company_id, B.company_id]));
  const sumEmployees = [...ab.values()].reduce((s, r) => s + num(r.hours), 0);
  approx(tiles.total_hours, sumEmployees, 'tiles total hours == sum of per-employee hours (no double counting)');

  const bd = await dashboardRepo.getEmployeeBillableBreakdownForPeriod(filters([A.company_id, B.company_id]));
  approx(bd.filter((r) => r.employee_id === E.id).reduce((s, r) => s + num(r.hours), 0), 30 + cenE, 'billable breakdown: E once');

  const monthly = await dashboardRepo.getCurrentMonthHours(MONTH, YEAR, 'M', null, [A.company_id]);
  assert.ok(monthly >= 30 + cenE - 0.011, 'month total for BU A includes E\'s cross-BU hours');
});

test('SPO-wise: hours per Service PO / client follow the PO\'s BU and count every employee (cross-BU too)', async () => {
  const { A, B } = fx;

  const a = await dashboardRepo.getAnalyticsClientByPO(filters([A.company_id]));
  approx(poHours(a, A.po_id), 17, 'BU A: PO_A = E10 + F7');
  approx(poHours(a, B.po_id), 0, 'BU A: PO_B is not A\'s Service PO');

  const b = await dashboardRepo.getAnalyticsClientByPO(filters([B.company_id]));
  approx(poHours(b, B.po_id), 25, 'BU B: PO_B = E20 (t.company_id = A!) + F5');
  approx(poHours(b, A.po_id), 0, 'BU B: PO_A is not B\'s Service PO');

  const ab = await dashboardRepo.getAnalyticsClientByPO(filters([A.company_id, B.company_id]));
  approx(poHours(ab, A.po_id), 17, 'A+B: PO_A');
  approx(poHours(ab, B.po_id), 25, 'A+B: PO_B');

  // Top POs of the period (service-PO ranking) agree.
  const top = await dashboardRepo.getTopPOsByHoursForPeriod(WINDOW.startDate, WINDOW.endDate, 'M', null, [B.company_id]);
  const poB = top.find((r) => r.id === B.po_id);
  assert.ok(poB, 'PO_B ranked for BU B');
  approx(poB.total_hours_logged, 25, 'top POs: PO_B');
});

test('timesheetRepository aggregates: summary by employee (employee-wise), by PO (SPO-wise), cap total across BUs', async () => {
  const { A, B, E, F, cenId } = fx;
  const cenE = cenId ? 4 : 0;
  const val = (row, k) => num(row.get ? row.get(k) : row[k]);

  const byEmp = await timesheetRepository.getSummaryByEmployee({ ...WINDOW, companyId: A.company_id });
  const e = byEmp.find((r) => r.employee_id === E.id);
  approx(val(e, 'total_hours'), 30 + cenE, 'summary by employee, BU A: E');
  assert.equal(byEmp.some((r) => r.employee_id === F.id), false, 'summary by employee, BU A: no F');

  const byPoB = await timesheetRepository.getSummaryByPO({ ...WINDOW, companyId: B.company_id });
  approx(val(byPoB.find((r) => r.service_po_id === B.po_id), 'total_hours'), 25, 'summary by PO, BU B: PO_B incl. E\'s cross-BU 20h');
  assert.equal(byPoB.some((r) => r.service_po_id === A.po_id), false, 'summary by PO, BU B: PO_A excluded');

  // Monthly cap check: an employee's month total is ONE figure regardless of which BU the session is in.
  approx(await timesheetRepository.getMonthlyHours(MONTH, YEAR, E.id, null, B.company_id), 30 + cenE, 'getMonthlyHours(E) from a BU B session');
  approx(await timesheetRepository.getMonthlyHours(MONTH, YEAR, E.id, null, A.company_id), 30 + cenE, 'getMonthlyHours(E) from a BU A session');
});

test('Centralised PO: only the viewing BU\'s own share counts (SPO-wise guard)', async (t) => {
  const { A, B, cenId } = fx;
  if (!cenId) return t.skip('no Centralised PO in the Admin tenant of the two test BUs');
  const hoursOnCen = async (companyId) => {
    const rows = await dashboardRepo.getAnalyticsClientByPO(filters([companyId]));
    return poHours(rows, cenId);
  };
  approx(await hoursOnCen(A.company_id), 4, 'BU A sees only E\'s 4h (stamped A) on the Centralised PO');
  approx(await hoursOnCen(B.company_id), 3, 'BU B sees only F\'s 3h (stamped B) on the Centralised PO');
});
