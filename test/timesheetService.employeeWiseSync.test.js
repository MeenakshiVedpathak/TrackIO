'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Integration test for the EMPLOYEE-WISE "Sync Employee Work Logs" flow, against the real dev DB, using a
// distinctive far-future period (June/July 2032) and fixtures it creates AND removes itself:
//   - an employee mapped to TWO childless Business Units (A and B),
//   - one eligible Service PO of each BU,
//   - approved work logs of that employee on BOTH POs (so one of them is a cross-BU PO for whichever BU syncs).
const {
  sequelize, Company, Employee, EmployeeBusinessUnit, ServicePO, EmployeeWorkLog, Timesheet, TimesheetImportHistory,
} = require('../src/models');
const timesheetService = require('../src/services/timesheetService');
const timesheetRepository = require('../src/repositories/timesheetRepository');
const monthlyCapService = require('../src/services/monthlyCapService');

const YEAR = 2032;
const MONTH = 6;
const OTHER_MONTH = 7;
const HOURS_PER_LOG = 150; // two logs = 300h, above any realistic cap, so the cap adjustment must kick in

const created = { grants: [], logIds: [], importIds: new Set() };
let fixtures = null;
let userId;

test.before(async () => {
  // Two active, childless Business Units that each own an eligible, non-centralised Service PO.
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

  const employee = await Employee.findOne({ where: { status: 'active', is_deleted: false }, order: [['id', 'ASC']], raw: true });
  assert.ok(employee, 'dev DB needs an active employee');
  userId = employee.id;

  // Map the employee to BOTH BUs (only create the grants that are missing, so cleanup is exact).
  for (const bu of [A, B]) {
    const [grant, wasCreated] = await EmployeeBusinessUnit.findOrCreate({
      where: { employee_id: employee.id, business_unit_id: bu.company_id },
      defaults: { status: 'active' },
    });
    if (!wasCreated && grant.status !== 'active') {
      throw new Error('fixture employee has an inactive grant for a test BU; pick another employee');
    }
    if (wasCreated) created.grants.push(grant.id);
  }

  fixtures = { A, B, employee };

  // Approved logs of the employee: one against BU A's PO, one against BU B's PO.
  for (const [bu, day] of [[A, 10], [B, 11]]) {
    const log = await EmployeeWorkLog.create({
      company_id: bu.company_id,
      employee_id: employee.id,
      service_po_id: bu.po_id,
      work_date: `${YEAR}-0${MONTH}-${day}`,
      hours: HOURS_PER_LOG,
      log_type: 'monthly', // monthly rows allow > 24h per row, so the month goes over the cap
      description: 'employee-wise sync test row',
      status: 'approved',
    });
    created.logIds.push(log.id);
  }
});

test.after(async () => {
  const { employee } = fixtures || {};
  if (employee) {
    await Timesheet.destroy({
      where: { employee_id: employee.id, timesheet_date: { [Op.gte]: `${YEAR}-01-01`, [Op.lte]: `${YEAR}-12-31` } },
    }).catch(() => {});
  }
  if (created.logIds.length) await EmployeeWorkLog.destroy({ where: { id: created.logIds }, force: true }).catch(() => {});
  await TimesheetImportHistory.destroy({
    where: { import_year: YEAR, import_month: { [Op.in]: [MONTH, OTHER_MONTH] } },
  }).catch(() => {});
  if (created.grants.length) await EmployeeBusinessUnit.destroy({ where: { id: created.grants } }).catch(() => {});
  await sequelize.close();
});

const importId = (preview) => { created.importIds.add(preview.importId); return preview.importId; };

