'use strict';

/**
 * SQL fragments for the Monthly Cap Hours (formerly a hard-coded 176) so a
 * report query can use the right cap per row without any extra round trip.
 *
 * The cap a month was synced with lives on timesheet_import_history.cap_hours
 * (see monthlyCapService.js). Each fragment falls back to the latest
 * `monthly_cap_hours` setting when no import can be found, and finally to 176
 * when the setting itself is missing — identical to the old behaviour.
 */

// Latest admin-set cap, readable straight from SQL.
const LATEST_CAP_SQL =
  "COALESCE((SELECT NULLIF(setting_value, '')::numeric FROM system_settings WHERE setting_key = 'monthly_cap_hours'), 176)";

/**
 * Cap of the Business Unit's synced month. Arguments are SQL expressions
 * (e.g. 'co.id', ':monthNum', 'EXTRACT(YEAR FROM t.timesheet_date)').
 */
function capForCompanyMonthSql(companyExpr, monthExpr, yearExpr) {
  return `COALESCE(
    (SELECT h_cap.cap_hours FROM timesheet_import_history h_cap
      WHERE h_cap.company_id = ${companyExpr}
        AND h_cap.import_month = ${monthExpr}
        AND h_cap.import_year = ${yearExpr}
        AND h_cap.status IN ('completed', 'partial')
      ORDER BY h_cap.id DESC LIMIT 1),
    ${LATEST_CAP_SQL})`;
}

/**
 * Cap for a calendar month, across the caller's Business Units: the cap_hours
 * of the most recent completed/partial import for that month in
 * :<companyIdsParam> (latest setting if none). Use in month-series report
 * queries where the month is a date expression such as 'm.month_start'.
 *
 * @param {string} monthStartExpr - SQL date expression (first day of the month)
 * @param {string} [companyIdsParam] - named replacement holding the company id list; omit for "any BU"
 */
function capForMonthStartSql(monthStartExpr, companyIdsParam = null) {
  return `COALESCE(
    (SELECT h_m.cap_hours FROM timesheet_import_history h_m
      WHERE h_m.import_month = EXTRACT(MONTH FROM ${monthStartExpr})::int
        AND h_m.import_year = EXTRACT(YEAR FROM ${monthStartExpr})::int
        AND h_m.status IN ('completed', 'partial')
        ${companyIdsParam ? `AND h_m.company_id IN (:${companyIdsParam})` : ''}
      ORDER BY h_m.id DESC LIMIT 1),
    ${LATEST_CAP_SQL})`;
}

/**
 * Monthly months touched by :startDate..:endDate, as a SQL row source with column g.m (the first
 * day of each month). Both are named replacements holding 'YYYY-MM-DD' dates.
 */
const MONTHS_IN_RANGE_SQL =
  "generate_series(date_trunc('month', :startDate::date), date_trunc('month', :endDate::date), interval '1 month') AS g(m)";

/**
 * Capacity (hours) of ONE Business Unit over :startDate..:endDate: the sum, over every month in the
 * range, of the cap that BU's month was synced with (latest setting for a month it never synced).
 * Per-BU on purpose — BUs of the same month can legitimately sit on different caps (each is synced
 * and re-synced on its own), so one cap per month would be wrong for some of them.
 *
 * @param {string} companyExpr - SQL expression for the BU id (e.g. 'b.bu_id')
 */
function companyRangeCapacitySql(companyExpr) {
  return `(SELECT COALESCE(SUM(${capForCompanyMonthSql(companyExpr, 'EXTRACT(MONTH FROM g.m)::int', 'EXTRACT(YEAR FROM g.m)::int')}), 0)
     FROM ${MONTHS_IN_RANGE_SQL})`;
}

/**
 * Capacity (hours) of ONE employee over :startDate..:endDate: per month, the cap of the import their
 * own timesheet rows were synced with; for a month where they have no synced rows, the cap in
 * :<companyIdsParam> for that month (latest setting if none); summed over the months in the range.
 *
 * @param {string} employeeExpr - SQL expression for the employee id (e.g. 't.employee_id')
 * @param {string} companyIdsParam - named replacement holding the company id list
 */
function employeeRangeCapacitySql(employeeExpr, companyIdsParam = 'companyIds') {
  return `(SELECT COALESCE(SUM(COALESCE(
       (SELECT MAX(h_e.cap_hours)
          FROM timesheets t_e
          JOIN timesheet_import_history h_e ON h_e.id = t_e.timesheet_import_id
         WHERE t_e.employee_id = ${employeeExpr}
           AND t_e.timesheet_date >= g.m AND t_e.timesheet_date < g.m + interval '1 month'),
       ${capForMonthStartSql('g.m', companyIdsParam)})), 0)
     FROM ${MONTHS_IN_RANGE_SQL})`;
}

/**
 * Cap a timesheet row was synced with: its own import's cap_hours; for a
 * row with no import (e.g. a manual entry) the cap of its company's synced
 * month; otherwise the latest setting.
 *
 * @param {string} [alias='t'] - alias of the timesheets table in the query
 */
function timesheetCapSql(alias = 't') {
  return `COALESCE(
    (SELECT h_ts.cap_hours FROM timesheet_import_history h_ts WHERE h_ts.id = ${alias}.timesheet_import_id),
    ${capForCompanyMonthSql(
      `${alias}.company_id`,
      `EXTRACT(MONTH FROM ${alias}.timesheet_date)::int`,
      `EXTRACT(YEAR FROM ${alias}.timesheet_date)::int`
    )})`;
}

module.exports = {
  LATEST_CAP_SQL,
  capForCompanyMonthSql,
  capForMonthStartSql,
  companyRangeCapacitySql,
  employeeRangeCapacitySql,
  timesheetCapSql,
};
