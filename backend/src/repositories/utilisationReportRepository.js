'use strict';

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const { companyRangeCapacitySql, employeeRangeCapacitySql } = require('../utils/monthlyCapSql');
const { countableEmployeeSql } = require('../utils/countableEmployeeSql');

/**
 * Utilisation report queries — (1) BU-wise Utilisation, (2) Employee × Project
 * Utilisation (original vs after-sync adjusted hours).
 *
 * Source of truth is the official `timesheets` table: COALESCE(original_hours, hours_logged)
 * is the original logged value (what the employee actually logged, before the monthly-cap
 * adjustment; older rows without original_hours fall back to hours_logged), and
 * COALESCE(modified_hours, hours_logged) is the "adjusted / after sync" value (same
 * convention as every other report — hoursSource 'O' selects the original instead).
 */

// Capacity = the Monthly Cap Hours each BU / employee's months were synced with, summed over the
// months in the range (see utils/monthlyCapSql) — never one shared number, since BUs of the same
// month can sit on different caps.

// Utility POs that are never "work": excluded from Billable/Non-Billable/
// Customer Non-Billable and from Total Logged in the BU-wise report.
// Matched by PO name (Idle / On Bench / Leaves) or by a Leave service type.
const EXCLUDED_PO_SQL = `(
  LOWER(TRIM(sp.service_po_name)) IN ('idle', 'on bench', 'leave', 'leaves')
  OR st.service_type_name ILIKE '%leave%'
)`;

// Non-Billable = the BU's own non-billable POs PLUS Centralised non-billable POs (Leaves, On Bench, ...),
// even though those are in EXCLUDED_PO_SQL; Billable/Customer Non-Billable still exclude them.
const CAT_BILLABLE_SQL = `LOWER(TRIM(sc.name)) = 'billable'`;
const CAT_CUSTOMER_NB_SQL = `LOWER(TRIM(sc.name)) = 'customer non-billable'`;
const CAT_NON_BILLABLE_SQL = `LOWER(TRIM(sc.name)) = 'non-billable'`;

// "this BU family has no Sub-BU in scope" — fam is the family CTE built per query.
const NO_SUB_BUS_SQL = (rootExpr) => `NOT EXISTS (SELECT 1 FROM fam fx WHERE fx.root_id = ${rootExpr} AND fx.member_id <> fx.root_id)`;

const isEmptyScope = (ids) => !ids || ids.length === 0;

// "The employee (alias e) is mapped to one of :companyIds" — employee_business_units or the legacy
// employees.company_id. An EXISTS so a multi-BU employee is never multiplied.
const EMPLOYEE_BU_SCOPE_SQL = `(
  e.company_id IN (:companyIds)
  OR EXISTS (
    SELECT 1 FROM employee_business_units sebu
    WHERE sebu.employee_id = e.id AND sebu.business_unit_id IN (:companyIds) AND sebu.status = 'active'
  )
)`;

// What the employee actually logged (before the monthly-cap adjustment) — independent of hoursSource.
const ORIGINAL_HOURS_SQL = 'COALESCE(t.original_hours, t.hours_logged)';

