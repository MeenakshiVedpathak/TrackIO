'use strict';

const repo = require('../repositories/utilisationReportRepository');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const { parseIdList } = require('../utils/idListParser');
const dateHelper = require('../helpers/dateHelper');
const logger = require('../utils/logger');
const { intersectCompanyIdsWithEntity, intersectIdsWithBuHierarchy } = require('./companyAccessControlService');

/**
 * Utilisation reports — see utilisationReportRepository.js for the data rules.
 */

// LIMIT NULL = no limit — used by the Excel export, which returns every matching row.
const EXPORT_ALL_PAGING = { page: 1, limit: null, offset: 0 };

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

function unprocessable(message) {
  const err = new Error(message);
  err.statusCode = 422;
  return err;
}

/**
 * Resolve the reporting period: month+year (default = current month) OR an
 * explicit startDate+endDate range. monthsInRange scales the 176-hr capacity
 * for ranges that span several calendar months.
 */
function resolvePeriod(query) {
  const hasRange = query.startDate || query.endDate;
  if (hasRange) {
    if (!query.startDate || !query.endDate) throw unprocessable('Both startDate and endDate are required together.');
    const start = new Date(`${query.startDate}T00:00:00Z`);
    const end = new Date(`${query.endDate}T00:00:00Z`);
    if (isNaN(start) || isNaN(end)) throw unprocessable('startDate and endDate must be valid dates (YYYY-MM-DD).');
    if (end < start) throw unprocessable('endDate cannot be before startDate.');
    const monthsInRange = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
    return { startDate: query.startDate, endDate: query.endDate, monthsInRange };
  }

  const now = new Date();
  const month = query.month ? parseInt(query.month, 10) : now.getMonth() + 1;
  const year = query.year ? parseInt(query.year, 10) : now.getFullYear();
  if (isNaN(month) || month < 1 || month > 12) throw unprocessable('month must be between 1 and 12.');
  if (isNaN(year)) throw unprocessable('year must be a valid year.');
  const { startDate, endDate } = dateHelper.getMonthBounds(month, year);
  return { startDate, endDate, monthsInRange: 1, month, year };
}

// Narrow (never widen) the caller's role/BU reach by the optional
// entity/business-unit multi-selects — same as every other report.
async function resolveCompanyIds(companyIds, query) {
  const entityId = query.entityId ? parseInt(query.entityId, 10) : undefined;
  const scoped = await intersectCompanyIdsWithEntity(companyIds, parseIdList(query.entityIds) ?? entityId);
  return intersectIdsWithBuHierarchy(scoped, parseIdList(query.businessUnitIds));
}

