'use strict';

const Joi = require('joi');

const idList = Joi.string().trim().pattern(/^\d+(,\d+)*$/).allow('').optional().messages({
  'string.pattern.base': '{{#label}} must be a comma-separated list of ids.',
});

/**
 * GET /reports/employee-role-bu-mapping — query params.
 * format=json (paged, default) | excel (every matching row, same filters).
 */
const employeeRoleBuMappingQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  // 100 = utils/pagination.js MAX_LIMIT (the shared cap this report pages with).
  limit: Joi.number().integer().min(1).max(100).default(20),
  entityIds: idList,
  buIds: idList,
  subBuIds: idList,
  roleIds: idList,
  employeeId: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(100).allow('').optional(),
  format: Joi.string().valid('json', 'excel').default('json'),
});

module.exports = { employeeRoleBuMappingQuerySchema };
