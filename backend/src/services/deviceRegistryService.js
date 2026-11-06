'use strict';

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Which devices a person signs in from (user_devices), so the audit screen can list a person's devices
 * and flag a login from a device they have never used before.
 *
 * A "device" is the random id the app generates per browser profile (X-Device-Id). A brand-new browser
 * profile — and every incognito / private window — therefore always looks like a NEW device, which is
 * exactly what makes it stand out. Never throws into the login that triggered it.
 */

/**
 * Record a login from `deviceId` and say whether it is a device this person has not used before.
 *
 * @param {{ employeeId: number, deviceId: string|null, deviceName?: string|null, userAgent?: string|null, ip?: string|null }} params
 * @returns {Promise<{ tracked: boolean, isNewDevice: boolean, isFirstDevice: boolean }>}
 *   tracked: false when no device id was sent (nothing can be said about the device).
 *   isNewDevice: first time THIS device is seen for a person who already has other devices.
 *   isFirstDevice: the person's very first known device (nothing to compare with, so not flagged).
 */
async function registerLogin({ employeeId, deviceId, deviceName = null, userAgent = null, ip = null }) {
  if (!employeeId || !deviceId) return { tracked: false, isNewDevice: false, isFirstDevice: false };
  try {
    const [{ known }] = await sequelize.query(
      'SELECT COUNT(*)::int AS known FROM user_devices WHERE employee_id = :employeeId',
      { replacements: { employeeId }, type: QueryTypes.SELECT }
    );
    const [row] = await sequelize.query(
      `INSERT INTO user_devices (employee_id, device_id, device_name, user_agent, last_ip)
       VALUES (:employeeId, :deviceId, :deviceName, :userAgent, :ip)
       ON CONFLICT (employee_id, device_id) DO UPDATE
         SET last_seen_at = now(),
             login_count  = user_devices.login_count + 1,
             device_name  = COALESCE(EXCLUDED.device_name, user_devices.device_name),
             user_agent   = COALESCE(EXCLUDED.user_agent, user_devices.user_agent),
             last_ip      = COALESCE(EXCLUDED.last_ip, user_devices.last_ip)
       RETURNING (xmax = 0) AS inserted`,
      {
        replacements: {
          employeeId,
          deviceId: String(deviceId).slice(0, 64),
          deviceName: deviceName ? String(deviceName).slice(0, 120) : null,
          userAgent: userAgent ? String(userAgent).slice(0, 400) : null,
          ip: ip ? String(ip).slice(0, 45) : null,
        },
        type: QueryTypes.SELECT,
      }
    );
    const inserted = !!(row && row.inserted);
    return { tracked: true, isNewDevice: inserted && known > 0, isFirstDevice: inserted && known === 0 };
  } catch (error) {
    logger.error('Failed to register a login device', { error: error.message, employeeId });
    return { tracked: false, isNewDevice: false, isFirstDevice: false };
  }
}

module.exports = { registerLogin };
