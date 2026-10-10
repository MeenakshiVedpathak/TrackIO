'use strict';

/**
 * @swagger
 * tags:
 *   name: System Settings
 *   description: >
 *     System-wide settings. Monthly Cap Hours (default 176) is the monthly
 *     total employee hours are scaled down to at sync/import time and the
 *     capacity reports divide by. Readable by any authenticated user; only
 *     Admin can change it. A change applies to syncs/imports run afterwards —
 *     already-synced months keep the cap they were synced with until re-synced.
 */

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/auth');
const requireSystemSettingsEditor = require('../middlewares/requireSystemSettingsEditor');
const { validate } = require('../middlewares/validateRequest');
const { updateMonthlyCapSchema } = require('../validations/systemSettingsValidation');
const systemSettingsController = require('../controllers/systemSettingsController');

/**
 * @swagger
 * /system-settings/monthly-cap:
 *   get:
 *     summary: Get the current Monthly Cap Hours setting
 *     tags: [System Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: month, schema: { type: integer, minimum: 1, maximum: 12 }, description: "Optional; with year, adds cap_for_month" }
 *       - { in: query, name: year, schema: { type: integer }, description: "Optional; with month, adds cap_for_month" }
 *     responses:
 *       200:
 *         description: "{ monthly_cap_hours, cap_for_month, cap_for_employee_month, min, max, updated_by, updated_at }"
 *   put:
 *     summary: Change the Monthly Cap Hours setting (Admin only)
 *     tags: [System Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monthly_cap_hours]
 *             properties:
 *               monthly_cap_hours:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 744
 *     responses:
 *       200:
 *         description: Updated setting
 *       403:
 *         description: Not an Admin
 *       422:
 *         description: Validation failed
 */
router.get('/monthly-cap', authenticate, systemSettingsController.getMonthlyCap);
router.put(
  '/monthly-cap',
  authenticate,
  requireSystemSettingsEditor,
  validate(updateMonthlyCapSchema),
  systemSettingsController.updateMonthlyCap
);

module.exports = router;
