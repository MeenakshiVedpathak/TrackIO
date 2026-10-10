'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Patch the repository BEFORE requiring the service — the service holds a live reference to this module object.
const repo = require('../src/repositories/utilisationReportRepository');
const service = require('../src/services/utilisationReportService');

const ORIGINAL_BU = repo.getBuWiseUtilisation;
test.after(() => { repo.getBuWiseUtilisation = ORIGINAL_BU; });

test('BU-wise utilisation exposes original logged hours, original utilisation % and not-logged hours', async () => {
  repo.getBuWiseUtilisation = async () => ({
    rows: [{
      bu_id: 1, bu_name: 'BU A', sub_bu_name: null, total_employees: 2,
      expected_hours: '336.00',
      billable_hours: '100.00', non_billable_hours: '40.00', customer_non_billable_hours: '28.00',
      total_logged_hours: '168.00',
      original_billable_hours: '110.00', original_non_billable_hours: '42.00', original_customer_non_billable_hours: '28.00',
      original_total_logged_hours: '180.00',
      utilization_percentage: '50.00', original_utilization_percentage: '53.57',
      not_logged_hours: '168.00',
      full_count: '1',
    }],
    count: 1,
    totals: {
      bu_count: 1, total_employees: 2, expected_hours: '336.00',
      billable_hours: '100.00', non_billable_hours: '40.00', customer_non_billable_hours: '28.00',
      total_logged_hours: '168.00',
      original_billable_hours: '110.00', original_non_billable_hours: '42.00', original_customer_non_billable_hours: '28.00',
      original_total_logged_hours: '180.00',
      not_logged_hours: '168.00',
    },
  });

  const { data, summary } = await service.getBuWiseUtilisationReport({ month: 10, year: 2026 }, [1]);

  assert.equal(data[0].totalLoggedHours, 168);
  assert.equal(data[0].originalTotalLoggedHours, 180);
  assert.equal(data[0].originalBillableHours, 110);
  assert.equal(data[0].utilizationPercentage, 50);
  assert.equal(data[0].originalUtilizationPercentage, 53.57);
  assert.equal(data[0].notLoggedHours, 168);

  // Summary % come from aggregated hours, never an average of the per-BU percentages.
  assert.equal(summary.originalTotalLoggedHours, 180);
  assert.equal(summary.originalUtilizationPercentage, 53.57);
  assert.equal(summary.notLoggedHours, 168);
});
