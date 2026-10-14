'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardRepo = require('../src/repositories/dashboardRepository');
const serviceCategoryRepo = require('../src/repositories/serviceCategoryRepository');
const { Company } = require('../src/models');
const dashboardService = require('../src/services/dashboardService');

/**
 * GET /dashboard/analytics and /dashboard/analytics2 previously had no
 * entityIds/businessUnitIds narrowing at all. Both share the same
 * applyEntityBuFilters() entry point in dashboardService.js — verified here
 * via getTotalEmployees(companyId), the simplest of the many Promise.all
 * calls getAnalyticsDashboard() fans out to (a single companyId argument,
 * easy to assert on).
 */

const REPO_FN_NAMES = [
  'getAnalyticsTiles', 'getAnalyticsMonthlyTrend', 'getAnalyticsHoursByClient',
  'getAnalyticsHoursByEmployee', 'getAnalyticsClientByPO', 'getAnalyticsBenchDetail',
  'getTotalEmployees', 'getActiveEmployees', 'getBuMappedActiveEmployees', 'getTotalClients', 'getActivePOs',
  'getClosedPOs', 'getTotalBudgetCost', 'getEmployeeCountByCategoryForPeriod',
  'getTopPOsByHoursForPeriod', 'getRecentTimesheetActivityForPeriod',
  'getEmployeesByPOForPeriod', 'getEmployeeBillableBreakdownForPeriod',
];

const ORIGINAL = { companyFindAll: Company.findAll };
REPO_FN_NAMES.forEach((name) => { ORIGINAL[name] = dashboardRepo[name]; });

function restore() {
  Company.findAll = ORIGINAL.companyFindAll;
  REPO_FN_NAMES.forEach((name) => { if (ORIGINAL[name]) dashboardRepo[name] = ORIGINAL[name]; });
}

function stubAllRepoCalls(overrides = {}) {
  REPO_FN_NAMES.forEach((name) => {
    dashboardRepo[name] = overrides[name] || (async () => (name.startsWith('get') && name.includes('Total') ? 0 : []));
  });
}

test('getAnalyticsDashboard: businessUnitIds narrows companyId (array) before any downstream repo call', async () => {
  let receivedCompanyId;
  stubAllRepoCalls({
    getTotalEmployees: async (companyId) => { receivedCompanyId = companyId; return 0; },
  });

  try {
    await dashboardService.getAnalyticsDashboard({ businessUnitIds: '2,999' }, [1, 2, 3]);
    assert.deepEqual(receivedCompanyId, [2]);
  } finally {
    restore();
  }
});

test('getAnalyticsDashboard: the Employees KPI counts only active, BU-mapped employees (Sub-BU-mapped where the BU has Sub-BUs)', async () => {
  stubAllRepoCalls({
    getTotalEmployees: async () => 354, // everyone in scope, inactive included
    getActiveEmployees: async () => 351,
    getBuMappedActiveEmployees: async () => 178, // the rule
  });

  try {
    const { workforce } = await dashboardService.getAnalyticsDashboard({}, [1]);
    assert.equal(workforce.total_employees, 178);
    assert.equal(workforce.active_employees, 178);
    assert.equal(workforce.active_employees_not_counted, 351 - 178);
    assert.equal(workforce.inactive_employees, 354 - 351);
  } finally {
    restore();
  }
});

test('getAnalyticsDashboard: no entityIds/businessUnitIds -> companyId array unchanged (regression baseline)', async () => {
  let receivedCompanyId;
  stubAllRepoCalls({
    getTotalEmployees: async (companyId) => { receivedCompanyId = companyId; return 0; },
  });

  try {
    await dashboardService.getAnalyticsDashboard({}, [1, 2, 3]);
    assert.deepEqual(receivedCompanyId, [1, 2, 3]);
  } finally {
    restore();
  }
});

test('getMonthlyResourceUtilization (analytics2): entityIds narrows companyId via a real Entity->Company lookup', async () => {
  let receivedCompanyId;
  const originalCategoryFindAll = serviceCategoryRepo.findAll;
  Company.findAll = async () => [{ id: 1 }, { id: 2 }];
  serviceCategoryRepo.findAll = async ({ companyId }) => { receivedCompanyId = companyId; return []; };
  stubAllRepoCalls();

  try {
    await dashboardService.getMonthlyResourceUtilization({ entityIds: '5,6' }, [1, 2, 3]);
    assert.deepEqual((receivedCompanyId || []).sort(), [1, 2]);
  } finally {
    serviceCategoryRepo.findAll = originalCategoryFindAll;
    restore();
  }
});