function commonFilters(query) {
  return {
    employeeIds: parseIdList(query.employeeIds ?? query.employeeId),
    clientIds: parseIdList(query.clientIds ?? query.clientId),
    projectIds: parseIdList(query.projectIds ?? query.poId ?? query.projectId),
    serviceTypeIds: parseIdList(query.serviceTypeIds ?? query.serviceTypeId ?? query.serviceTypes),
    search: query.search ? String(query.search).trim() : undefined,
    sortBy: query.sortBy ? String(query.sortBy).trim() : undefined,
    sortOrder: query.sortOrder && String(query.sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    hoursSource: query.hoursSource,
    roleId: query.roleId,
  };
}

const periodOut = (period) => ({
  startDate: period.startDate,
  endDate: period.endDate,
  month: period.month,
  year: period.year,
});

/**
 * Report 1 — BU-wise Utilisation.
 * Total Logged = Billable + Non-Billable + Customer Non-Billable (Leave, On
 * Bench and Idle excluded); Utilisation % = Total Logged / Expected x 100;
 * Expected = employees in the BU x Monthly Cap Hours (summed over the months in range).
 * Original* fields are the same figures using what employees actually logged, before the
 * monthly-cap adjustment (original util % = original total logged / the same Expected).
 * Not Logged = Expected - Total Logged (floored at 0).
 */
async function getBuWiseUtilisationReport(query, companyIds, { exportAll = false } = {}) {
  const period = resolvePeriod(query);
  const scopedCompanyIds = await resolveCompanyIds(companyIds, query);
  const { page, limit, offset } = exportAll ? EXPORT_ALL_PAGING : getPaginationParams(query);
  const filters = commonFilters(query);

  logger.info('Report: getBuWiseUtilisationReport', { period, filters, page, limit });

  const { rows, count, totals } = await repo.getBuWiseUtilisation({
    ...filters, ...period, companyIds: scopedCompanyIds, limit, offset,
  });

  const data = rows.map((r) => ({
    buId: r.bu_id,
    buName: r.bu_name,
    subBuName: r.sub_bu_name || null,
    totalEmployees: r.total_employees,
    expectedHours: round2(r.expected_hours),
    billableHours: round2(r.billable_hours),
    nonBillableHours: round2(r.non_billable_hours),
    customerNonBillableHours: round2(r.customer_non_billable_hours),
    totalLoggedHours: round2(r.total_logged_hours),
    utilizationPercentage: round2(r.utilization_percentage),
    originalBillableHours: round2(r.original_billable_hours),
    originalNonBillableHours: round2(r.original_non_billable_hours),
    originalCustomerNonBillableHours: round2(r.original_customer_non_billable_hours),
    originalTotalLoggedHours: round2(r.original_total_logged_hours),
    originalUtilizationPercentage: round2(r.original_utilization_percentage),
    notLoggedHours: round2(r.not_logged_hours),
  }));

  const t = totals || {};
  const expected = parseFloat(t.expected_hours) || 0;
  const summary = {
    buCount: t.bu_count || 0,
    totalEmployees: t.total_employees || 0,
    expectedHours: round2(expected),
    billableHours: round2(t.billable_hours),
    nonBillableHours: round2(t.non_billable_hours),
    customerNonBillableHours: round2(t.customer_non_billable_hours),
    totalLoggedHours: round2(t.total_logged_hours),
    // From aggregated hours, never an average of per-BU percentages.
    utilizationPercentage: expected > 0 ? round2((parseFloat(t.total_logged_hours) || 0) / expected * 100) : 0,
    originalBillableHours: round2(t.original_billable_hours),
    originalNonBillableHours: round2(t.original_non_billable_hours),
    originalCustomerNonBillableHours: round2(t.original_customer_non_billable_hours),
    originalTotalLoggedHours: round2(t.original_total_logged_hours),
    originalUtilizationPercentage: expected > 0 ? round2((parseFloat(t.original_total_logged_hours) || 0) / expected * 100) : 0,
    notLoggedHours: round2(t.not_logged_hours),
  };

  return { data, meta: getPaginationMeta(count, page, limit), summary, period: periodOut(period) };
}

/**
 * Report 2 — Employee x Project Utilisation (original vs after-sync).
 */
async function getEmployeeProjectUtilisationReport(query, companyIds, { exportAll = false } = {}) {
  const period = resolvePeriod(query);
  const scopedCompanyIds = await resolveCompanyIds(companyIds, query);
  const { page, limit, offset } = exportAll ? EXPORT_ALL_PAGING : getPaginationParams(query);
  const filters = {
    ...commonFilters(query),
    categoryIds: parseIdList(query.categoryIds ?? query.categoryId),
  };

  logger.info('Report: getEmployeeProjectUtilisationReport', { period, filters, page, limit });

  const { rows, count, totals } = await repo.getEmployeeProjectUtilisation({
    ...filters, ...period, companyIds: scopedCompanyIds, limit, offset,
  });

  const data = rows.map((r) => ({
    employeeId: r.employee_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    servicePoId: r.service_po_id,
    projectName: r.project_name,
    clientName: r.client_name,
    category: r.category_name,
    loggedHours: round2(r.logged_hours),
    adjustedHours: round2(r.adjusted_hours),
    originalUtilizationPercentage: round2(r.original_utilization_percentage),
    totalUtilizationPercentage: round2(r.total_utilization_percentage),
  }));

  const t = totals || {};
  const summary = {
    employeeCount: t.employee_count || 0,
    loggedHours: round2(t.logged_hours),
    adjustedHours: round2(t.adjusted_hours),
  };

  return { data, meta: getPaginationMeta(count, page, limit), summary, period: periodOut(period) };
}

module.exports = {
  getBuWiseUtilisationReport,
  getEmployeeProjectUtilisationReport,
};
