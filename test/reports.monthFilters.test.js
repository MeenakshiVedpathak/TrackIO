'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const managementReportRepo = require('../src/repositories/managementReportRepository');
const managementReportService = require('../src/services/managementReportService');
const reportRepo = require('../src/repositories/reportRepository');
const reportService = require('../src/services/reportService');

/**
 * Service PO Profitability (original hours + totals), Service PO Timeline Risk (monthly filter, hours cut
 * off at the same date as the elapsed %), Client Cost Analytics (month + client filters).
 */

test('Profitability: rows carry numeric hours + original hours, and the summary totals both', async () => {
  const original = managementReportRepo.getServicePOProfitability;
  try {
    managementReportRepo.getServicePOProfitability = async () => ({
      rows: [
        { service_po_id: 1, invoiced_amount: '100', delivery_cost: '40', margin: '60', hours_delivered: '175.98', original_hours_delivered: '187.50' },
        { service_po_id: 2, invoiced_amount: '50', delivery_cost: '10', margin: '40', hours_delivered: '10', original_hours_delivered: '12' },
      ],
      count: 2,
    });
    const result = await managementReportService.getServicePOProfitability({ month: 8, year: 2026 }, [1]);
    assert.equal(result.data[0].hours_delivered, 175.98);
    assert.equal(result.data[0].original_hours_delivered, 187.5);
    assert.equal(result.summary.total_hours_delivered, 185.98);
    assert.equal(result.summary.original_total_hours_delivered, 199.5);
  } finally {
    managementReportRepo.getServicePOProfitability = original;
  }
});

test('Timeline Risk: a month filter measures everything as of the END of that month and returns that month\'s own hours', async () => {
  const original = managementReportRepo.getServicePOTimelineRiskRaw;
  let seen = null;
  try {
    managementReportRepo.getServicePOTimelineRiskRaw = async (filters) => {
      seen = filters;
      return {
        rows: [{ service_po_id: 1, start_date: '2026-06-01', end_date: '2026-12-31', status: 'in-progress', hours_delivered_to_date: '190.68', original_hours_delivered_to_date: '190.68', hours_in_month: '190.68', original_hours_in_month: '190.68' }],
        count: 1,
      };
    };
    const result = await managementReportService.getServicePOTimelineRisk({ month: '8', year: '2026' }, [1]);
    assert.equal(seen.asOfDate, '2026-08-31');
    assert.equal(seen.monthStart, '2026-08-01');
    assert.equal(seen.monthEnd, '2026-08-31');
    assert.equal(result.as_of_date, '2026-08-31');
    assert.deepEqual(result.period, { month: 8, year: 2026, start_date: '2026-08-01', end_date: '2026-08-31' });
    // elapsed % is measured at that same date: Jun 1 -> Aug 31 of a Jun 1 -> Dec 31 PO
    assert.ok(result.data[0].elapsed_time_pct > 35 && result.data[0].elapsed_time_pct < 45);

    // no month and no date: nothing is cut off (everything logged so far), as before
    await managementReportService.getServicePOTimelineRisk({}, [1]);
    assert.equal(seen.asOfDate, null);
    assert.equal(seen.monthStart, null);
  } finally {
    managementReportRepo.getServicePOTimelineRiskRaw = original;
  }
});

test('Timeline Risk: month without year (or an invalid month) is rejected, an explicit asOfDate still wins', async () => {
  const original = managementReportRepo.getServicePOTimelineRiskRaw;
  let seen = null;
  try {
    managementReportRepo.getServicePOTimelineRiskRaw = async (filters) => { seen = filters; return { rows: [], count: 0 }; };
    await assert.rejects(managementReportService.getServicePOTimelineRisk({ month: '8' }, [1]), (e) => e.statusCode === 422);
    await assert.rejects(managementReportService.getServicePOTimelineRisk({ month: '13', year: '2026' }, [1]), (e) => e.statusCode === 422);
    await managementReportService.getServicePOTimelineRisk({ month: '8', year: '2026', asOfDate: '2026-08-15' }, [1]);
    assert.equal(seen.asOfDate, '2026-08-15');
  } finally {
    managementReportRepo.getServicePOTimelineRiskRaw = original;
  }
});

