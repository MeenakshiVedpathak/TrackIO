'use strict';

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * Utilisation report queries — (1) BU-wise Utilisation, (2) Employee × Project
 * Utilisation (original vs after-sync adjusted hours).
 *
 * Source of truth is the official `timesheets` table: hours_logged is the
 * original logged value, COALESCE(modified_hours, hours_logged) is the
 * "adjusted / after sync" value (same convention as every other report —
 * hoursSource 'O' selects the original instead).
 */

const MONTHLY_CAPACITY = 176;

// Utility POs that are never "work": excluded from Billable/Non-Billable/
// Customer Non-Billable and from Total Logged in the BU-wise report.
// Matched by PO name (Idle / On Bench / Leaves) or by a Leave service type.
const EXCLUDED_PO_SQL = `(
  LOWER(TRIM(sp.service_po_name)) IN ('idle', 'on bench', 'leave', 'leaves')
  OR st.service_type_name ILIKE '%leave%'
)`;

const CAT_BILLABLE_SQL = `LOWER(TRIM(sc.name)) = 'billable'`;
const CAT_CUSTOMER_NB_SQL = `LOWER(TRIM(sc.name)) = 'customer non-billable'`;
const CAT_NON_BILLABLE_SQL = `LOWER(TRIM(sc.name)) = 'non-billable'`;

const isEmptyScope = (ids) => !ids || ids.length === 0;

const hoursColumn = (hoursSource) => (
  hoursSource === 'O' ? 't.hours_logged' : 'COALESCE(t.modified_hours, t.hours_logged)'
);

// Role 5 only sees rows from published imports (same guard as the other reports).
const publishGuardSql = (roleId) => (
  Number(roleId) === 5
    ? `EXISTS (SELECT 1 FROM timesheet_import_history h WHERE h.id = t.timesheet_import_id AND h.is_publish = true)`
    : ''
);

const ORDERABLE_BU = {
  buName: 'bu_name',
  subBuName: 'sub_bu_name',
  employeeCount: 'total_employees',
  expectedHours: 'expected_hours',
  billableHours: 'billable_hours',
  nonBillableHours: 'non_billable_hours',
  customerNonBillableHours: 'customer_non_billable_hours',
  totalLoggedHours: 'total_logged_hours',
  utilizationPercentage: 'utilization_percentage',
};

const ORDERABLE_EMP_PROJECT = {
  employeeName: 'employee_name',
  employeeCode: 'employee_code',
  projectName: 'project_name',
  loggedHours: 'logged_hours',
  adjustedHours: 'adjusted_hours',
  originalUtilizationPercentage: 'original_utilization_percentage',
  totalUtilizationPercentage: 'total_utilization_percentage',
};

/**
 * Report 1 — BU-wise Utilisation. One row per Business Unit in the caller's
 * reach (Admin: all; BU Admin: only their mapped BUs — that is exactly what
 * filters.companyIds already carries).
 *
 * @param {object} f
 * @param {string} f.startDate
 * @param {string} f.endDate
 * @param {number} f.monthsInRange
 * @param {number[]} f.companyIds
 * @param {number[]} [f.employeeIds]
 * @param {number[]} [f.clientIds]
 * @param {number[]} [f.projectIds]
 * @param {number[]} [f.serviceTypeIds]
 * @param {string} [f.search]            BU name
 * @param {string} [f.hoursSource]
 * @param {string|number} [f.roleId]
 * @param {string} [f.sortBy]
 * @param {string} [f.sortOrder]
 * @param {number} f.limit
 * @param {number} f.offset
 */
