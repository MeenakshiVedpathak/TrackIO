'use strict';

/**
 * HR / Finance / Attender staff are left out of the BU-wise Utilization numbers — the BU-wise Utilization
 * report and the dashboard's BU-wise Utilization card — for headcount, expected hours (employees x cap) and
 * logged hours. Nothing else uses this: the dashboard's Employees KPI and every other report still count them.
 *
 * An employee is skipped when they hold ANY of the roles in NON_DELIVERY_ROLES, whatever other roles they
 * also have (so "Employee + HR" and "Project Manager + HR" are both skipped).
 * Role names are matched case-insensitively. Only the employee's ACTIVE employee_roles rows are looked at.
 */

const NON_DELIVERY_ROLES = ['hr', 'finance', 'attender'];

const list = (names) => names.map((n) => `'${n}'`).join(', ');

/**
 * SQL boolean: true when the employee must be counted.
 * @param {string} [alias='e'] - alias of the employees table in the surrounding query
 */
function countableEmployeeSql(alias = 'e') {
  return `NOT EXISTS (
    SELECT 1 FROM employee_roles ndr
    JOIN roles ndr_r ON ndr_r.id = ndr.role_id
    WHERE ndr.employee_id = ${alias}.id AND ndr.status = 'active'
      AND LOWER(ndr_r.role_name) IN (${list(NON_DELIVERY_ROLES)})
  )`;
}

module.exports = { countableEmployeeSql, NON_DELIVERY_ROLES };
