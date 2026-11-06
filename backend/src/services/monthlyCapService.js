'use strict';

const { sequelize } = require('../models');
const { createAuditLog } = require('../middlewares/auditLog');
const logger = require('../utils/logger');

/**
 * Monthly Cap Hours — the monthly total an employee's timesheet hours are
 * scaled down to at sync/import time (previously a hard-coded 176), and the
 * monthly capacity reports divide by.
 *
 * Stored as one row in `system_settings` (key `monthly_cap_hours`). An Admin
 * edits it from the frontend; every sync/import reads the LATEST value and
 * stamps it onto its `timesheet_import_history.cap_hours`, so months synced at
 * an older cap keep that cap until they are re-synced.
 */

const SETTING_KEY = 'monthly_cap_hours';
// Value used when the setting row/table is missing (e.g. migration not yet
// applied) — identical to the old hard-coded behaviour.
const DEFAULT_MONTHLY_CAP_HOURS = 176;
// 31 days x 24h — the largest any month can hold; mirrors the work-log entry ceiling.
const MIN_MONTHLY_CAP_HOURS = 1;
const MAX_MONTHLY_CAP_HOURS = 744;

function toValidCap(raw) {
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < MIN_MONTHLY_CAP_HOURS || value > MAX_MONTHLY_CAP_HOURS) {
    return null;
  }
  return value;
}

/**
 * @param {object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<number>} the latest monthly cap (hours)
 */
const getCurrentCap = async ({ transaction } = {}) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = :key',
      { replacements: { key: SETTING_KEY }, transaction }
    );
    const cap = rows.length ? toValidCap(rows[0].setting_value) : null;
    if (cap !== null) return cap;
    logger.warn('monthly_cap_hours setting missing or invalid — falling back to default', {
      default: DEFAULT_MONTHLY_CAP_HOURS,
    });
  } catch (err) {
    logger.warn('Could not read monthly_cap_hours setting — falling back to default', {
      error: err.message,
      default: DEFAULT_MONTHLY_CAP_HOURS,
    });
  }
  return DEFAULT_MONTHLY_CAP_HOURS;
};

/**
 * The cap a Business Unit's month was synced with: the `cap_hours` of the most
 * recent completed/partial import for that company + month (a re-sync fully
 * replaces the month, so the newest completed import is the live one). When
 * the month has never been synced, falls back to the latest setting.
 *
 * @param {number|null} companyId
 * @param {number} month 1-12
 * @param {number} year
 * @returns {Promise<number>}
 */
const getCapForCompanyMonth = async (companyId, month, year) => {
  if (companyId) {
    try {
      const [rows] = await sequelize.query(
        `SELECT cap_hours FROM timesheet_import_history
          WHERE company_id = :companyId AND import_month = :month AND import_year = :year
            AND status IN ('completed', 'partial')
          ORDER BY id DESC LIMIT 1`,
        { replacements: { companyId, month, year } }
      );
      const cap = rows.length ? toValidCap(rows[0].cap_hours) : null;
      if (cap !== null) return cap;
    } catch (err) {
      logger.warn('Could not read cap_hours for company/month — using latest setting', {
        error: err.message,
        companyId,
        month,
        year,
      });
    }
  }
  return getCurrentCap();
};

/**
 * The monthly cap that applies to ONE employee for a month: the cap their own synced timesheets
 * for that month were adjusted with; if they have nothing synced that month, the latest setting.
 * Use this for anything shown to / validated for a single employee — getCapForMonth() picks the
 * newest import of ANY Business Unit, which can carry an older cap that is not this employee's.
 *
 * @param {number} employeeId
 * @param {number} month 1-12
 * @param {number} year
 * @returns {Promise<number>}
 */
const getCapForEmployeeMonth = async (employeeId, month, year) => {
  if (employeeId) {
    try {
      const [rows] = await sequelize.query(
        `SELECT MAX(h.cap_hours) AS cap_hours
           FROM timesheets t
           JOIN timesheet_import_history h ON h.id = t.timesheet_import_id
          WHERE t.employee_id = :employeeId
            AND EXTRACT(MONTH FROM t.timesheet_date) = :month
            AND EXTRACT(YEAR FROM t.timesheet_date) = :year`,
        { replacements: { employeeId, month: parseInt(month, 10), year: parseInt(year, 10) } }
      );
      const cap = rows.length ? toValidCap(rows[0].cap_hours) : null;
      if (cap !== null) return cap;
    } catch (err) {
      logger.warn('Could not read cap_hours for employee/month — using latest setting', {
        error: err.message,
        employeeId,
        month,
        year,
      });
    }
  }
  return getCurrentCap();
};

