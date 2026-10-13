'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Patch the repository BEFORE requiring the service — the service holds a live reference to this module object.
const reportRepo = require('../src/repositories/reportRepository');
const reportService = require('../src/services/reportService');

const ORIGINAL = {
  detail: reportRepo.getEmployeeBenchDetailReport,
  roster: reportRepo.getEmployeeBenchRoster,
};
test.after(() => {
  reportRepo.getEmployeeBenchDetailReport = ORIGINAL.detail;
  reportRepo.getEmployeeBenchRoster = ORIGINAL.roster;
});

const QUERY = { month: 7, year: 2026 };

test('Employee Bench %: employees in scope who logged NO hours are listed too, as 100% bench', async () => {
  reportRepo.getEmployeeBenchDetailReport = async () => ([
    { employee_id: 1, employee_code: 'E1', full_name: 'Worked A', service_po_name: 'Some Project', hours: '100.00', original_hours: '120.00' },
    { employee_id: 1, employee_code: 'E1', full_name: 'Worked A', service_po_name: 'On Bench', hours: '20.00', original_hours: '30.00' },
  ]);
  reportRepo.getEmployeeBenchRoster = async () => ([
    { employee_id: 1, employee_code: 'E1', full_name: 'Worked A' },
    { employee_id: 2, employee_code: 'E2', full_name: 'Never Logged' },
  ]);

  const { data, meta } = await reportService.getEmployeeBenchPercentage(QUERY, [1]);

  assert.equal(meta.total, 2, 'both employees are listed');
  const worked = data.find((r) => r.employee_id === 1);
  assert.equal(worked.total_hours, 120);
  assert.equal(worked.bench_hours, 20);
  assert.equal(worked.bench_pct, 16.67);
  assert.equal(worked.original_bench_pct, 20, 'original: 30 bench of 150');
  assert.equal(worked.no_hours_logged, false);

  const idle = data.find((r) => r.employee_id === 2);
  assert.equal(idle.total_hours, 0);
  assert.equal(idle.bench_pct, 100);
  assert.equal(idle.original_bench_pct, 100);
  assert.equal(idle.no_hours_logged, true);

  assert.equal(data[0].employee_id, 2, 'default sort (bench % desc) puts the fully idle employee first');
});

test('Employee Bench %: with no roster (e.g. a client / Service PO filter) only employees with hours are listed', async () => {
  reportRepo.getEmployeeBenchDetailReport = async () => ([
    { employee_id: 1, employee_code: 'E1', full_name: 'Worked A', service_po_name: 'Some Project', hours: '10.00', original_hours: '10.00' },
  ]);
  reportRepo.getEmployeeBenchRoster = async () => [];

  const { data } = await reportService.getEmployeeBenchPercentage({ ...QUERY, poId: '5' }, [1]);
  assert.equal(data.length, 1);
  assert.equal(data[0].no_hours_logged, false);
});

test('getEmployeeBenchRoster: no roster for an empty BU scope or when a client / PO filter is set', async () => {
  reportRepo.getEmployeeBenchRoster = ORIGINAL.roster;
  assert.deepEqual(await reportRepo.getEmployeeBenchRoster({ companyIds: [] }), []);
  assert.deepEqual(await reportRepo.getEmployeeBenchRoster({ companyIds: [1], clientId: 3 }), []);
  assert.deepEqual(await reportRepo.getEmployeeBenchRoster({ companyIds: [1], poId: 3 }), []);
});
