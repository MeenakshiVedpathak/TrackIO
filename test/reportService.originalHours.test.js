'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const monthlyCapService = require('../src/services/monthlyCapService');
monthlyCapService.getCapForMonth = async () => 176;
monthlyCapService.getCurrentCap = async () => 176;

const reportRepo = require('../src/repositories/reportRepository');
const reportService = require('../src/services/reportService');

const KEEP = { ...reportRepo };
function restore() { Object.assign(reportRepo, KEEP); }

const COLUMNS = [
  { category_id: 1, category_name: 'Billable', service_type_id: 10, service_type_name: 'Development' },
  { category_id: 2, category_name: 'Non-Billable', service_type_id: 20, service_type_name: 'Bench' },
  { category_id: 2, category_name: 'Non-Billable', service_type_id: 21, service_type_name: 'Leave' },
];

// Employee scaled DOWN to the cap: logged 150 billable + 40 non-billable (30 bench + 10 leave) = 190,
// synced down to 176.
const ROWS = [
  { employee_id: 1, employee_code: 'E1', full_name: 'A', monthly_capacity: 176, service_type_id: 10, category_id: 1, category_name: 'Billable', hours: '138.00', original_hours: '150.00' },
  { employee_id: 1, employee_code: 'E1', full_name: 'A', monthly_capacity: 176, service_type_id: 20, category_id: 2, category_name: 'Non-Billable', hours: '28.00', original_hours: '30.00' },
  { employee_id: 1, employee_code: 'E1', full_name: 'A', monthly_capacity: 176, service_type_id: 21, category_id: 2, category_name: 'Non-Billable', hours: '10.00', original_hours: '10.00' },
];

const SUMMARY = {
  employee_count: 1, monthly_capacity_per_employee: 176,
  billable_total: 138, non_billable_total: 38, total_hours: 176, leaves_hours: 10, total_utilization: 166,
  original_billable_total: 150, original_non_billable_total: 40, original_total_hours: 190, original_leaves_hours: 10, original_total_utilization: 180,
};

test('getMonthlyResourceUtilization() emits original_* per employee and in summary, using the same capacity/rounding', async () => {
  reportRepo.getMonthlyResourceUtilization = async () => ({ columns: COLUMNS, rows: ROWS, count: 1, summary: SUMMARY });
  const { data, summary } = await reportService.getMonthlyResourceUtilization({ month: 8, year: 2026 }, [1]);
  restore();

  const e = data[0];
  assert.equal(e.total_hours, 176);
  assert.equal(e.utilization_percentage, 94.32);
  assert.equal(e.original_billable_total, 150);
  assert.equal(e.original_non_billable_total, 40);
  assert.equal(e.original_total_hours, 190);
  assert.equal(e.original_leaves_hours, 10);
  assert.equal(e.original_total_utilization, 180);
  assert.equal(e.original_utilization_percentage, 102.27);
  assert.equal(e.original_contributed_percentage, 85.23);
  assert.deepEqual(e.original_hours, { 10: 150, 20: 30, 21: 10 });

  assert.equal(summary.original_total_hours, 190);
  assert.equal(summary.original_utilization_percentage, 102.27);
  assert.equal(summary.original_contributed_percentage, 85.23);
  assert.equal(summary.total_hours, 176);
});

test('buildPivotResponse falls back to synced hours when repo rows carry no original_hours (original == adjusted)', async () => {
  reportRepo.getResourceUtilization = async () => ({
    columns: COLUMNS,
    rows: [{ employee_id: 1, employee_code: 'E1', full_name: 'A', service_type_id: 10, category_id: 1, category_name: 'Billable', hours: '100.00' }],
    count: 1,
  });
  const { data, summary } = await reportService.getResourceUtilization({ month: 8, year: 2026 }, [1]);
  restore();
  assert.equal(data[0].original_total_hours, 100);
  assert.equal(data[0].original_utilization_percentage, null);
  assert.equal(summary.original_total_hours, 100);
});

test('getResourceMonthlyUtilizationReport() emits original* camelCase fields incl. original utilization %', async () => {
  reportRepo.getResourceMonthlyUtilization = async () => ({ columns: COLUMNS, rows: ROWS, count: 1, summary: SUMMARY });
  const { data, summary } = await reportService.getResourceMonthlyUtilizationReport({ month: 8, year: 2026 }, [1]);
  restore();
  const r = data[0];
  assert.equal(r.originalBillableHours, 150);
  assert.equal(r.originalNonBillableHours, 40);
  assert.equal(r.originalTotalHours, 190);
  assert.equal(r.originalBillableUtilizationPercentage, 85.23);
  assert.equal(r.originalNonBillableUtilizationPercentage, 22.73);
  assert.equal(r.originalOverallUtilizationPercentage, 102.27);
  assert.equal(summary.originalTotalHours, 190);
  assert.equal(summary.originalOverallUtilizationPercentage, 102.27);
});