/**
 * The cap reports should use as one month's capacity: the `cap_hours` of the
 * most recent completed/partial import for that month (optionally limited to
 * the caller's Business Units). A month that was synced at an older cap keeps
 * that cap here until it is re-synced; a month with no synced import yet falls
 * back to the latest setting.
 *
 * @param {number} month 1-12
 * @param {number} year
 * @param {number[]|null} [companyIds] - limit to these Business Units (omit/empty = any)
 * @returns {Promise<number>}
 */
const getCapForMonth = async (month, year, companyIds = null) => {
  const ids = Array.isArray(companyIds) ? companyIds.filter((id) => id !== null && id !== undefined) : [];
  try {
    const [rows] = await sequelize.query(
      `SELECT cap_hours FROM timesheet_import_history
        WHERE import_month = :month AND import_year = :year
          AND status IN ('completed', 'partial')
          ${ids.length ? 'AND company_id IN (:ids)' : ''}
        ORDER BY id DESC LIMIT 1`,
      { replacements: { month: parseInt(month, 10), year: parseInt(year, 10), ids } }
    );
    const cap = rows.length ? toValidCap(rows[0].cap_hours) : null;
    if (cap !== null) return cap;
  } catch (err) {
    logger.warn('Could not read cap_hours for month — using latest setting', {
      error: err.message,
      month,
      year,
    });
  }
  return getCurrentCap();
};

/**
 * Total capacity across a range of months (e.g. a quarter): each month
 * contributes its own cap (see getCapForMonth), so a range spanning a cap
 * change adds up correctly instead of using one number for every month.
 *
 * @param {Array<{month: number, year: number}>} months
 * @param {number[]|null} [companyIds]
 * @returns {Promise<number>}
 */
const getCapacityForMonths = async (months, companyIds = null) => {
  const caps = await Promise.all(months.map((m) => getCapForMonth(m.month, m.year, companyIds)));
  return caps.reduce((sum, cap) => sum + cap, 0);
};

/**
 * Total capacity for an inclusive date range ('YYYY-MM-DD' strings): one cap
 * per calendar month the range touches (see getCapacityForMonths).
 */
const getCapacityForDateRange = async (startDate, endDate, companyIds = null) => {
  const [sy, sm] = String(startDate).slice(0, 7).split('-').map(Number);
  const [ey, em] = String(endDate).slice(0, 7).split('-').map(Number);
  const months = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push({ month: m, year: y });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return getCapacityForMonths(months, companyIds);
};

/**
 * Current cap plus who last changed it and when (for the admin settings screen).
 */
const getCapSetting = async () => {
  const [rows] = await sequelize.query(
    'SELECT setting_value, updated_by, updated_at FROM system_settings WHERE setting_key = :key',
    { replacements: { key: SETTING_KEY } }
  );
  const cap = rows.length ? toValidCap(rows[0].setting_value) : null;
  return {
    monthly_cap_hours: cap !== null ? cap : DEFAULT_MONTHLY_CAP_HOURS,
    min: MIN_MONTHLY_CAP_HOURS,
    max: MAX_MONTHLY_CAP_HOURS,
    updated_by: rows.length ? rows[0].updated_by : null,
    updated_at: rows.length ? rows[0].updated_at : null,
  };
};

/**
 * Update the monthly cap. Affects FUTURE syncs/imports only — already-synced
 * months keep the cap stamped on their import until they are re-synced.
 *
 * @param {number} value
 * @param {number} userId
 * @param {string|null} ipAddress
 */
const setCurrentCap = async (value, userId, ipAddress = null) => {
  const cap = toValidCap(value);
  if (cap === null) {
    const err = new Error(
      `Monthly cap hours must be a number between ${MIN_MONTHLY_CAP_HOURS} and ${MAX_MONTHLY_CAP_HOURS}.`
    );
    err.statusCode = 422;
    throw err;
  }

  const previous = await getCurrentCap();

  await sequelize.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES (:key, :value, :userId, NOW())
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value,
                   updated_by    = EXCLUDED.updated_by,
                   updated_at    = NOW()`,
    { replacements: { key: SETTING_KEY, value: String(cap), userId: userId || null } }
  );

  createAuditLog(
    userId,
    'UPDATE',
    'system_settings',
    null,
    { setting_key: SETTING_KEY, value: previous },
    { setting_key: SETTING_KEY, value: cap },
    ipAddress
  );

  logger.info('Monthly cap hours updated', { userId, previous, current: cap });
  return getCapSetting();
};

module.exports = {
  SETTING_KEY,
  DEFAULT_MONTHLY_CAP_HOURS,
  MIN_MONTHLY_CAP_HOURS,
  MAX_MONTHLY_CAP_HOURS,
  getCurrentCap,
  getCapForCompanyMonth,
  getCapForMonth,
  getCapForEmployeeMonth,
  getCapacityForMonths,
  getCapacityForDateRange,
  getCapSetting,
  setCurrentCap,
};