async function getBuWiseUtilisation(f) {
  const empty = { rows: [], count: 0, totals: null };
  if (isEmptyScope(f.companyIds)) return empty;

  const hoursCol = hoursColumn(f.hoursSource);
  const guard = publishGuardSql(f.roleId);
  const replacements = {
    startDate: f.startDate,
    endDate: f.endDate,
    companyIds: f.companyIds,
    capacity: MONTHLY_CAPACITY * f.monthsInRange,
    limit: f.limit,
    offset: f.offset,
  };

  const tsConditions = [
    't.timesheet_date BETWEEN :startDate AND :endDate',
    't.company_id IN (:companyIds)',
    'e.is_deleted = false',
    "e.status = 'active'",
    'sp.is_deleted = false',
  ];
  const empConditions = ['e.is_deleted = false', "e.status = 'active'"];

  if (f.employeeIds && f.employeeIds.length) {
    tsConditions.push('t.employee_id IN (:employeeIds)');
    empConditions.push('e.id IN (:employeeIds)');
    replacements.employeeIds = f.employeeIds;
  }
  if (f.clientIds && f.clientIds.length) {
    tsConditions.push('sp.client_id IN (:clientIds)');
    replacements.clientIds = f.clientIds;
  }
  if (f.projectIds && f.projectIds.length) {
    tsConditions.push('sp.id IN (:projectIds)');
    replacements.projectIds = f.projectIds;
  }
  if (f.serviceTypeIds && f.serviceTypeIds.length) {
    tsConditions.push('st.id IN (:serviceTypeIds)');
    replacements.serviceTypeIds = f.serviceTypeIds;
  }
  if (guard) tsConditions.push(guard);

  const buConditions = [
    'c.id IN (:companyIds)',
    'c.is_deleted = false',
  ];
  if (f.search) {
    buConditions.push('(c.company_name ILIKE :search OR p.company_name ILIKE :search)');
    replacements.search = `%${f.search}%`;
  }

  const orderCol = ORDERABLE_BU[f.sortBy] || 'bu_name';
  const orderDir = f.sortOrder === 'DESC' ? 'DESC' : 'ASC';

  // Headcount = active Employees mapped to the BU (employee_business_units
  // or the legacy employees.company_id). Hours = timesheet rows stamped with
  // that BU's company_id.
  const baseCte = `
    WITH bus AS (
      SELECT c.id AS bu_id,
        COALESCE(p.company_name, c.company_name) AS bu_name,
        CASE WHEN p.id IS NOT NULL THEN c.company_name END AS sub_bu_name
      FROM companies c
      LEFT JOIN companies p ON p.id = c.parent_business_unit_id
      WHERE ${buConditions.join(' AND ')}
    ),
    emp_counts AS (
      SELECT b.bu_id, COUNT(DISTINCT e.id) AS total_employees
      FROM bus b
      JOIN employees e ON ${empConditions.join(' AND ')}
        AND (
          e.company_id = b.bu_id
          OR EXISTS (
            SELECT 1 FROM employee_business_units ebu
            WHERE ebu.employee_id = e.id AND ebu.business_unit_id = b.bu_id AND ebu.status = 'active'
          )
        )
      GROUP BY b.bu_id
    ),
    hours AS (
      SELECT
        t.company_id AS bu_id,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_BILLABLE_SQL} THEN ${hoursCol} ELSE 0 END), 0) AS billable_hours,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_CUSTOMER_NB_SQL} THEN ${hoursCol} ELSE 0 END), 0) AS customer_non_billable_hours,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_NON_BILLABLE_SQL} THEN ${hoursCol} ELSE 0 END), 0) AS non_billable_hours
      FROM timesheets t
      JOIN employees e           ON e.id  = t.employee_id
      JOIN service_pos sp        ON sp.id = t.service_po_id
      JOIN service_types st      ON st.id = sp.service_type_id
      JOIN service_categories sc ON sc.id = st.service_category_id
      WHERE ${tsConditions.join(' AND ')}
      GROUP BY t.company_id
    ),
    report AS (
      SELECT
        b.bu_id,
        b.bu_name,
        b.sub_bu_name,
        COALESCE(ec.total_employees, 0)::int AS total_employees,
        COALESCE(ec.total_employees, 0) * :capacity AS expected_hours,
        ROUND(COALESCE(h.billable_hours, 0)::numeric, 2) AS billable_hours,
        ROUND(COALESCE(h.non_billable_hours, 0)::numeric, 2) AS non_billable_hours,
        ROUND(COALESCE(h.customer_non_billable_hours, 0)::numeric, 2) AS customer_non_billable_hours,
        ROUND((COALESCE(h.billable_hours, 0) + COALESCE(h.non_billable_hours, 0) + COALESCE(h.customer_non_billable_hours, 0))::numeric, 2) AS total_logged_hours
      FROM bus b
      LEFT JOIN emp_counts ec ON ec.bu_id = b.bu_id
      LEFT JOIN hours h       ON h.bu_id  = b.bu_id
    ),
    final AS (
      SELECT r.*,
        CASE WHEN r.expected_hours > 0 THEN ROUND((r.total_logged_hours / r.expected_hours * 100)::numeric, 2) ELSE 0 END AS utilization_percentage
      FROM report r
    )
  `;

  const [rows, totalsRows] = await Promise.all([
    sequelize.query(
      `${baseCte}
       SELECT *, COUNT(*) OVER() AS full_count FROM final
       ORDER BY ${orderCol} ${orderDir}, bu_name ASC, sub_bu_name ASC NULLS FIRST
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `${baseCte}
       SELECT
         COUNT(*)::int AS bu_count,
         COALESCE(SUM(total_employees), 0)::int AS total_employees,
         COALESCE(SUM(expected_hours), 0) AS expected_hours,
         COALESCE(SUM(billable_hours), 0) AS billable_hours,
         COALESCE(SUM(non_billable_hours), 0) AS non_billable_hours,
         COALESCE(SUM(customer_non_billable_hours), 0) AS customer_non_billable_hours,
         COALESCE(SUM(total_logged_hours), 0) AS total_logged_hours
       FROM final`,
      { replacements, type: QueryTypes.SELECT }
    ),
  ]);

  return {
    rows,
    count: rows.length ? parseInt(rows[0].full_count, 10) : (parseInt(totalsRows[0]?.bu_count, 10) || 0),
    totals: totalsRows[0] || null,
  };
}

/**
 * Report 2 — Employee × Project Utilisation. One row per (Employee, Service
 * PO) with that project's original and after-sync hours, plus the Employee's
 * OVERALL original / after-sync utilisation % (their whole-period total
 * across every project in scope, not just this row's project — so the %
 * stays the same on each of an Employee's rows and is unaffected by the
 * project/client/service-type filters).
 *
 * @param {object} f - see getBuWiseUtilisation, plus categoryIds
 */
async function getEmployeeProjectUtilisation(f) {
  const empty = { rows: [], count: 0, totals: null };
  if (isEmptyScope(f.companyIds)) return empty;

  const guard = publishGuardSql(f.roleId);
  const replacements = {
    startDate: f.startDate,
    endDate: f.endDate,
    companyIds: f.companyIds,
    capacity: MONTHLY_CAPACITY * f.monthsInRange,
    limit: f.limit,
    offset: f.offset,
  };

  // Scope shared by both the per-employee totals and the detail rows.
  const scope = [
    't.timesheet_date BETWEEN :startDate AND :endDate',
    't.company_id IN (:companyIds)',
    'e.is_deleted = false',
    "e.status = 'active'",
    'sp.is_deleted = false',
  ];
  if (f.employeeIds && f.employeeIds.length) {
    scope.push('t.employee_id IN (:employeeIds)');
    replacements.employeeIds = f.employeeIds;
  }
  if (guard) scope.push(guard);

  // Narrowing that applies to the detail rows only (project list), never to
  // the Employee's overall utilisation.
  const detailFilters = [];
  if (f.clientIds && f.clientIds.length) {
    detailFilters.push('sp.client_id IN (:clientIds)');
    replacements.clientIds = f.clientIds;
  }
  if (f.projectIds && f.projectIds.length) {
    detailFilters.push('sp.id IN (:projectIds)');
    replacements.projectIds = f.projectIds;
  }
  if (f.serviceTypeIds && f.serviceTypeIds.length) {
    detailFilters.push('st.id IN (:serviceTypeIds)');
    replacements.serviceTypeIds = f.serviceTypeIds;
  }
  if (f.categoryIds && f.categoryIds.length) {
    detailFilters.push('sc.id IN (:categoryIds)');
    replacements.categoryIds = f.categoryIds;
  }
  if (f.search) {
    detailFilters.push('(e.full_name ILIKE :search OR e.employee_code ILIKE :search OR sp.service_po_name ILIKE :search)');
    replacements.search = `%${f.search}%`;
  }

  const origCol = 't.hours_logged';
  const adjCol = 'COALESCE(t.modified_hours, t.hours_logged)';

  const orderCol = ORDERABLE_EMP_PROJECT[f.sortBy] || 'employee_name';
  const orderDir = f.sortOrder === 'DESC' ? 'DESC' : 'ASC';

  const joins = `
    FROM timesheets t
    JOIN employees e           ON e.id  = t.employee_id
    JOIN service_pos sp        ON sp.id = t.service_po_id
    JOIN service_types st      ON st.id = sp.service_type_id
    JOIN service_categories sc ON sc.id = st.service_category_id
    LEFT JOIN clients cl       ON cl.id = sp.client_id
  `;

  const baseCte = `
    WITH emp_totals AS (
      SELECT t.employee_id,
        SUM(${origCol}) AS total_logged,
        SUM(${adjCol})  AS total_adjusted
      ${joins}
      WHERE ${scope.join(' AND ')}
      GROUP BY t.employee_id
    ),
    detail AS (
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.full_name AS employee_name,
        sp.id AS service_po_id,
        sp.service_po_name AS project_name,
        cl.client_name,
        sc.name AS category_name,
        ROUND(SUM(${origCol})::numeric, 2) AS logged_hours,
        ROUND(SUM(${adjCol})::numeric, 2)  AS adjusted_hours
      ${joins}
      WHERE ${scope.concat(detailFilters).join(' AND ')}
      GROUP BY e.id, e.employee_code, e.full_name, sp.id, sp.service_po_name, cl.client_name, sc.name
    ),
    final AS (
      SELECT d.*,
        ROUND((et.total_logged   / :capacity * 100)::numeric, 2) AS original_utilization_percentage,
        ROUND((et.total_adjusted / :capacity * 100)::numeric, 2) AS total_utilization_percentage
      FROM detail d
      JOIN emp_totals et ON et.employee_id = d.employee_id
    )
  `;

  const [rows, totalsRows] = await Promise.all([
    sequelize.query(
      `${baseCte}
       SELECT *, COUNT(*) OVER() AS full_count FROM final
       ORDER BY ${orderCol} ${orderDir}, employee_name ASC, project_name ASC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `${baseCte}
       SELECT
         COUNT(*)::int AS row_count,
         COUNT(DISTINCT employee_id)::int AS employee_count,
         COALESCE(SUM(logged_hours), 0)   AS logged_hours,
         COALESCE(SUM(adjusted_hours), 0) AS adjusted_hours
       FROM final`,
      { replacements, type: QueryTypes.SELECT }
    ),
  ]);

  return {
    rows,
    count: parseInt(totalsRows[0]?.row_count, 10) || 0,
    totals: totalsRows[0] || null,
  };
}

module.exports = {
  MONTHLY_CAPACITY,
  getBuWiseUtilisation,
  getEmployeeProjectUtilisation,
};
