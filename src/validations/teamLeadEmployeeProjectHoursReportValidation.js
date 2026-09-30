'use strict';

const Joi = require('joi');

const idList = Joi.string().trim().pattern(/^\d+(,\d+)*$/).allow('').optional().messages({
  'string.pattern.base': '{{#label}} must be a comma-separated list of ids.',
});

// Filters shared by the report and its export — kept in one place so the
// export always accepts exactly what the on-screen report does.
const reportFilterKeys = {
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2000).max(2100).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  employeeIds: idList,
  clientIds: idList,
  projectIds: idList,
  servicePoIds: idList,
  buIds: idList,
  subBuIds: idList,
  status: Joi.string().trim().pattern(/^(pending|approved|rejected|synced)(,(pending|approved|rejected|synced))*$/).allow('').optional()
    .messages({ 'string.pattern.base': 'status must be a comma-separated list of pending, approved, rejected, synced.' }),
  search: Joi.string().trim().max(100).allow('').optional(),
};

/**
 * GET /reports/team-lead-employee-project-hours — query params.
 * No manager/team-lead id is accepted: the caller is always the Team Lead.
 */
const teamLeadEmployeeProjectHoursQuerySchema = Joi.object({
  ...reportFilterKeys,
  page: Joi.number().integer().min(1).default(1),
  // 100 = utils/pagination.js MAX_LIMIT.
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('employee', 'client', 'project', 'spo', 'hours', 'status', 'date').optional(),
  sortOrder: Joi.string().lowercase().valid('asc', 'desc').default('desc'),
})
  .and('month', 'year')
  .oxor('month', 'startDate');

/**
 * GET /reports/team-lead-employee-project-hours/export — same filters as the
 * report, every matching row (no page/limit/sort; unknown keys are stripped).
 */
const teamLeadEmployeeProjectHoursExportQuerySchema = Joi.object({
  ...reportFilterKeys,
  format: Joi.string().lowercase().valid('excel').default('excel'),
})
  .and('month', 'year')
  .oxor('month', 'startDate');

/** GET /reports/team-lead-employee-project-hours/filter-options — optional period only. */
const teamLeadEmployeeProjectHoursFilterOptionsQuerySchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2000).max(2100).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
})
  .and('month', 'year')
  .oxor('month', 'startDate');

module.exports = {
  teamLeadEmployeeProjectHoursQuerySchema,
  teamLeadEmployeeProjectHoursExportQuerySchema,
  teamLeadEmployeeProjectHoursFilterOptionsQuerySchema,
};
