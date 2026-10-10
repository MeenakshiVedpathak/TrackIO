'use strict';

const Joi = require('joi');
const {
  MIN_MONTHLY_CAP_HOURS,
  MAX_MONTHLY_CAP_HOURS,
} = require('../services/monthlyCapService');

const updateMonthlyCapSchema = Joi.object({
  monthly_cap_hours: Joi.number()
    .min(MIN_MONTHLY_CAP_HOURS)
    .max(MAX_MONTHLY_CAP_HOURS)
    .precision(2)
    .required()
    .messages({
      'any.required': 'Monthly cap hours is required.',
      'number.base': 'Monthly cap hours must be a number.',
      'number.min': `Monthly cap hours must be at least ${MIN_MONTHLY_CAP_HOURS}.`,
      'number.max': `Monthly cap hours cannot exceed ${MAX_MONTHLY_CAP_HOURS}.`,
    }),
});

module.exports = { updateMonthlyCapSchema };
