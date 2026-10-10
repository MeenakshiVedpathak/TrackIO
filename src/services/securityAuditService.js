'use strict';

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const { createAuditLog } = require('../middlewares/auditLog');
const logger = require('../utils/logger');

/**
 * Security events for the audit log. A single mistake is not an event: a wrong password once, or
 * opening a page by accident, is noise. What is recorded is a PATTERN, counted over a short window
 * in security_attempts (a database table, so the count is right across servers):
 *
 *  - LOGIN_FAILED  — wrong password / unknown email, logged on the 3rd failed attempt (and again
 *                    on every further 3rd: 6th, 9th, ...) within the window.
 *  - ACCESS_DENIED — opening a form / page the user is not mapped to (e.g. by typing the URL),
 *                    logged on the 2nd attempt at the same form (and every further 2nd).
 *
 * Nothing here ever throws into the request that triggered it: auditing must not break login or
 * navigation.
 */

const WINDOW_MINUTES = parseInt(process.env.SECURITY_ATTEMPT_WINDOW_MINUTES, 10) || 15;
const LOGIN_FAILED_THRESHOLD = 3;
const ACCESS_DENIED_THRESHOLD = 2;
const RETENTION_HOURS = 24;

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** A typed login name is only kept when it looks like an email — it may be a password typed into the wrong box. */
const safeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
};

/** Throw-away bookkeeping: drop rows older than the retention period now and then. */
async function pruneSometimes() {
  if (Math.random() > 0.02) return;
  await sequelize.query(
    `DELETE FROM security_attempts WHERE created_at < now() - make_interval(hours => :hours)`,
    { replacements: { hours: RETENTION_HOURS }, type: QueryTypes.DELETE }
  );
}

/**
 * Record one attempt and return how many of this kind the same subject (and detail) made inside the
 * window, this one included.
 */
async function recordAttempt({ kind, subject, detail = null, deviceId = null }) {
  await pruneSometimes();
  await sequelize.query(
    'INSERT INTO security_attempts (kind, subject, detail, device_id) VALUES (:kind, :subject, :detail, :deviceId)',
    { replacements: { kind, subject: String(subject).slice(0, 255), detail: detail ? String(detail).slice(0, 255) : null, deviceId }, type: QueryTypes.INSERT }
  );
  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS attempts FROM security_attempts
      WHERE kind = :kind AND subject = :subject AND (:detail::text IS NULL OR detail = :detail)
        AND created_at > now() - make_interval(mins => :minutes)`,
    { replacements: { kind, subject: String(subject).slice(0, 255), detail: detail ? String(detail).slice(0, 255) : null, minutes: WINDOW_MINUTES }, type: QueryTypes.SELECT }
  );
  return row.attempts;
}

const reachedThreshold = (attempts, threshold) => attempts >= threshold && attempts % threshold === 0;

/**
 * A wrong password / unknown email on login. `employee` is the matched account (null for an unknown
 * email). Writes a LOGIN_FAILED audit row on the 3rd attempt in the window.
 *
 * @param {{ email: string, employee?: object|null, deviceId?: string|null, companyId?: number|null }} params
 * @returns {Promise<{ attempts: number, logged: boolean }>}
 */
async function recordFailedLogin({ email, employee = null, deviceId = null, companyId = null }) {
  try {
    const typed = safeEmail(email);
    const subject = typed || `invalid:${String(email || '').length}`;
    const attempts = await recordAttempt({ kind: 'LOGIN_FAILED', subject, deviceId });
    if (!reachedThreshold(attempts, LOGIN_FAILED_THRESHOLD)) return { attempts, logged: false };

    await createAuditLog(
      employee ? employee.id : null,
      'LOGIN_FAILED',
      'employees',
      employee ? employee.id : null,
      null,
      {
        reason: employee ? 'Wrong password' : 'Unknown email',
        attempts,
        window_minutes: WINDOW_MINUTES,
        email: typed,
      },
      null,
      { companyId, deviceId, actorRole: null }
    );
    return { attempts, logged: true };
  } catch (error) {
    logger.error('Failed to record a failed-login attempt', { error: error.message });
    return { attempts: 0, logged: false };
  }
}

/** A successful sign-in clears that person's failed-login count. */
async function clearFailedLogins(email) {
  try {
    const typed = safeEmail(email);
    if (!typed) return;
    await sequelize.query(
      "DELETE FROM security_attempts WHERE kind = 'LOGIN_FAILED' AND subject = :subject",
      { replacements: { subject: typed }, type: QueryTypes.DELETE }
    );
  } catch (error) {
    logger.error('Failed to clear failed-login attempts', { error: error.message });
  }
}

/**
 * A signed-in user tried to open a form / page they are not mapped to. Writes an ACCESS_DENIED audit
 * row on the 2nd attempt at the same form in the window.
 *
 * @param {{ employee: { id: number }, roleName?: string|null, companyId?: number|null, formId?: number|null,
 *           formName?: string|null, path?: string|null, deviceId?: string|null }} params
 * @returns {Promise<{ attempts: number, logged: boolean }>}
 */
async function recordAccessDenied({ employee, roleName = null, companyId = null, formId = null, formName = null, path = null, deviceId = null }) {
  try {
    const target = formName || path || 'unknown';
    const attempts = await recordAttempt({ kind: 'ACCESS_DENIED', subject: employee.id, detail: target, deviceId });
    if (!reachedThreshold(attempts, ACCESS_DENIED_THRESHOLD)) return { attempts, logged: false };

    await createAuditLog(
      employee.id,
      'ACCESS_DENIED',
      'form_master',
      formId,
      null,
      { form_name: formName, path, attempts, window_minutes: WINDOW_MINUTES },
      null,
      { companyId, deviceId, actorRole: roleName }
    );
    return { attempts, logged: true };
  } catch (error) {
    logger.error('Failed to record an access-denied attempt', { error: error.message });
    return { attempts: 0, logged: false };
  }
}

module.exports = {
  recordFailedLogin,
  clearFailedLogins,
  recordAccessDenied,
  WINDOW_MINUTES,
  LOGIN_FAILED_THRESHOLD,
  ACCESS_DENIED_THRESHOLD,
  safeEmail,
};