test('Sync of BU A pulls ALL of the employee\'s logs, incl. the cross-BU Service PO of BU B, and caps the whole month', async () => {
  const { A, B, employee } = fixtures;

  const preview = await timesheetService.previewPmsImport(MONTH, YEAR, userId, A.company_id);
  importId(preview);
  assert.equal(preview.skippedCount, 0);
  assert.equal(preview.errorRows, 0, JSON.stringify(preview.errors));
  assert.equal(preview.validRows, 2, 'both logs (own-BU PO and cross-BU PO) are in the sync');
  assert.deepEqual(new Set(preview.preview.map((r) => r.poId)), new Set([A.po_id, B.po_id]));

  const confirm = await timesheetService.confirmImport(preview.importId, userId, null, A.company_id);
  assert.equal(confirm.status, 'completed');
  assert.equal(confirm.insertedRows, 2);

  const rows = await Timesheet.findAll({ where: { employee_id: employee.id, timesheet_import_id: preview.importId }, raw: true });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.company_id === A.company_id), 'timesheets are stamped with the SYNC BU');

  const cap = await monthlyCapService.getCurrentCap();
  const expectedTotal = Math.min(cap, HOURS_PER_LOG * 2);
  const total = rows.reduce((s, r) => s + parseFloat(r.hours_logged), 0);
  assert.ok(Math.abs(total - expectedTotal) < 0.011, `employee month capped as a whole: ${total} vs ${expectedTotal}`);
  assert.ok(rows.every((r) => parseFloat(r.original_hours) === HOURS_PER_LOG), 'original logged hours are preserved');

  const logs = await EmployeeWorkLog.findAll({ where: { id: created.logIds }, raw: true });
  assert.ok(logs.every((l) => l.status === 'synced' && l.timesheet_import_id === preview.importId),
    'every log, including the cross-BU one, is now synced and linked to the import');
});

test('Sync of BU B afterwards detects the employee as already synced: clear message, skipped, no duplicates', async () => {
  const { A, B, employee } = fixtures;

  const preview = await timesheetService.previewPmsImport(MONTH, YEAR, userId, B.company_id);
  importId(preview);

  assert.equal(preview.skippedCount, 1);
  const skipped = preview.skippedEmployees.find((e) => e.employeeId === employee.id);
  assert.ok(skipped, 'the multi-BU employee is reported as skipped');
  assert.equal(skipped.syncedBusinessUnitId, A.company_id);
  assert.match(skipped.message, /already synced for Jun 2032 from /);
  assert.equal(preview.validRows, 0, 'nothing of the skipped employee is re-synced');
  assert.equal(preview.canConfirm, false);

  const count = await Timesheet.count({ where: { employee_id: employee.id, timesheet_date: { [Op.gte]: `${YEAR}-${String(MONTH).padStart(2, '0')}-01`, [Op.lt]: `${YEAR}-0${MONTH + 1}-01` } } });
  assert.equal(count, 2, 'still exactly the 2 rows from BU A\'s sync — no duplicates');
});

test('once synced, the employee month is locked for edits/adds from ANY BU session (rule is per employee, not per BU)', async () => {
  const { A, B, employee } = fixtures;
  const employeeWorkLogRepository = require('../src/repositories/employeeWorkLogRepository');

  // The log on BU A's PO (company_id = A) is checked from a BU B session and vice-versa — and with no BU at all.
  assert.equal(await employeeWorkLogRepository.hasSyncedEntriesInRange(employee.id, `${YEAR}-06-10`, `${YEAR}-06-10`, B.company_id), true);
  assert.equal(await employeeWorkLogRepository.hasSyncedEntriesInRange(employee.id, `${YEAR}-06-11`, `${YEAR}-06-11`, A.company_id), true);
  assert.equal(await employeeWorkLogRepository.hasSyncedEntriesInRange(employee.id, `${YEAR}-06-01`, `${YEAR}-06-30`, null), true);
  // A different month of the same employee is untouched.
  assert.equal(await employeeWorkLogRepository.hasSyncedEntriesInRange(employee.id, `${YEAR}-05-01`, `${YEAR}-05-31`, A.company_id), false);
});

