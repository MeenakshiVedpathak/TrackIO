'use strict';

const Joi = require('joi');

// Comma-separated id list, e.g. "12,15" — parsed by utils/idListParser.
const idList = Joi.string().trim().pattern(/^\d+(\s*,\s*\d+)*$/).optional().allow('')
  .messages({ 'string.pattern.base': '{{#label}} must be a comma-separated list of ids.' });
// Comma-separated names, e.g. "CREATE,DELETE".
const strList = Joi.string().trim().max(500).optional().allow('');

/**
 * Audit Log — who did what, when, as which role, from which BU, on which BU's data.
 * Actor BU (where the person belongs) and Record BU (where the affected data belongs) are two
 * independent filters. Dates default to the last 7 days (max range 366 days).
 */
const auditLogQuerySchema = Joi.object({
  // .raw() keeps YYYY-MM-DD strings for the SQL date predicates.
  start_date: Joi.date().iso().raw().optional(),
  end_date: Joi.date().iso().raw().optional(),

  actor_ids: idList,
  actor_bu_ids: idList,
  actor_sub_bu_ids: idList,
  record_bu_ids: idList,

  actions: strList,
  entity_types: strList,
  roles: strList,
  search: Joi.string().trim().max(100).allow('').optional(),
  device_id: Joi.string().trim().max(64).allow('').optional(),
  // Everything done in ONE login session / only logins from a device the person never used before.
  session_id: Joi.string().trim().max(64).allow('').optional(),
  new_device_only: Joi.boolean().optional(),

  sort: Joi.string().valid('newest', 'oldest').default('newest'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  // json (default) | excel | csv — every row matching the filters (max 50,000)
  format: Joi.string().valid('json', 'excel', 'csv').default('json'),
});

/** Devices list: whose devices (BU / person / search) and the activity window counted against each. */
const auditDeviceQuerySchema = Joi.object({
  start_date: Joi.date().iso().raw().optional(),
  end_date: Joi.date().iso().raw().optional(),
  actor_ids: idList,
  actor_bu_ids: idList,
  actor_sub_bu_ids: idList,
  search: Joi.string().trim().max(100).allow('').optional(),
  device_id: Joi.string().trim().max(64).allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

const auditLogIdParamsSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

/**
 * Reported by the frontend when a signed-in user is stopped from opening a page (typed URL) whose form
 * is not mapped to their role. The server re-checks the claim before counting it.
 */
const accessDeniedBodySchema = Joi.object({
  form_name: Joi.string().trim().max(150).allow('', null).optional(),
  path: Joi.string().trim().max(200).required(),
});

module.exports = { auditLogQuerySchema, auditDeviceQuerySchema, auditLogIdParamsSchema, accessDeniedBodySchema };
