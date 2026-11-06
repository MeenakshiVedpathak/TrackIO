'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../src/repositories/crossBuEmployeePoHoursReportRepository');
const service = require('../src/services/crossBuEmployeePoHoursReportService');
const employeeServicePOMappingService = require('../src/services/employeeServicePOMappingService');
const { crossBuEmployeePoHoursReportQuerySchema } = require('../src/validations/crossBuEmployeePoHoursReportValidation');

/**
 * Cross-BU Employee & Service PO Hours Report — Employee BU and PO BU are independent filters and a
 * BU-scoped caller sees a row when the EMPLOYEE or the PO belongs to their BUs. DB-free: SQL text
 * assertions on the repository's WHERE builder + service-level pure functions with the repository
 * stubbed. (The end-to-end behaviour was also checked against the local database.)
 */

const BASE = { startDate: '2026-09-01', endDate: '2026-09-30' };
const REACH = { kind: 'reach', reachIds: [23, 24], includeTenantBuLessPOs: false };

test('BU-scoped visibility ORs the employee side and the PO side (both cross-BU directions stay visible)', () => {
  const { whereSql, replacements } = repository.buildWhere({ ...BASE, scope: REACH });
  assert.match(whereSql, /eb\.member_ids && ARRAY\[:reachIds\]::int\[\] OR sp\.company_id IN \(:reachIds\)/);
  assert.deepEqual(replacements.reachIds, [23, 24]);
});

test('Admin tier also sees its own tenant BU-less POs; BU Admin tier does not', () => {
  const admin = repository.buildWhere({ ...BASE, scope: { ...REACH, includeTenantBuLessPOs: true } }).whereSql;
  const buAdmin = repository.buildWhere({ ...BASE, scope: REACH }).whereSql;
  assert.match(admin, /sp\.company_id IS NULL AND sp\.created_by IN/);
  assert.doesNotMatch(buAdmin, /sp\.company_id IS NULL/);
});

test('Employee BU and PO BU are separate, independent filters', () => {
  const emp = repository.buildWhere({ ...BASE, scope: REACH, employeeBuIds: [5] });
  assert.match(emp.whereSql, /eb\.member_ids && ARRAY\[:employeeBuIds\]::int\[\]/);
  assert.doesNotMatch(emp.whereSql, /sp\.company_id IN \(:poBuIds\)/);

  const po = repository.buildWhere({ ...BASE, scope: REACH, poBuIds: [7] });
  assert.match(po.whereSql, /sp\.company_id IN \(:poBuIds\)/);
  assert.doesNotMatch(po.whereSql, /:employeeBuIds/);

  const both = repository.buildWhere({ ...BASE, scope: REACH, employeeBuIds: [5], poBuIds: [7] });
  assert.match(both.whereSql, /:employeeBuIds/);
  assert.match(both.whereSql, /:poBuIds/);
});

test('Work type filter compares the derived Own/Cross classification (not a single BU column)', () => {
  const cross = repository.buildWhere({ ...BASE, scope: REACH, workType: 'cross' });
  assert.match(cross.whereSql, /po_root\.id = ANY\(eb\.bu_ids\)/);
  assert.equal(cross.replacements.workType, 'cross');
  const none = repository.buildWhere({ ...BASE, scope: REACH, workType: null });
  assert.doesNotMatch(none.whereSql, /:workType/);
});

test('the report has no Activity/Task dimension: no hierarchy join, no activity filter', () => {
  const withIgnoredFilter = repository.buildWhere({ ...BASE, scope: REACH, activityIds: [9] });
  assert.doesNotMatch(withIgnoredFilter.whereSql, /hierarchy|node\./);
  assert.equal(withIgnoredFilter.replacements.activityIds, undefined);
  assert.ok(!service.DETAIL_COLUMNS.some((c) => ['module', 'task', 'activity'].includes(c.key)));
});

test('Project Manager scope = their own PM Service POs; Employee scope = authorized employees', () => {
  assert.match(repository.buildWhere({ ...BASE, scope: { kind: 'servicePos', servicePoIds: [1] } }).whereSql, /wl\.service_po_id IN \(:scopeServicePoIds\)/);
  assert.match(repository.buildWhere({ ...BASE, scope: { kind: 'employees', employeeIds: [1] } }).whereSql, /wl\.employee_id IN \(:scopeEmployeeIds\)/);
});

