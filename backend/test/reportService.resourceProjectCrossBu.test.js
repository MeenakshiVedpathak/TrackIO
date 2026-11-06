'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Resource Project Utilization: every project (Service PO) in an employee's `projects` array carries
// `is_cross_bu` — true when the PO's Business Unit differs from the employee's own BU(s).
//   (1) service shaping with a stubbed repository, (2) the real SQL against the dev DB with fixtures this
//   file creates and removes itself (far-future period: November 2032).
const {
  sequelize, Employee, EmployeeBusinessUnit, Timesheet, Company,
} = require('../src/models');
const reportRepo = require('../src/repositories/reportRepository');
const reportService = require('../src/services/reportService');

const YEAR = 2032;
const MONTH = 11;

const ORIGINAL = { fn: reportRepo.getResourseProjectUtilizationReport };
const created = { grants: [], timesheetIds: [] };
let fx = null;

test.after(async () => {
  reportRepo.getResourseProjectUtilizationReport = ORIGINAL.fn;
  if (created.timesheetIds.length) await Timesheet.destroy({ where: { id: created.timesheetIds } }).catch(() => {});
  if (created.grants.length) await EmployeeBusinessUnit.destroy({ where: { id: created.grants } }).catch(() => {});
  await sequelize.close();
});

test('service shaping: is_cross_bu is a strict boolean on every project row (missing -> false)', async () => {
  reportRepo.getResourseProjectUtilizationReport = async () => ({
    count: 1,
    costs: [],
    rows: [
      { employee_id: 1, employee_name: 'E', project_id: 10, project_name: 'Own BU PO', client: 'C', category: 'Billable', project_type: 'T', is_billable: true, project_hours: '10', original_project_hours: '12', is_cross_bu: false },
      { employee_id: 1, employee_name: 'E', project_id: 11, project_name: 'Other BU PO', client: 'C', category: 'Billable', project_type: 'T', is_billable: true, project_hours: '5', original_project_hours: '5', is_cross_bu: true },
      { employee_id: 1, employee_name: 'E', project_id: 12, project_name: 'No BU PO', client: 'C', category: 'Billable', project_type: 'T', is_billable: false, project_hours: '1', original_project_hours: '1' },
    ],
  });
  const { data } = await reportService.getResourseProjectUtilizationReport({ month: 11, year: 2032 }, [1]);
  const byName = Object.fromEntries(data[0].projects.map((p) => [p.projectName, p.is_cross_bu]));
  assert.deepEqual(byName, { 'Own BU PO': false, 'Other BU PO': true, 'No BU PO': false });
});

