'use strict';

const moment = require('moment-timezone');
const teamLeadEmployeeProjectHoursReportRepository = require('../repositories/teamLeadEmployeeProjectHoursReportRepository');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const { parseIdList } = require('../utils/idListParser');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { Company } = require('../models');
const { expandBusinessUnitIdsWithDescendants } = require('./companyAccessControlService');

/**
 * Team Lead Employee Project Hours Report — which Employees reporting to the
 * caller (PRIMARY/SECONDARY manager mapping ONLY) worked on which
 * Client / Project / SPO, and how many hours. See the repository for the
 * access rule and data source.
 */

/**
 * month+year -> that calendar month; otherwise startDate/endDate as given.
 * @returns {{ startDate: string|undefined, endDate: string|undefined }}
 */
function resolveDateRange(query) {
  if (query.month && query.year) {
    const start = moment.utc({ year: Number(query.year), month: Number(query.month) - 1, day: 1 });
    return { startDate: start.format('YYYY-MM-DD'), endDate: start.clone().endOf('month').format('YYYY-MM-DD') };
  }
  return { startDate: query.startDate || undefined, endDate: query.endDate || undefined };
}

/**
 * The report's filters (shared by the paged report and the export). The
 * manager is always the authenticated caller, never a query value.
 */
function parseFilters(query, managerEmployeeId) {
  const { startDate, endDate } = resolveDateRange(query);
  return {
    managerEmployeeId,
    startDate,
    endDate,
    employeeIds: parseIdList(query.employeeIds) || [],
    clientIds: parseIdList(query.clientIds) || [],
    projectIds: parseIdList(query.projectIds) || [],
    servicePoIds: parseIdList(query.servicePoIds) || [],
    buIds: parseIdList(query.buIds) || [],
    subBuIds: parseIdList(query.subBuIds) || [],
    statuses: query.status ? String(query.status).split(',').map((s) => s.trim()).filter(Boolean) : [],
    search: query.search || undefined,
  };
}

const EXPORT_COLUMNS = [
  { key: 'employee', label: 'Employee', width: 32 },
  { key: 'client_name', label: 'Client', width: 26 },
  { key: 'project_name', label: 'Project', width: 28 },
  { key: 'spo', label: 'SPO', width: 36 },
  { key: 'hours_name', label: 'Module / Task', width: 32 },
  { key: 'bu_name', label: 'BU', width: 22 },
  { key: 'sub_bu_name', label: 'Sub-BU', width: 22 },
  { key: 'logged_hours', label: 'Logged Hours', width: 14, numFmt: '0.00' },
  { key: 'work_date', label: 'Date', width: 12 },
  { key: 'description', label: 'Description', width: 48 },
  { key: 'status', label: 'Status', width: 12 },
];

/** "Name (CODE)", or whichever part exists. */
function nameWithCode(name, code) {
  if (name && code) return `${name} (${code})`;
  return name || code || '';
}

function toExportRow(row) {
  return {
    employee: nameWithCode(row.employee_name, row.employee_code),
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    spo: nameWithCode(row.spo_name, row.service_po_code),
    hours_name: row.hours_name || '',
    bu_name: row.bu_name || '',
    sub_bu_name: row.sub_bu_name || '',
    logged_hours: row.logged_hours,
    work_date: row.work_date,
    description: row.description || '',
    status: row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : '',
  };
}

function shapeRow(row) {
  return {
    work_log_id: row.work_log_id,
    work_date: typeof row.work_date === 'string' ? row.work_date.slice(0, 10) : moment.utc(row.work_date).format('YYYY-MM-DD'),
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    mapping_type: row.mapping_type,
    client_id: row.client_id,
    client_name: row.client_name,
    project_id: row.project_id,
    project_name: row.project_name,
    service_po_id: row.service_po_id,
    service_po_code: row.service_po_code,
    spo_name: row.spo_name,
    hours_name: row.hours_name,
    bu_id: row.bu_id,
    bu_name: row.bu_name,
    sub_bu_id: row.sub_bu_id,
    sub_bu_name: row.sub_bu_name,
    logged_hours: parseFloat(row.logged_hours) || 0,
    description: row.description,
    status: row.status,
  };
}

