'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardRepo = require('../src/repositories/dashboardRepository');
const dashboardService = require('../src/services/dashboardService');

/**
 * Every timesheet-derived dashboard figure now carries an additive
 * `original_*` twin (the employee's TRUE logged hours, pre monthly-cap
 * scaling). The synced/adjusted fields keep their existing meaning.
 */

const FN_NAMES = [
  'getTotalEmployees', 'getActiveEmployees', 'getTotalClients', 'getActivePOs', 'getClosedPOs',
  'getCurrentMonthHoursWithOriginal', 'getCurrentMonthBillableSplit', 'getTotalRevenue',
  'getRecentTimesheetActivity', 'getTopPOsByHours', 'getMonthlyHoursTrend',
  'getEmployeeCountByCategory', 'getActiveCountsForPeriod', 'getEmployeeBillableBreakdown',
  'getBillableTrendDetail', 'getAnalyticsTiles', 'getMonthlyBillableUtilization',
  'getLeaveHoursTrend', 'getNoWorkTrend',
];
const ORIGINAL = {};
FN_NAMES.forEach((n) => { ORIGINAL[n] = dashboardRepo[n]; });
const restore = () => FN_NAMES.forEach((n) => { dashboardRepo[n] = ORIGINAL[n]; });

test('getDashboardStats: current_month exposes original_* next to synced hours', async () => {
  const stub = {
    getTotalEmployees: 5, getActiveEmployees: 4, getTotalClients: 2, getActivePOs: 1, getClosedPOs: 1,
    getCurrentMonthHoursWithOriginal: { total_hours: 176, original_total_hours: 190 },
    getCurrentMonthBillableSplit: {
      billable_hours: 150, non_billable_hours: 26, original_billable_hours: 160, original_non_billable_hours: 30,
    },
    getTotalRevenue: 0, getRecentTimesheetActivity: [], getTopPOsByHours: [], getMonthlyHoursTrend: [],
    getEmployeeCountByCategory: [], getActiveCountsForPeriod: { active_employees: 3, active_clients: 2 },
  };
  Object.entries(stub).forEach(([n, v]) => { dashboardRepo[n] = async () => v; });
  try {
    const res = await dashboardService.getDashboardStats({ month: 8, year: 2026 }, [1]);
    assert.equal(res.current_month.total_hours_logged, 176);
    assert.equal(res.current_month.original_total_hours_logged, 190);
    assert.equal(res.current_month.billable_hours_logged, 150);
    assert.equal(res.current_month.original_billable_hours_logged, 160);
    assert.equal(res.current_month.non_billable_hours_logged, 26);
    assert.equal(res.current_month.original_non_billable_hours_logged, 30);
  } finally { restore(); }
});

test('getEmployeeBillableBreakdown: original hours and original billable pct computed per employee', async () => {
  dashboardRepo.getEmployeeBillableBreakdown = async () => ({
    count: 1,
    rows: [
      { employee_id: 1, employee_code: 'E1', full_name: 'A', designation: 'X', service_po_id: 10, service_po_code: 'P1', service_po_name: 'PO1', service_type_name: 'T', is_billable: true, report_bucket_key: 'billable', hours: '80', original_hours: '90' },
      { employee_id: 1, employee_code: 'E1', full_name: 'A', designation: 'X', service_po_id: 11, service_po_code: 'P2', service_po_name: 'PO2', service_type_name: 'T', is_billable: false, report_bucket_key: 'non_billable', hours: '20', original_hours: '10' },
    ],
  });
  try {
    const { data } = await dashboardService.getEmployeeBillableBreakdown({ month: 8, year: 2026 }, [1]);
    const e = data[0];
    assert.equal(e.total_hours, 100);
    assert.equal(e.billable_pct, 80);
    assert.equal(e.original_billable_hours, 90);
    assert.equal(e.original_non_billable_hours, 10);
    assert.equal(e.original_total_hours, 100);
    assert.equal(e.original_billable_pct, 90);
    assert.equal(e.billable_reasons[0].original_hours, 90);
  } finally { restore(); }
});

test('getBillableTrend: original_* per month and original deltas', async () => {
  dashboardRepo.getBillableTrendDetail = async () => ([
    { year: 2026, month: 7, service_po_id: 1, service_po_name: 'P', is_billable: true, hours: '100', original_hours: '110' },
    { year: 2026, month: 8, service_po_id: 1, service_po_name: 'P', is_billable: true, hours: '60', original_hours: '75' },
    { year: 2026, month: 8, service_po_id: 2, service_po_name: 'Q', is_billable: false, hours: '40', original_hours: '25' },
  ]);
  try {
    const { trend } = await dashboardService.getBillableTrend({ month: 8, year: 2026, months: 2 }, [1]);
    const aug = trend[1];
    assert.equal(aug.total_hours, 100);
    assert.equal(aug.original_total_hours, 100);
    assert.equal(aug.original_billable_hours, 75);
    assert.equal(aug.original_billable_pct, 75);
    assert.equal(aug.change.original_billable_delta, -35);
    assert.equal(aug.change.billable_delta, -40);
  } finally { restore(); }
});

test('getMonthlyResourceUtilization: original utilization uses original billable / original total', async () => {
  dashboardRepo.getMonthlyBillableUtilization = async () => ([
    { year: 2026, month: 8, total_hours: '176', billable_hours: '88', original_total_hours: '200', original_billable_hours: '110' },
  ]);
  const empty = async () => [];
  const names = ['getCostTrendByType', 'getClientWiseCostAnalytics', 'getClientCategoryCostMatrix', 'getClientWiseAnalytics',
    'getLeaveHoursTrend', 'getNoWorkTrend', 'getProjectWiseAnalytics', 'getBudgetVsBilled'];
  const saved = {};
  names.forEach((n) => { saved[n] = dashboardRepo[n]; dashboardRepo[n] = empty; });
  const serviceCategoryRepo = require('../src/repositories/serviceCategoryRepository');
  const savedFindAll = serviceCategoryRepo.findAll;
  serviceCategoryRepo.findAll = async () => [];
  try {
    const res = await dashboardService.getMonthlyResourceUtilization({ month: 8, year: 2026 }, [1]);
    const row = res.monthly_resource_utilization[0];
    assert.equal(row.utilization_percentage, 50);
    assert.equal(row.original_total_hours, 200);
    assert.equal(row.original_billable_hours, 110);
    assert.equal(row.original_utilization_percentage, 55);
  } finally {
    names.forEach((n) => { dashboardRepo[n] = saved[n]; });
    serviceCategoryRepo.findAll = savedFindAll;
    restore();
  }
});