test('real SQL: is_cross_bu follows the PO\'s BU vs the employee\'s mapped BUs', async () => {
  reportRepo.getResourseProjectUtilizationReport = ORIGINAL.fn;

  // two childless BUs that each own an eligible, non-centralised Service PO
  const cands = await sequelize.query(
    `SELECT c.id AS company_id, (
        SELECT sp.id FROM service_pos sp
         WHERE sp.company_id = c.id AND sp.is_deleted = false AND sp.is_centralised = false
           AND sp.status IN ('in-progress','on-hold','pending','completed') ORDER BY sp.id DESC LIMIT 1) AS po_id
       FROM companies c
      WHERE c.is_deleted = false AND c.status = 'active' AND c.parent_business_unit_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM companies ch WHERE ch.parent_business_unit_id = c.id AND ch.is_deleted = false)
      ORDER BY c.id DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const withPo = cands.filter((c) => c.po_id);
  assert.ok(withPo.length >= 2, 'dev DB needs two childless BUs that each own an eligible Service PO');
  const [A, B] = withPo;
  const E = await Employee.findOne({ where: { status: 'active', is_deleted: false }, order: [['id', 'DESC']], raw: true });
  // F must have NO active mapping to BU A (company_id or grant) so BU A's PO is genuinely foreign to them
  const F = (await sequelize.query(
    `SELECT e.id FROM employees e
      WHERE e.status = 'active' AND e.is_deleted = false AND e.id <> :eid
        AND (e.company_id IS DISTINCT FROM :aid)
        AND NOT EXISTS (SELECT 1 FROM employee_business_units x WHERE x.employee_id = e.id AND x.business_unit_id = :aid AND x.status = 'active')
      ORDER BY e.id DESC LIMIT 1`,
    { replacements: { eid: E.id, aid: A.company_id }, type: sequelize.QueryTypes.SELECT }))[0];
  assert.ok(F, 'dev DB needs an employee with no mapping to BU A');
  const poCentral = (await sequelize.query(
    `SELECT id FROM service_pos WHERE company_id IS NULL AND is_centralised = true AND is_deleted = false
        AND status IN ('in-progress','on-hold','pending','completed') ORDER BY id LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }))[0];

  // grants: E -> A and B; F -> B only (remove any pre-existing active grant of F to A is NOT done; we pick F with none)
  const grant = async (employeeId, buId) => {
    const [g, wasCreated] = await EmployeeBusinessUnit.findOrCreate({ where: { employee_id: employeeId, business_unit_id: buId }, defaults: { status: 'active' } });
    if (wasCreated) created.grants.push(g.id);
  };
  await grant(E.id, A.company_id);
  await grant(E.id, B.company_id);
  await grant(F.id, B.company_id);
  const fHasA = await EmployeeBusinessUnit.count({ where: { employee_id: F.id, business_unit_id: A.company_id, status: 'active' } });
  assert.equal(fHasA, 0, 'fixture employee F must not already be mapped to BU A');

  const common = { hours_logged: 8, modified_hours: 8, original_hours: 8, is_publish: true, created_by: E.id, updated_by: E.id };
  const rows = [
    { employee_id: E.id, service_po_id: A.po_id, timesheet_date: `${YEAR}-${MONTH}-01`, company_id: A.company_id },
    { employee_id: E.id, service_po_id: B.po_id, timesheet_date: `${YEAR}-${MONTH}-02`, company_id: A.company_id },
    { employee_id: F.id, service_po_id: A.po_id, timesheet_date: `${YEAR}-${MONTH}-03`, company_id: B.company_id },
    { employee_id: F.id, service_po_id: B.po_id, timesheet_date: `${YEAR}-${MONTH}-04`, company_id: B.company_id },
    ...(poCentral ? [{ employee_id: F.id, service_po_id: poCentral.id, timesheet_date: `${YEAR}-${MONTH}-05`, company_id: B.company_id }] : []),
  ];
  for (const r of rows) created.timesheetIds.push((await Timesheet.create({ ...common, ...r })).id);
  fx = { A, B, E, F, poCentral };

  const res = await reportService.getResourseProjectUtilizationReport({ month: MONTH, year: YEAR, employeeIds: `${E.id},${F.id}`, page: 1, limit: 50 }, [A.company_id, B.company_id]);
  const flag = (employeeId, poId) => {
    const emp = res.data.find((d) => d.employeeId === employeeId);
    assert.ok(emp, `employee ${employeeId} is in the report`);
    const po = (emp.projects || []);
    return po;
  };
  const poName = async (id) => (await sequelize.query('SELECT service_po_name FROM service_pos WHERE id = :id', { replacements: { id }, type: sequelize.QueryTypes.SELECT }))[0].service_po_name;
  const nameA = await poName(A.po_id);
  const nameB = await poName(B.po_id);

  const eProjects = Object.fromEntries(flag(E.id).map((p) => [p.projectName, p.is_cross_bu]));
  const fProjects = Object.fromEntries(flag(F.id).map((p) => [p.projectName, p.is_cross_bu]));

  if (nameA !== nameB) {
    assert.equal(eProjects[nameA], false, 'E is mapped to BU A: BU A\'s PO is not cross-BU');
    assert.equal(eProjects[nameB], false, 'E is also mapped to BU B: BU B\'s PO is not cross-BU');
    assert.equal(fProjects[nameA], true, 'F is only in BU B: BU A\'s PO is cross-BU');
    assert.equal(fProjects[nameB], false, 'F\'s own BU PO is not cross-BU');
  }
  if (poCentral) {
    const centralName = await poName(poCentral.id);
    assert.equal(fProjects[centralName], false, 'a Centralised (BU-less) PO is never cross-BU');
  }
  for (const p of [...flag(E.id), ...flag(F.id)]) assert.equal(typeof p.is_cross_bu, 'boolean');
});

test('real SQL: a Parent BU and its Sub-BUs count as one BU family (not cross-BU)', async (t) => {
  const pair = (await sequelize.query(
    `SELECT p.id AS parent_id, s.id AS sub_id,
            (SELECT sp.id FROM service_pos sp WHERE sp.company_id = p.id AND sp.is_deleted = false AND sp.is_centralised = false
                AND sp.status IN ('in-progress','on-hold','pending','completed') ORDER BY sp.id LIMIT 1) AS parent_po
       FROM companies p JOIN companies s ON s.parent_business_unit_id = p.id AND s.is_deleted = false AND s.status = 'active'
      WHERE p.is_deleted = false AND p.status = 'active' ORDER BY p.id LIMIT 5`,
    { type: sequelize.QueryTypes.SELECT }))
    .find((r) => r.parent_po);
  if (!pair) return t.skip('no Parent BU with a Sub-BU that owns an eligible Service PO in the dev DB');

  const e = (await Employee.findAll({ where: { status: 'active', is_deleted: false }, order: [['id', 'DESC']], limit: 3, raw: true }))[2];
  const [g, wasCreated] = await EmployeeBusinessUnit.findOrCreate({ where: { employee_id: e.id, business_unit_id: pair.sub_id }, defaults: { status: 'active' } });
  if (wasCreated) created.grants.push(g.id);
  const ts = await Timesheet.create({ hours_logged: 8, modified_hours: 8, original_hours: 8, is_publish: true, created_by: e.id, updated_by: e.id, employee_id: e.id, service_po_id: pair.parent_po, timesheet_date: `${YEAR}-${MONTH}-10`, company_id: pair.sub_id });
  created.timesheetIds.push(ts.id);

  const res = await reportService.getResourseProjectUtilizationReport({ month: MONTH, year: YEAR, employeeIds: `${e.id}`, page: 1, limit: 10 }, [pair.parent_id, pair.sub_id]);
  const emp = res.data.find((d) => d.employeeId === e.id);
  assert.ok(emp && emp.projects.length >= 1);
  assert.ok(emp.projects.every((p) => p.is_cross_bu === false), 'employee in a Sub-BU on a Parent-BU PO is the same BU family');
});