test('Repeating the sync from the SAME BU is allowed and replaces (never duplicates) the employee\'s rows', async () => {
  const { A, employee } = fixtures;

  const preview = await timesheetService.previewPmsImport(MONTH, YEAR, userId, A.company_id);
  importId(preview);
  assert.equal(preview.skippedCount, 0, 'the employee was synced by THIS BU, so they are not "synced elsewhere"');
  assert.equal(preview.validRows, 2);

  const confirm = await timesheetService.confirmImport(preview.importId, userId, null, A.company_id);
  assert.equal(confirm.status, 'completed');

  const rows = await Timesheet.findAll({ where: { employee_id: employee.id, timesheet_import_id: preview.importId }, raw: true });
  assert.equal(rows.length, 2);
  const total = await Timesheet.count({ where: { employee_id: employee.id, timesheet_date: { [Op.gte]: `${YEAR}-06-01`, [Op.lt]: `${YEAR}-07-01` } } });
  assert.equal(total, 2, 'no duplicate rows after the repeat sync');
});

test('deleting a single synced timesheet reverts its (cross-BU) work log so it can be synced again', async () => {
  const { A, B, employee } = fixtures;
  const crossBuRow = await Timesheet.findOne({ where: { employee_id: employee.id, service_po_id: B.po_id, timesheet_date: `${YEAR}-06-11` } });
  assert.ok(crossBuRow, 'the cross-BU row exists under BU A\'s import');
  assert.equal(crossBuRow.company_id, A.company_id);

  await timesheetService.deleteTimesheet(crossBuRow.id, A.company_id);

  const log = await EmployeeWorkLog.findOne({ where: { employee_id: employee.id, service_po_id: B.po_id, work_date: `${YEAR}-06-11` }, raw: true });
  assert.equal(log.status, 'approved', 'the work log is released again (status no longer synced)');
  assert.equal(log.timesheet_import_id, null);
});

test('repository: a re-sync preserves rows of employees whose month is owned by another sync (legacy BU-by-BU data)', async () => {
  const { A, B, employee } = fixtures;
  const other = await Employee.findOne({ where: { status: 'active', is_deleted: false, id: { [Op.ne]: employee.id } }, order: [['id', 'ASC']], raw: true });
  const common = { service_po_id: A.po_id, hours_logged: 8, modified_hours: 8, is_publish: true, created_by: userId, updated_by: userId };

  const kept = await Timesheet.create({ ...common, employee_id: employee.id, timesheet_date: `${YEAR}-07-05`, company_id: A.company_id });
  const removed = await Timesheet.create({ ...common, employee_id: other.id, timesheet_date: `${YEAR}-07-06`, company_id: A.company_id });
  const elsewhere = await Timesheet.create({ ...common, service_po_id: B.po_id, employee_id: employee.id, timesheet_date: `${YEAR}-07-07`, company_id: B.company_id });

  const synced = await timesheetRepository.findEmployeesSyncedElsewhere([employee.id, other.id], OTHER_MONTH, YEAR, A.company_id);
  const entry = synced.find((e) => e.employeeId === employee.id);
  assert.ok(entry, 'employee with rows under BU B is "synced elsewhere" from BU A\'s point of view');
  assert.equal(entry.syncedCompanyId, B.company_id);
  assert.equal(entry.hasOwnRows, true, 'and they ALSO still have rows under BU A (legacy split)');
  assert.equal(synced.find((e) => e.employeeId === other.id), undefined);

  await timesheetRepository.deleteByMonth(OTHER_MONTH, YEAR, null, A.company_id, { excludeEmployeeIds: [employee.id] });
  assert.ok(await Timesheet.findByPk(kept.id), 'the excluded employee\'s row under BU A survives the full-replace');
  assert.equal(await Timesheet.findByPk(removed.id), null, 'other rows of BU A\'s month are replaced as before');
  assert.ok(await Timesheet.findByPk(elsewhere.id), 'BU B\'s rows are never touched by BU A\'s replace');
});