test('Client Cost Analytics: month window + client list go to BOTH the hours and the cost queries; no period stays all-time', async () => {
  const originals = {
    hours: reportRepo.getClientCostAnalyticsHours,
    cost: reportRepo.getClientCostAnalyticsCost,
    matrix: reportRepo.getClientCategoryCostMatrixReport,
  };
  const seen = {};
  try {
    reportRepo.getClientCostAnalyticsHours = async (f) => { seen.hours = f; return [{ client_id: 7, client_name: 'Acme', total_hours: '160', original_total_hours: '170' }]; };
    reportRepo.getClientCostAnalyticsCost = async (f) => { seen.cost = f; return [{ client_id: 7, client_name: 'Acme', total_cost: '900' }]; };
    reportRepo.getClientCategoryCostMatrixReport = async (f) => { seen.matrix = f; return []; };

    const result = await reportService.getClientCostAnalytics({ month: '8', year: '2026', clientIds: '7,9' }, [1]);
    for (const part of ['hours', 'cost', 'matrix']) {
      assert.equal(seen[part].startDate, '2026-08-01');
      assert.equal(seen[part].endDate, '2026-08-31');
      assert.deepEqual(seen[part].clientIds, [7, 9]);
    }
    assert.deepEqual(result.period, { start_date: '2026-08-01', end_date: '2026-08-31' });
    assert.equal(result.clients[0].total_hours, 160);
    assert.equal(result.clients[0].original_total_hours, 170);   // original comes from the same rows/filters

    await reportService.getClientCostAnalytics({}, [1]);
    assert.equal(seen.hours.startDate, undefined);
    assert.equal(seen.cost.startDate, undefined);
  } finally {
    reportRepo.getClientCostAnalyticsHours = originals.hours;
    reportRepo.getClientCostAnalyticsCost = originals.cost;
    reportRepo.getClientCategoryCostMatrixReport = originals.matrix;
  }
});

test('Client Cost Analytics: month + startDate together is rejected', async () => {
  await assert.rejects(reportService.getClientCostAnalytics({ month: '8', year: '2026', startDate: '2026-08-01', endDate: '2026-08-31' }, [1]), (e) => e.statusCode === 422);
});

test('Monthly Hours Trend: Original utilization % is original billable / original total (never mixed with adjusted hours)', async () => {
  const names = ['getMonthlyHoursByCategory', 'getMonthlyCostByCategory', 'getMonthlyUtilizationTrend', 'getLeaveHoursTrendReport', 'getNoWorkTrendReport'];
  const originals = Object.fromEntries(names.map((n) => [n, reportRepo[n]]));
  const serviceCategoryRepo = require('../src/repositories/serviceCategoryRepository');
  const originalFindAll = serviceCategoryRepo.findAll;
  try {
    reportRepo.getMonthlyHoursByCategory = async () => [];
    reportRepo.getMonthlyCostByCategory = async () => [];
    reportRepo.getLeaveHoursTrendReport = async () => [];
    reportRepo.getNoWorkTrendReport = async () => [];
    serviceCategoryRepo.findAll = async () => [];
    reportRepo.getMonthlyUtilizationTrend = async () => [{
      year: 2026, month: 8, total_hours: '14293.71', billable_hours: '9328.16', original_total_hours: '14509.73', original_billable_hours: '9475.35', employee_count: 104, cap_hours: '168',
    }, {
      year: 2026, month: 7, total_hours: '168', billable_hours: '168', original_total_hours: '300', original_billable_hours: '300', employee_count: 1, cap_hours: '168',
    }];
    const result = await reportService.getMonthlyHoursTrend({ month: '8', year: '2026' }, [1]);
    const aug = result.monthly_utilization[0];
    assert.equal(aug.utilization_percentage, 65.26);              // 9328.16 / 14293.71
    assert.equal(aug.original_utilization_percentage, 65.3);      // 9475.35 / 14509.73
    assert.equal(aug.original_total_hours, 14509.73);
    assert.equal(aug.original_billable_hours, 9475.35);

    // Against CAPACITY (people who logged x that month's cap): original hours above the cap exceed 100%.
    assert.equal(aug.capacity_hours, 17472);                              // 104 x 168
    assert.equal(aug.billable_vs_capacity_percentage, 53.39);
    const result7 = await reportService.getMonthlyHoursTrend({ startDate: '2026-07-01', endDate: '2026-08-31' }, [1]);
    const jul = result7.monthly_utilization.find((m) => m.month.startsWith('Jul'));
    assert.equal(jul.utilization_percentage, 100);                        // billable mix: 168 / 168
    assert.equal(jul.original_utilization_percentage, 100);               // billable mix: 300 / 300 (still all billable)
    assert.equal(jul.billable_vs_capacity_percentage, 100);               // 168 / (1 x 168)
    assert.equal(jul.original_billable_vs_capacity_percentage, 178.57);   // 300 / (1 x 168)
  } finally {
    for (const n of names) reportRepo[n] = originals[n];
    serviceCategoryRepo.findAll = originalFindAll;
  }
});
