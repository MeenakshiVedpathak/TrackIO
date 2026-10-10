'use strict';

const monthlyCapService = require('../services/monthlyCapService');
const { getIpAddress } = require('../middlewares/auditLog');
const { sendSuccess, sendError } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * GET /system-settings/monthly-cap — any authenticated user (the frontend
 * reads the cap from here instead of hard-coding it). Optional ?month=&year=
 * adds `cap_for_month` (the newest synced cap for that month across Business Units; the latest
 * setting if never synced) and `cap_for_employee_month` (the cap THIS caller's own synced
 * timesheets for that month used; the latest setting if they have none) — employee-facing
 * screens should show the latter.
 */
const getMonthlyCap = async (req, res, next) => {
  try {
    const data = await monthlyCapService.getCapSetting();
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    const hasPeriod = month >= 1 && month <= 12 && year >= 2000;
    data.cap_for_month = hasPeriod
      ? await monthlyCapService.getCapForMonth(month, year)
      : data.monthly_cap_hours;
    data.cap_for_employee_month = hasPeriod
      ? await monthlyCapService.getCapForEmployeeMonth(req.employeeId, month, year)
      : data.monthly_cap_hours;
    return sendSuccess(res, data, 'Monthly cap hours fetched successfully.');
  } catch (err) {
    logger.error('systemSettings getMonthlyCap error', { error: err.message, userId: req.userId });
    next(err);
  }
};

/**
 * PUT /system-settings/monthly-cap — Admin only (see route).
 */
const updateMonthlyCap = async (req, res, next) => {
  try {
    const data = await monthlyCapService.setCurrentCap(
      req.body.monthly_cap_hours,
      req.userId,
      getIpAddress(req)
    );
    return sendSuccess(
      res,
      data,
      'Monthly cap hours updated. It applies to syncs/imports run from now on; already-synced months keep their cap until re-synced.'
    );
  } catch (err) {
    if (err.statusCode) return sendError(res, err.message, err.statusCode);
    logger.error('systemSettings updateMonthlyCap error', { error: err.message, userId: req.userId });
    next(err);
  }
};

module.exports = { getMonthlyCap, updateMonthlyCap };