/**
 * @param {object} query - validated req.query
 * @param {number} managerEmployeeId - req.employeeId (the authenticated caller)
 * @returns {Promise<{ data: object[], meta: object, summary: object }>}
 */
async function getReport(query, managerEmployeeId) {
  const { page, limit, offset } = getPaginationParams(query);
  const filters = {
    ...parseFilters(query, managerEmployeeId),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit,
    offset,
  };
  const { startDate, endDate } = filters;
  logger.info('Report: getTeamLeadEmployeeProjectHours', { managerEmployeeId, startDate, endDate, page, limit });

  const { rows, total, totalHours } = await teamLeadEmployeeProjectHoursReportRepository.getTeamLeadEmployeeProjectHours(filters);
  return {
    data: rows.map(shapeRow),
    meta: getPaginationMeta(total, page, limit),
    summary: { total_logged_hours: Math.round(totalHours * 100) / 100, period: { start_date: startDate || null, end_date: endDate || null } },
  };
}

/**
 * Filter dropdown options (Employee/Client/Project/SPO/BU/Sub-BU) limited to
 * the caller's own mapped Employees — see repository getFilterOptions().
 * Accepts the same month+year or startDate/endDate as the report.
 */
async function getFilterOptions(query, managerEmployeeId) {
  const { startDate, endDate } = resolveDateRange(query);
  const entityIds = parseIdList(query.entityIds) || [];
  const buIds = parseIdList(query.buIds) || [];
  const subBuIds = parseIdList(query.subBuIds) || [];
  const employeeBusinessUnitIds = await resolveEmployeeBusinessUnitIds({ entityIds, buIds, subBuIds });
  return teamLeadEmployeeProjectHoursReportRepository.getFilterOptions({
    managerEmployeeId, startDate, endDate, entityIds, buIds, subBuIds, employeeBusinessUnitIds,
  });
}

/**
 * The Business Unit ids an Employee must be mapped to for the filter-options Employee list, from the
 * optional entityIds / buIds / subBuIds: a BU also covers its Sub-BUs; subBuIds must fall inside the
 * selected BUs when both are sent; entityIds restricts all of it to those Entities' BUs (AND).
 * @returns {Promise<number[]|null>} null when no BU/Entity filter was sent (Employees unfiltered)
 */
async function resolveEmployeeBusinessUnitIds({ entityIds, buIds, subBuIds }) {
  if (!entityIds.length && !buIds.length && !subBuIds.length) return null;
  let ids = null;
  if (buIds.length) ids = await expandBusinessUnitIdsWithDescendants(buIds);
  if (subBuIds.length) ids = ids ? ids.filter((id) => subBuIds.includes(id)) : subBuIds;
  if (entityIds.length) {
    const underEntities = await Company.findAll({
      where: { entity_id: { [Op.in]: entityIds }, is_deleted: false },
      attributes: ['id'],
      raw: true,
    });
    const entityCompanyIds = underEntities.map((c) => c.id);
    ids = ids ? ids.filter((id) => entityCompanyIds.includes(id)) : entityCompanyIds;
  }
  return ids;
}

/**
 * Every row matching the report's filters (no pagination) for the Excel
 * export — same caller-only manager scoping as getReport().
 * @param {object} query - validated req.query
 * @param {number} managerEmployeeId - req.employeeId (the authenticated caller)
 * @returns {Promise<{ rows: object[], columns: object[], period: { startDate: string|null, endDate: string|null } }>}
 */
async function getExport(query, managerEmployeeId) {
  const filters = parseFilters(query, managerEmployeeId);
  const toDay = (d) => (d ? moment.utc(d).format('YYYY-MM-DD') : null);
  const period = { startDate: toDay(filters.startDate), endDate: toDay(filters.endDate) };
  logger.info('Report: exportTeamLeadEmployeeProjectHours', { managerEmployeeId, ...period });

  const rows = await teamLeadEmployeeProjectHoursReportRepository.getAllTeamLeadEmployeeProjectHours(filters);
  return { rows: rows.map(shapeRow).map(toExportRow), columns: EXPORT_COLUMNS, period };
}

module.exports = { getReport, getExport, getFilterOptions, resolveDateRange, EXPORT_COLUMNS };
