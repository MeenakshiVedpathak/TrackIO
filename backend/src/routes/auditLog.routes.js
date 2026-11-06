'use strict';

const express = require('express');
const router = express.Router();

const authenticateBase = require('../middlewares/auth');
const resolveReportCompanyScope = require('../middlewares/resolveReportCompanyScope');
const { heavyReportLimiter } = require('../middlewares/rateLimiters');
const { validate, validateAll } = require('../middlewares/validateRequest');
const controller = require('../controllers/auditLogController');
const { auditLogQuerySchema, auditDeviceQuerySchema, auditLogIdParamsSchema, accessDeniedBodySchema } = require('../validations/auditLogValidation');

// Same multi-BU contract as every /reports/* endpoint: no X-Company-Id -> the caller's whole BU
// reach (req.companyIds, an array), never a 400 for a multi-BU admin. Access by role is enforced
// in auditLogReportService.resolveScope (Platform Admin / Admin / Entity Admin / BU Admin only).
const authenticateMultiBU = [authenticateBase.authenticateIdentity, resolveReportCompanyScope];

router.use(heavyReportLimiter);

/**
 * @swagger
 * tags:
 *   name: AuditLog
 *   description: Who did what, when, as which role, from which BU, on which BU's data
 */

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: Audit log — create / update / delete / approve / login activity
 *     description: >
 *       One row per recorded action with the user, their role at the time, the user's BU / Sub-BU,
 *       the record's BU, the affected record and a plain-English summary of what changed. Actor BU
 *       (actor_bu_ids / actor_sub_bu_ids) and Record BU (record_bu_ids) are independent filters.
 *       Dates default to the last 7 days. format=json | excel | csv.
 *     tags: [AuditLog]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticateMultiBU, validate(auditLogQuerySchema, 'query'), controller.getAuditLogs);

/**
 * @swagger
 * /audit-logs/access-denied:
 *   post:
 *     summary: Report that the user was blocked from a page their role has no form for
 *     description: >
 *       Called by the frontend when a signed-in user opens (e.g. by typing the URL) a page whose form
 *       is not mapped to their role. Open to every signed-in role. The server re-checks the claim and
 *       counts the attempt; the 2nd attempt at the same form within 15 minutes is written to the
 *       audit log as ACCESS_DENIED.
 *     tags: [AuditLog]
 *     security:
 *       - bearerAuth: []
 */
router.post('/access-denied', authenticateBase.authenticateIdentity, validate(accessDeniedBodySchema, 'body'), controller.reportAccessDenied);

/**
 * @swagger
 * /audit-logs/sessions:
 *   get:
 *     summary: Login sessions — who signed in, from which device / IP / browser, and what that session did
 *     description: >
 *       One row per sign-in. Same filters as /audit-logs (user, user BU / Sub-BU, dates, device_id) plus
 *       new_device_only=true for logins from a device the person had never used before (a new browser
 *       profile or an incognito window always looks new). Use a row's session_id as the session_id
 *       filter on /audit-logs to see everything done in that session.
 *     tags: [AuditLog]
 *     security:
 *       - bearerAuth: []
 */
router.get('/sessions', authenticateMultiBU, validate(auditLogQuerySchema, 'query'), controller.getAuditLogSessions);

/**
 * @swagger
 * /audit-logs/devices:
 *   get:
 *     summary: A person's devices — first / last seen, logins, last login IP, activity in the period
 *     tags: [AuditLog]
 *     security:
 *       - bearerAuth: []
 */
router.get('/devices', authenticateMultiBU, validate(auditDeviceQuerySchema, 'query'), controller.getAuditLogDevices);

/**
 * @swagger
 * /audit-logs/filter-options:
 *   get:
 *     summary: Distinct actions, record types and roles for the Audit Log filters
 *     tags: [AuditLog]
 *     security:
 *       - bearerAuth: []
 */
router.get('/filter-options', authenticateMultiBU, controller.getAuditLogFilterOptions);

/**
 * @swagger
 * /audit-logs/{id}:
 *   get:
 *     summary: One audit entry with its full before/after values
 *     tags: [AuditLog]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticateMultiBU, validateAll({ params: auditLogIdParamsSchema }), controller.getAuditLogById);

module.exports = router;
