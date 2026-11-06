'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Required BEFORE the service so we can monkey-patch its exported
// function — managementReportService.js holds a live reference to this
// SAME module-cached object. Same pattern as
// test/employeeService.duplicateCode.test.js.
const managementReportRepo = require('../src/repositories/managementReportRepository');
const managementReportService = require('../src/services/managementReportService');

const ORIGINAL = {
  getResourceStaffingPlanAccuracy: managementReportRepo.getResourceStaffingPlanAccuracy,
  getEmployeeCapacityForecast: managementReportRepo.getEmployeeCapacityForecast,
};

function restore() {
  managementReportRepo.getResourceStaffingPlanAccuracy = ORIGINAL.getResourceStaffingPlanAccuracy;
  managementReportRepo.getEmployeeCapacityForecast = ORIGINAL.getEmployeeCapacityForecast;
}

test('getResourceStaffingPlanAccuracy() forwards varianceThresholdPct to the repository (previously dropped — computed only as a display flag)', async () => {
  let receivedThreshold;
  managementReportRepo.getResourceStaffingPlanAccuracy = async (filters) => {
    receivedThreshold = filters.varianceThresholdPct;
    return { rows: [], count: 0 };
  };

  await managementReportService.getResourceStaffingPlanAccuracy(
    { month: 7, year: 2026, varianceThresholdPct: '567' },
    54
  );

  assert.equal(receivedThreshold, 567);
  restore();
});

test('getResourceStaffingPlanAccuracy() forwards undefined (no filtering) when the param is omitted entirely — unchanged pre-fix behavior', async () => {
  let receivedThreshold = 'not set';
  managementReportRepo.getResourceStaffingPlanAccuracy = async (filters) => {
    receivedThreshold = filters.varianceThresholdPct;
    return { rows: [], count: 0 };
  };

  await managementReportService.getResourceStaffingPlanAccuracy({ month: 7, year: 2026 }, 54);

  assert.equal(receivedThreshold, undefined);
  restore();
});

test('getResourceStaffingPlanAccuracy() still flags at_risk using the existing formula on whatever rows the repo returns', async () => {
  managementReportRepo.getResourceStaffingPlanAccuracy = async () => ({
    rows: [
      { variance_pct: '-100.00', planned_hours: 10, actual_hours: 0 },
      { variance_pct: null, planned_hours: 0, actual_hours: 5 },
    ],
    count: 2,
  });

  const result = await managementReportService.getResourceStaffingPlanAccuracy(
    { month: 7, year: 2026, varianceThresholdPct: '5' },
    54
  );

  assert.equal(result.data[0].at_risk, true); // |-100| >= 5
  assert.equal(result.data[1].at_risk, false); // null variance never satisfies a threshold
  assert.equal(result.summary.variance_threshold_filter_applied, true);
  restore();
});

test('getResourceStaffingPlanAccuracy() flags only UNDER-delivery as at_risk; working far over plan is over_plan, not at_risk', async () => {
  managementReportRepo.getResourceStaffingPlanAccuracy = async () => ({
    rows: [
      { variance_pct: '255.60', planned_hours: 20, actual_hours: 71.1 },
      { variance_pct: '-98.80', planned_hours: 80, actual_hours: 1 },
      { variance_pct: '10.00', planned_hours: 10, actual_hours: 11 },
    ],
    count: 3,
  });

  const result = await managementReportService.getResourceStaffingPlanAccuracy({ month: 9, year: 2026 }, 54);

  assert.deepEqual([result.data[0].at_risk, result.data[0].over_plan], [false, true]);
  assert.deepEqual([result.data[1].at_risk, result.data[1].over_plan], [true, false]);
  assert.deepEqual([result.data[2].at_risk, result.data[2].over_plan], [false, false]);
  assert.deepEqual(result.data.map((r) => r.status), ['over_plan', 'at_risk', 'ok']);
  restore();
});

test('getResourceStaffingPlanAccuracy() original_status is judged on ORIGINAL hours, independently of the adjusted status', async () => {
  managementReportRepo.getResourceStaffingPlanAccuracy = async () => ({
    rows: [
      // logged 188 on a 168 plan; the cap trimmed it back to exactly the plan
      { variance_pct: '0.00', planned_hours: 168, actual_hours: 168, original_variance_pct: '11.90', original_actual_hours: 188 },
      // logged hours on a PO with no plan
      { variance_pct: null, planned_hours: 0, actual_hours: 5, original_variance_pct: null, original_actual_hours: 8 },
    ],
    count: 2,
  });

  const result = await managementReportService.getResourceStaffingPlanAccuracy({ month: 9, year: 2026 }, 54);

  assert.equal(result.data[0].status, 'ok');
  assert.equal(result.data[0].original_status, 'ok'); // 11.9% < 20
  assert.equal(result.data[1].status, 'no_plan');
  assert.equal(result.data[1].original_status, 'no_plan');
  restore();
});

test('getEmployeeCapacityForecast() reads benchthresholdhours (the ACTUAL lowercase param name the frontend sends), not just the documented benchThresholdHours casing', async () => {
  let received;
  managementReportRepo.getEmployeeCapacityForecast = async (filters) => {
    received = filters.benchThresholdHours;
    return { rows: [], count: 0 };
  };

  await managementReportService.getEmployeeCapacityForecast(
    { month: 7, year: 2026, benchthresholdhours: '4' }, // exact casing from the bug report
    54
  );

  assert.equal(received, '4');
  restore();
});

test('getEmployeeCapacityForecast() also still accepts the documented camelCase benchThresholdHours', async () => {
  let received;
  managementReportRepo.getEmployeeCapacityForecast = async (filters) => {
    received = filters.benchThresholdHours;
    return { rows: [], count: 0 };
  };

  await managementReportService.getEmployeeCapacityForecast({ month: 7, year: 2026, benchThresholdHours: '4' }, 54);

  assert.equal(received, '4');
  restore();
});

test('getEmployeeCapacityForecast() forwards undefined (no filtering) when the param is omitted entirely', async () => {
  let received = 'not set';
  managementReportRepo.getEmployeeCapacityForecast = async (filters) => {
    received = filters.benchThresholdHours;
    return { rows: [], count: 0 };
  };

  await managementReportService.getEmployeeCapacityForecast({ month: 7, year: 2026 }, 54);

  assert.equal(received, undefined);
  restore();
});
