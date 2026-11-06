'use strict';

const employeeRoleBuMappingReportRepository = require('../repositories/employeeRoleBuMappingReportRepository');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const { parseIdList } = require('../utils/idListParser');
const logger = require('../utils/logger');

/**
 * Employee Role & Organization Mapping Report — one row per Employee with
 * their Roles, BUs and Sub BUs (each comma-separated). See
 * employeeRoleBuMappingReportRepository for the query and filter semantics.
 */

const EXPORT_COLUMNS = [
  { key: 'employee_name', label: 'Employee Name', width: 28 },
  { key: 'roles', label: 'Roles', width: 36 },
  { key: 'business_units', label: 'BUs', width: 36 },
  { key: 'sub_business_units', label: 'Sub BUs', width: 36 },
];

function parseFilters(query, companyIds) {
  return {
    companyIds,
    entityIds: parseIdList(query.entityIds) || [],
    buIds: parseIdList(query.buIds) || [],
    subBuIds: parseIdList(query.subBuIds) || [],
    roleIds: parseIdList(query.roleIds) || [],
    employeeId: query.employeeId ? parseInt(query.employeeId, 10) : undefined,
    search: query.search || undefined,
  };
}

function shapeRow(row) {
  return {
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    roles: row.roles || '',
    business_units: row.business_units || '',
    sub_business_units: row.sub_business_units || '',
  };
}

/**
 * @param {object} query - validated req.query
 * @param {number[]} companyIds - req.companyIds (caller's BU reach)
 * @returns {Promise<{ data: object[], meta: object }>}
 */
async function getReport(query, companyIds) {
  const { page, limit, offset } = getPaginationParams(query);
  const filters = parseFilters(query, companyIds);
  logger.info('Report: getEmployeeRoleBuMapping', { ...filters, companyIds: undefined, page, limit });

  const { rows, total } = await employeeRoleBuMappingReportRepository.getEmployeeRoleBuMapping({ ...filters, limit, offset });
  return { data: rows.map(shapeRow), meta: getPaginationMeta(total, page, limit) };
}

/**
 * Every row matching the same filters (no pagination) for the Excel export.
 * @returns {Promise<{ rows: object[], columns: object[] }>}
 */
async function getExport(query, companyIds) {
  const filters = parseFilters(query, companyIds);
  const { rows } = await employeeRoleBuMappingReportRepository.getEmployeeRoleBuMapping({ ...filters, limit: null });
  return { rows: rows.map(shapeRow), columns: EXPORT_COLUMNS };
}

module.exports = { getReport, getExport, EXPORT_COLUMNS };