test('getMonthlyHoursTrend() adds original_* hours and original utilization % (billable/total of ORIGINAL hours)', async () => {
  reportRepo.getMonthlyHoursByCategory = async () => [{ year: 2026, month: 8, category_name: 'Billable', report_bucket_key: 'billable', hours: '138', original_hours: '150' }];
  reportRepo.getMonthlyCostByCategory = async () => [];
  reportRepo.getMonthlyUtilizationTrend = async () => [{ year: 2026, month: 8, total_hours: '176', billable_hours: '138', original_total_hours: '200', original_billable_hours: '150' }];
  reportRepo.getLeaveHoursTrendReport = async () => [{ year: 2026, month: 8, leave_hours: '8', original_leave_hours: '10' }];
  reportRepo.getNoWorkTrendReport = async () => [{ year: 2026, month: 8, no_work_hours: '4', original_no_work_hours: '5' }];
  const res = await reportService.getMonthlyHoursTrend({ startDate: '2026-08-01', endDate: '2026-08-31' }, [1]);
  restore();
  assert.equal(res.monthly_hours_by_category[0].Billable, 138);
  assert.equal(res.monthly_hours_by_category[0].original_Billable, 150);
  const u = res.monthly_utilization[0];
  assert.equal(u.utilization_percentage, 78.41);
  assert.equal(u.original_total_hours, 200);
  assert.equal(u.original_billable_hours, 150);
  assert.equal(u.original_utilization_percentage, 75);
  assert.equal(res.leave_hours_trend[0].original_leave_hours, 10);
  assert.equal(res.no_work_trend[0].original_no_work_hours, 5);
});

test('getEmployeeBenchPercentage() adds original bench/total hours and original_bench_pct', async () => {
  reportRepo.getEmployeeBenchDetailReport = async () => ([
    { employee_id: 1, employee_code: 'E1', full_name: 'A', service_po_name: 'On Bench', hours: '40', original_hours: '50' },
    { employee_id: 1, employee_code: 'E1', full_name: 'A', service_po_name: 'Proj', hours: '60', original_hours: '150' },
  ]);
  const { data } = await reportService.getEmployeeBenchPercentage({ startDate: '2026-08-01', endDate: '2026-08-31' }, [1]);
  restore();
  assert.equal(data[0].bench_pct, 40);
  assert.equal(data[0].original_bench_hours, 50);
  assert.equal(data[0].original_total_hours, 200);
  assert.equal(data[0].original_bench_pct, 25);
});

test('getResourceUtilizationTrendReport() adds original_* hours and original_utilization_percentage', async () => {
  reportRepo.getResourceUtilizationTrend = async () => ([
    { year: 2026, month: 8, employee_id: 1, employee_code: 'E1', full_name: 'A', total_hours: '160', billable_hours: '80', original_total_hours: '200', original_billable_hours: '150' },
  ]);
  const { data } = await reportService.getResourceUtilizationTrendReport({ startDate: '2026-08-01', endDate: '2026-08-31' }, [1]);
  restore();
  assert.equal(data[0].utilization_percentage, 50);
  assert.equal(data[0].original_total_hours, 200);
  assert.equal(data[0].original_utilization_percentage, 75);
});

test('getResourseProjectUtilizationReport() adds originalProjectHours and originalTotalHours', async () => {
  reportRepo.getResourseProjectUtilizationReport = async () => ({
    rows: [
      { employee_id: 1, employee_name: 'A', project_name: 'P1', client: 'C', project_hours: '100.00', original_project_hours: '110.00', is_billable: false },
      { employee_id: 1, employee_name: 'A', project_name: 'P2', client: 'C', project_hours: '76.00', original_project_hours: '80.00', is_billable: false },
    ],
    costs: [], count: 1,
  });
  const { data } = await reportService.getResourseProjectUtilizationReport({ month: '8', year: '2026' }, [1]);
  restore();
  assert.equal(data[0].totalHours, 176);
  assert.equal(data[0].originalTotalHours, 190);
  assert.equal(data[0].projects[0].originalProjectHours, 110);
});

test('getTimesheetSummary()/getClientServicePOHoursReport() page + client totals carry original hours', async () => {
  reportRepo.getTimesheetSummary = async () => ({ rows: [{ hours_logged: '7', original_hours_logged: '8' }, { hours_logged: '1', original_hours_logged: '1' }], count: 2 });
  const ts = await reportService.getTimesheetSummary({ limit: '10' }, [1]);
  assert.equal(ts.summary.total_hours_on_page, 8);
  assert.equal(ts.summary.original_total_hours_on_page, 9);

  reportRepo.getClientServicePOHours = async () => ([
    { client_id: 1, client_name: 'C', service_po_id: 1, service_po_code: 'P1', service_po_name: 'P1', hours: '10.00', original_hours: '12.00' },
    { client_id: 1, client_name: 'C', service_po_id: 2, service_po_code: 'P2', service_po_name: 'P2', hours: '5.00', original_hours: '5.00' },
  ]);
  const cl = await reportService.getClientServicePOHoursReport({ startDate: '2026-08-01', endDate: '2026-08-31' }, [1]);
  restore();
  assert.equal(cl[0].total_hrs_of_client, 15);
  assert.equal(cl[0].original_total_hrs_of_client, 17);
  assert.equal(cl[0].service_pos[0].original_hours, 12);
});