const hoursColumn = (hoursSource) => (
  hoursSource === 'O' ? 'COALESCE(t.original_hours, t.hours_logged)' : 'COALESCE(t.modified_hours, t.hours_logged)'
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
  originalBillableHours: 'original_billable_hours',
  originalNonBillableHours: 'original_non_billable_hours',
  originalCustomerNonBillableHours: 'original_customer_non_billable_hours',
  originalTotalLoggedHours: 'original_total_logged_hours',
  originalUtilizationPercentage: 'original_utilization_percentage',
  notLoggedHours: 'not_logged_hours',
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
 * @param {'bu'|'partition'} [f.groupBy] 'bu' rolls each BU's Sub-BUs up into one row; 'partition' = the Sub-BU
 *   breakdown of those BU families with every employee in exactly one node; otherwise one row per BU / Sub-BU (company)
 * @param {number[]} [f.rootIds] restrict the one-row-per-company layout to these BU families
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
    limit: f.limit,
    offset: f.offset,
  };

  const tsConditions = [
    't.timesheet_date BETWEEN :startDate AND :endDate',
    't.company_id IN (:companyIds)',
    'e.is_deleted = false',
    "e.status = 'active'",
    'sp.is_deleted = false',
    // HR / Finance / Attender staff: their hours are not counted
    countableEmployeeSql('e'),
  ];
  // ... and neither are they: headcount (and so expected hours = employees x cap) leaves them out
  const empConditions = ['e.is_deleted = false', "e.status = 'active'", countableEmployeeSql('e')];

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

  // Only ACTIVE Business Units / Sub-BUs are ever reported: an inactive one (or a Sub-BU under an
  // inactive BU) must not show up, with or without hours.
  const buConditions = [
    'c.id IN (:companyIds)',
    'c.is_deleted = false',
    "c.status = 'active'",
    "(p.id IS NULL OR (p.is_deleted = false AND p.status = 'active'))",
  ];
  if (f.search) {
    buConditions.push('(c.company_name ILIKE :search OR p.company_name ILIKE :search)');
    replacements.search = `%${f.search}%`;
  }
  // Only these BU families (root BU ids) — used to fetch the Sub-BU rows of one page of BUs.
  if (f.rootIds && f.rootIds.length) {
    buConditions.push('COALESCE(c.parent_business_unit_id, c.id) IN (:rootIds)');
    replacements.rootIds = f.rootIds;
  }

  const orderCol = ORDERABLE_BU[f.sortBy] || 'bu_name';
  const orderDir = f.sortOrder === 'DESC' ? 'DESC' : 'ASC';

  // groupBy 'bu'    -> one row per top-level BU, its Sub-BUs rolled up into it (employees counted once).
  // anything else   -> one row per company: every BU and every Sub-BU on its own (the original
  //                    layout; a Sub-BU row carries sub_bu_name, a BU row only that BU's own level).
  const rollUp = f.groupBy === 'bu';
  // 'partition' -> the Sub-BU breakdown of one BU family where EVERY employee sits in exactly one node
  //                (their Sub-BU, else the BU's own level), so the nodes add up to the rolled-up BU row:
  //                employees, hours and expected hours alike. Used for the children of the hierarchy view.
  const partition = f.groupBy === 'partition';
  const usesFamily = rollUp || partition;

  // rollUp only: every active in-scope company mapped to the BU family it belongs to.
  const familyCte = usesFamily ? `
    fam AS (
      SELECT c.id AS member_id, COALESCE(c.parent_business_unit_id, c.id) AS root_id
      FROM companies c
      LEFT JOIN companies p ON p.id = c.parent_business_unit_id
      WHERE ${buConditions.filter((cond) => !cond.includes(':search')).join(' AND ')}
    ),` : '';

  const busCte = partition ? `
    bus AS (
      SELECT fm.member_id AS bu_id, fm.root_id, r.company_name AS bu_name,
        CASE WHEN fm.member_id <> fm.root_id THEN c.company_name END AS sub_bu_name
      FROM fam fm
      JOIN companies c ON c.id = fm.member_id
      JOIN companies r ON r.id = fm.root_id
    )` : rollUp ? `
    bus AS (
      SELECT r.id AS bu_id, r.id AS root_id, r.company_name AS bu_name, NULL::text AS sub_bu_name
      FROM companies r
      WHERE r.id IN (SELECT root_id FROM fam)
        ${f.search ? `AND (r.company_name ILIKE :search OR EXISTS (
          SELECT 1 FROM fam fs JOIN companies sc2 ON sc2.id = fs.member_id
          WHERE fs.root_id = r.id AND sc2.company_name ILIKE :search))` : ''}
    )` : `
    bus AS (
      SELECT c.id AS bu_id,
        COALESCE(p.id, c.id) AS root_id,
        COALESCE(p.company_name, c.company_name) AS bu_name,
        CASE WHEN p.id IS NOT NULL THEN c.company_name END AS sub_bu_name
      FROM companies c
      LEFT JOIN companies p ON p.id = c.parent_business_unit_id
      WHERE ${buConditions.join(' AND ')}
    )`;

  // Headcount = active Employees mapped to the BU (employee_business_units
  // or the legacy employees.company_id) — rolled up: mapped to ANY company of the BU family, counted
  // once. Hours = timesheet rows stamped with that BU's company_id (rolled up: any company of the family).
  // partition only: the single node each employee is attributed to inside a family — the Sub-BU that is
  // their primary company, else the lowest-id Sub-BU they are mapped to, else the BU's own level.
  const empNodeCte = (partition || rollUp) ? `
    emp_node AS (
      SELECT e.id AS employee_id, fm.root_id,
        COALESCE(
          MIN(fm.member_id) FILTER (WHERE fm.member_id <> fm.root_id AND fm.member_id = e.company_id),
          MIN(fm.member_id) FILTER (WHERE fm.member_id <> fm.root_id),
          fm.root_id) AS node_id
      FROM fam fm
      JOIN employees e ON ${empConditions.join(' AND ')}
        AND (
          e.company_id = fm.member_id
          OR EXISTS (
            SELECT 1 FROM employee_business_units ebu
            WHERE ebu.employee_id = e.id AND ebu.business_unit_id = fm.member_id AND ebu.status = 'active'
          )
        )
      GROUP BY e.id, fm.root_id
    ),` : '';

  const empCountsCte = partition ? `
    emp_counts AS (
      SELECT node_id AS bu_id, COUNT(*) AS total_employees
      FROM emp_node
      GROUP BY node_id
    )` : rollUp ? `
    emp_counts AS (
      SELECT en.root_id AS bu_id, COUNT(*) AS total_employees
      FROM emp_node en
      WHERE en.node_id <> en.root_id OR ${NO_SUB_BUS_SQL('en.root_id')}
      GROUP BY en.root_id
    )` : `
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
    )`;

  // partition: hours follow the EMPLOYEE's node (not the company the timesheet was stamped with, which is
  // usually the BU even for a Sub-BU member); an employee outside the family mapping falls to the BU level.
  const hoursKey = partition ? 'COALESCE(en.node_id, fm.root_id)' : (rollUp ? 'fm.root_id' : 't.company_id');
  const hoursFamilyJoin = (partition || rollUp)
    ? 'JOIN fam fm ON fm.member_id = t.company_id LEFT JOIN emp_node en ON en.employee_id = t.employee_id AND en.root_id = fm.root_id'
    : '';
  // Rolled-up BU: a BU that has Sub-BUs is the total of its Sub-BUs only (every employee of such a BU is
  // expected to be mapped to a Sub-BU); hours that sit at the BU's own level are not part of it.
  if (rollUp) {
    tsConditions.push(`(COALESCE(en.node_id, fm.root_id) <> fm.root_id OR ${NO_SUB_BUS_SQL('fm.root_id')})`);
  }
  // Expected hours use ONE capacity for a whole family (the BU's) when partitioned, so nodes add up exactly.
  const capacityOwner = partition ? 'b.root_id' : 'b.bu_id';

  const baseCte = `
    WITH ${familyCte}
    ${busCte},
    ${empNodeCte}
    ${empCountsCte},
    hours AS (
      SELECT
        ${hoursKey} AS bu_id,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_BILLABLE_SQL} THEN ${hoursCol} ELSE 0 END), 0) AS billable_hours,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_CUSTOMER_NB_SQL} THEN ${hoursCol} ELSE 0 END), 0) AS customer_non_billable_hours,
        COALESCE(SUM(CASE WHEN (NOT ${EXCLUDED_PO_SQL} OR sp.is_centralised = true) AND ${CAT_NON_BILLABLE_SQL} THEN ${hoursCol} ELSE 0 END), 0) AS non_billable_hours,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_BILLABLE_SQL} THEN ${ORIGINAL_HOURS_SQL} ELSE 0 END), 0) AS original_billable_hours,
        COALESCE(SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} AND ${CAT_CUSTOMER_NB_SQL} THEN ${ORIGINAL_HOURS_SQL} ELSE 0 END), 0) AS original_customer_non_billable_hours,
        COALESCE(SUM(CASE WHEN (NOT ${EXCLUDED_PO_SQL} OR sp.is_centralised = true) AND ${CAT_NON_BILLABLE_SQL} THEN ${ORIGINAL_HOURS_SQL} ELSE 0 END), 0) AS original_non_billable_hours
      FROM timesheets t
      JOIN employees e           ON e.id  = t.employee_id
      JOIN service_pos sp        ON sp.id = t.service_po_id
      JOIN service_types st      ON st.id = sp.service_type_id
      JOIN service_categories sc ON sc.id = st.service_category_id
      ${hoursFamilyJoin}
      WHERE ${tsConditions.join(' AND ')}
      GROUP BY ${hoursKey}
    ),
    report AS (
      SELECT
        b.bu_id,
        b.root_id,
        b.bu_name,
        b.sub_bu_name,
        COALESCE(ec.total_employees, 0)::int AS total_employees,
        COALESCE(ec.total_employees, 0) * ${companyRangeCapacitySql(capacityOwner)} AS expected_hours,
        ROUND(COALESCE(h.billable_hours, 0)::numeric, 2) AS billable_hours,
        ROUND(COALESCE(h.non_billable_hours, 0)::numeric, 2) AS non_billable_hours,
        ROUND(COALESCE(h.customer_non_billable_hours, 0)::numeric, 2) AS customer_non_billable_hours,
        ROUND((COALESCE(h.billable_hours, 0) + COALESCE(h.non_billable_hours, 0) + COALESCE(h.customer_non_billable_hours, 0))::numeric, 2) AS total_logged_hours,
        ROUND(COALESCE(h.original_billable_hours, 0)::numeric, 2) AS original_billable_hours,
        ROUND(COALESCE(h.original_non_billable_hours, 0)::numeric, 2) AS original_non_billable_hours,
        ROUND(COALESCE(h.original_customer_non_billable_hours, 0)::numeric, 2) AS original_customer_non_billable_hours,
        ROUND((COALESCE(h.original_billable_hours, 0) + COALESCE(h.original_non_billable_hours, 0) + COALESCE(h.original_customer_non_billable_hours, 0))::numeric, 2) AS original_total_logged_hours
      FROM bus b
      LEFT JOIN emp_counts ec ON ec.bu_id = b.bu_id
      LEFT JOIN hours h       ON h.bu_id  = b.bu_id
    ),
    final AS (
      SELECT r.*,
        CASE WHEN r.expected_hours > 0 THEN ROUND((r.total_logged_hours / r.expected_hours * 100)::numeric, 2) ELSE 0 END AS utilization_percentage,
        CASE WHEN r.expected_hours > 0 THEN ROUND((r.original_total_logged_hours / r.expected_hours * 100)::numeric, 2) ELSE 0 END AS original_utilization_percentage,
        -- Expected - Total Logged (never negative: logging more than expected leaves nothing un-logged)
        GREATEST(ROUND((r.expected_hours - r.total_logged_hours)::numeric, 2), 0) AS not_logged_hours
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
         COUNT(*)::int AS row_count,
         -- Business Units and Sub-BUs are counted separately: bu_count = active top-level BUs,
         -- sub_bu_count = active Sub-BUs under them (never one number for both).
         COUNT(DISTINCT root_id)::int AS bu_count,
         ${rollUp
    ? '(SELECT COUNT(*) FROM fam WHERE member_id <> root_id AND root_id IN (SELECT bu_id FROM bus))::int'
    : 'COUNT(*) FILTER (WHERE sub_bu_name IS NOT NULL)::int'} AS sub_bu_count,
         -- rolled-up only: distinct employees mapped to a BU that HAS Sub-BUs but to none of its Sub-BUs.
         -- They are left out of every BU total; this is the gap between the page's headcount and the BU total.
         ${rollUp
    ? "(SELECT COUNT(DISTINCT en.employee_id) FROM emp_node en WHERE en.node_id = en.root_id AND EXISTS (SELECT 1 FROM fam fx WHERE fx.root_id = en.root_id AND fx.member_id <> fx.root_id))::int"
    : '0'} AS unassigned_employees,
         -- Rolled-up: DISTINCT employees (one who belongs to two BUs counts once here, though each BU row counts
         -- them). Otherwise the sum of the rows, as before.
         ${rollUp
    ? "(SELECT COUNT(DISTINCT en.employee_id) FROM emp_node en WHERE en.node_id <> en.root_id OR " + NO_SUB_BUS_SQL('en.root_id') + ")::int"
    : 'COALESCE(SUM(total_employees), 0)::int'} AS total_employees,
         COALESCE(SUM(expected_hours), 0) AS expected_hours,
         COALESCE(SUM(billable_hours), 0) AS billable_hours,
         COALESCE(SUM(non_billable_hours), 0) AS non_billable_hours,
         COALESCE(SUM(customer_non_billable_hours), 0) AS customer_non_billable_hours,
         COALESCE(SUM(total_logged_hours), 0) AS total_logged_hours,
         COALESCE(SUM(original_billable_hours), 0) AS original_billable_hours,
         COALESCE(SUM(original_non_billable_hours), 0) AS original_non_billable_hours,
         COALESCE(SUM(original_customer_non_billable_hours), 0) AS original_customer_non_billable_hours,
         COALESCE(SUM(original_total_logged_hours), 0) AS original_total_logged_hours,
         COALESCE(SUM(not_logged_hours), 0) AS not_logged_hours
       FROM final`,
      { replacements, type: QueryTypes.SELECT }
    ),
  ]);

  return {
    rows,
    count: rows.length ? parseInt(rows[0].full_count, 10) : (parseInt(totalsRows[0]?.row_count, 10) || 0),
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
    limit: f.limit,
    offset: f.offset,
  };

  // Scope shared by both the per-employee totals and the detail rows.
  const scope = [
    't.timesheet_date BETWEEN :startDate AND :endDate',
    // EMPLOYEE-wise: the EMPLOYEE is mapped to the selected BU/Sub-BU (EXISTS, never a JOIN, so a multi-BU
    // employee is counted once). NOT t.company_id (= the employee's SYNC BU) nor sp.company_id, so every row of
    // the employee — cross-BU and Centralised Service POs included — shows, also under their other mapped BUs.
    EMPLOYEE_BU_SCOPE_SQL,
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

  const origCol = 'COALESCE(t.original_hours, t.hours_logged)';
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
        -- Utilisation % counts real work only: Leaves / Idle / On Bench rows are listed in the
        -- project breakdown but never counted toward the employee's utilisation (same
        -- exclusion as the BU-wise report).
        SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} THEN ${origCol} ELSE 0 END) AS total_logged,
        SUM(CASE WHEN NOT ${EXCLUDED_PO_SQL} THEN ${adjCol} ELSE 0 END)  AS total_adjusted,
        ${employeeRangeCapacitySql('t.employee_id')} AS capacity
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
        ROUND((et.total_logged   / NULLIF(et.capacity, 0) * 100)::numeric, 2) AS original_utilization_percentage,
        ROUND((et.total_adjusted / NULLIF(et.capacity, 0) * 100)::numeric, 2) AS total_utilization_percentage
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
  getBuWiseUtilisation,
  getEmployeeProjectUtilisation,
};
