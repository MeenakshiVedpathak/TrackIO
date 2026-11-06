'use strict';

const Joi = require('joi');
const { monthYearQuerySchema } = require('./employeeTimesheetValidation');

/**
 * Employee Monthly Work Log Validation Schemas.
 */

/**
 * A single line item within a POST/PUT monthly work log submission — same
 * shape as Daily's dailyEntryLineSchema, but hours allows up to the
 * monthly ceiling (31 days x 24h = 744); the exact per-month cap
 * (days in that month x 24h) is enforced in employeeMonthlyWorkLogService.getMonthlyHourCap.
 */
const monthlyEntryLineSchema = Joi.object({
  service_po_id: Joi.number().integer().positive().required().messages({
    'any.required': 'Service PO is required.',
    'number.base': 'Service PO must be a number.',
  }),
  sub_project_id: Joi.number().integer().positive().optional().allow(null),
  hierarchy_node_id: Joi.number().integer().positive().optional().allow(null),
  hours: Joi.number().positive().max(744).required().messages({
    'any.required': 'Hours is required.',
    'number.base': 'Hours must be a number.',
    'number.positive': 'Hours must be greater than 0.',
    'number.max': 'Hours cannot exceed 744 per month.',
  }),
  description: Joi.string().trim().max(2000).allow('').optional().messages({
    'string.max': 'Description cannot exceed 2000 characters.',
  }),
});

/**
 * POST /employee-timesheets/monthly
 * PUT  /employee-timesheets/monthly
 * REPLACE SAVE for the whole month — see employeeMonthlyWorkLogService.js.
 */
const submitMonthlyWorkLogSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required().messages({
    'any.required': 'month is required.',
  }),
  year: Joi.number().integer().min(2000).required().messages({
    'any.required': 'year is required.',
  }),
  entries: Joi.array().items(monthlyEntryLineSchema).required().messages({
    'any.required': 'entries is required.',
    'array.base': 'entries must be an array.',
  }),
});

module.exports = {
  monthlyEntryLineSchema,
  submitMonthlyWorkLogSchema,
  monthYearQuerySchema,
};