test('summary cards: Own/Cross hours and percentages (percent of total hours, unclassified kept apart)', () => {
  const totals = service.toTotals({
    employee_count: 3, total_hours: '100.00', own_bu_hours: '60.00', cross_bu_hours: '30.00', unclassified_hours: '10.00', cross_bu_employee_count: 2,
  });
  assert.equal(totals.own_bu_percent, 60);
  assert.equal(totals.cross_bu_percent, 30);
  assert.equal(totals.unclassified_hours, 10);
  const empty = service.toTotals({ employee_count: 0, total_hours: 0, own_bu_hours: 0, cross_bu_hours: 0, unclassified_hours: 0, cross_bu_employee_count: 0 });
  assert.equal(empty.own_bu_percent, 0);
});

test('BU flow pivots one matrix into Employee BU -> PO BU and PO BU -> Employee BU', () => {
  const flow = service.toBuFlow([
    { employee_bu_id: 1, employee_bu: 'Alpha', po_bu_id: 2, po_bu: 'Beta', hours: '120', employee_count: 4 },
    { employee_bu_id: 1, employee_bu: 'Alpha', po_bu_id: 1, po_bu: 'Alpha', hours: '500', employee_count: 9 },
    { employee_bu_id: 2, employee_bu: 'Beta', po_bu_id: 1, po_bu: 'Alpha', hours: '90', employee_count: 3 },
  ]);
  const alphaToBeta = flow.employee_bu_to_po_bu.find((r) => r.employee_bu === 'Alpha' && r.po_bu === 'Beta');
  assert.equal(alphaToBeta.work_type, 'cross');
  assert.equal(flow.employee_bu_to_po_bu.find((r) => r.employee_bu === 'Alpha' && r.po_bu === 'Alpha').work_type, 'own');

  const alphaPo = flow.po_bu_to_employee_bu.find((p) => p.po_bu === 'Alpha');
  assert.equal(alphaPo.total_hours, 590);
  assert.deepEqual(alphaPo.employee_bus.map((e) => [e.employee_bu, e.hours]), [['Alpha', 500], ['Beta', 90]]);
});

test('a record carries total hours on the PO and a readable work type (no activity fields)', () => {
  const rec = service.toRecord({
    employee_id: 1, employee_name: 'Rahul', employee_bu: 'Alpha', employee_sub_bu: 'Alpha Sub', po_bu: 'Beta',
    hours: '20.00', work_type: 'cross', month: 9, year: 2026,
  });
  assert.equal('activity' in rec, false);
  assert.equal(rec.work_type_label, 'Cross BU');
  assert.equal(rec.logged_hours, 20);
});

test('period: month window resolved, over-long range rejected', () => {
  const m = service.resolvePeriod({ month: 9, year: 2026 });
  assert.equal(m.startDate, '2026-09-01');
  assert.equal(m.endDate, '2026-09-30');
  assert.throws(() => service.resolvePeriod({ start_date: '2024-01-01', end_date: '2026-01-01' }), (e) => e.statusCode === 400);
});

test('a Project Manager with no PM Service PO gets an empty report (not everything)', async () => {
  const original = employeeServicePOMappingService.getProjectManagerServicePOIds;
  const originalFindRows = repository.findRows;
  try {
    employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [];
    repository.findRows = async () => { throw new Error('must not query without a scope'); };
    const result = await service.getReport({ month: 9, year: 2026 }, { hierarchyRank: 6, employeeId: 5 }, [1]);
    assert.deepEqual(result.records, []);
    assert.equal(result.totals.total_hours, 0);
  } finally {
    employeeServicePOMappingService.getProjectManagerServicePOIds = original;
    repository.findRows = originalFindRows;
  }
});

test('query validation: month/year and start/end are mutually exclusive; work_type is constrained', () => {
  const bad = crossBuEmployeePoHoursReportQuerySchema.validate({ month: 9, year: 2026, start_date: '2026-09-01', end_date: '2026-09-30' });
  assert.ok(bad.error);
  assert.ok(crossBuEmployeePoHoursReportQuerySchema.validate({ work_type: 'weird' }).error);
  assert.ok(crossBuEmployeePoHoursReportQuerySchema.validate({ activity_ids: '1' }).error);
  const ok = crossBuEmployeePoHoursReportQuerySchema.validate({ employee_bu_ids: '1,2', po_bu_ids: '3', work_type: 'cross' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.page, 1);
});
