'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repo = require('../src/repositories/managementReportRepository');
const service = require('../src/services/managementReportService');

function stub(name, fn) {
  const orig = repo[name];
  repo[name] = fn;
  return () => { repo[name] = orig; };
}

test('getPMWiseUtilization summary carries original_total_logged_hours and original_utilization_pct', async () => {
  const restore = stub('getPMWiseUtilization', async () => ({
    rows: [], count: 0,
    summary: { total_resource_count: 2, total_project_count: 1, total_logged_hours: 100, original_total_logged_hours: 120, total_available_hours: 200 },
  }));
  try {
    const res = await service.getPMWiseUtilization({ month: '8', year: '2026' }, [1]);
    assert.equal(res.summary.total_logged_hours, 100);
    assert.equal(res.summary.original_total_logged_hours, 120);
    assert.equal(res.summary.utilization_pct, 50);
    assert.equal(res.summary.original_utilization_pct, 60);
  } finally { restore(); }
});

test('getProjectWiseUtilization summary: original pct is 0 when no available hours', async () => {
  const restore = stub('getProjectWiseUtilization', async () => ({
    rows: [], count: 0,
    summary: { total_resource_count: 1, total_logged_hours: 10, original_total_logged_hours: 12, total_available_hours: 0 },
  }));
  try {
    const res = await service.getProjectWiseUtilization({ month: '8', year: '2026' }, [1]);
    assert.equal(res.summary.original_total_logged_hours, 12);
    assert.equal(res.summary.original_utilization_pct, 0);
  } finally { restore(); }
});

test('getResourceStaffingPlanAccuracy adds original_at_risk and original summary totals', async () => {
  const restore = stub('getResourceStaffingPlanAccuracy', async () => ({
    rows: [{ planned_hours: 100, actual_hours: 100, variance_pct: 0, original_actual_hours: 60, original_variance_pct: -40 }],
    count: 1,
  }));
  try {
    const res = await service.getResourceStaffingPlanAccuracy({ month: '8', year: '2026' }, [1]);
    assert.equal(res.data[0].at_risk, false);
    assert.equal(res.data[0].original_at_risk, true);
    assert.equal(res.data[0].original_over_plan, false);
    assert.equal(res.summary.total_original_actual_hours, 60);
    assert.equal(res.summary.total_original_variance_hours, -40);
  } finally { restore(); }
});

test('getResourceCostUtilization maps original month and summary fields', async () => {
  const restore = stub('getResourceCostUtilization', async () => ({
    rows: [{ employee_id: 1, months: [{ month: 8, year: 2026, cappedHours: 176, loggedHours: 176, actualPercentage: 100, contribution: 10, originalLoggedHours: 190, originalActualPercentage: 107.95, originalContribution: 10.8 }] }],
    count: 1,
    summary: [{ month: 8, year: 2026, original_total_logged_hours: '190', original_total_contribution: '10.8' }],
  }));
  try {
    const res = await service.getResourceCostUtilization({ month: '8', year: '2026' }, [1]);
    const m = res.data[0].months[0];
    assert.equal(m.loggedHours, 176);
    assert.equal(m.originalLoggedHours, 190);
    assert.equal(m.originalActualPercentage, 107.95);
    assert.equal(m.originalContribution, 10.8);
    assert.equal(res.summary[0].originalTotalLoggedHours, 190);
    assert.equal(res.summary[0].originalTotalContribution, 10.8);
  } finally { restore(); }
});

test('getServiceLineBusinessMix summary adds original_total_hours_delivered', async () => {
  const restore = stub('getServiceLineBusinessMix', async () => ({
    rows: [{ service_type_id: 1, hours_delivered: 10, original_hours_delivered: 12, delivery_cost: 0, invoiced_amount: 0, margin: 0 }],
    priorRows: [],
  }));
  try {
    const res = await service.getServiceLineBusinessMix({ month: '8', year: '2026' }, [1]);
    assert.equal(res.summary.total_hours_delivered, 10);
    assert.equal(res.summary.original_total_hours_delivered, 12);
  } finally { restore(); }
});
