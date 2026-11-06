'use strict';

/**
 * `approval_status` filter shared by the Project-Wise Timesheet and Cross-BU
 * Employee PO Hours reports. Accepts one value or a comma-separated list
 * ("pending,approved"); "all" (or nothing selected) means no status filter.
 */

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

// approval_status value -> work-log statuses ("approved" also covers synced rows)
const STATUS_FILTER = {
  pending: ['pending'],
  approved: ['approved', 'synced'],
  rejected: ['rejected'],
};

function splitApprovalStatus(value) {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
}

/**
 * @param {string|string[]|undefined} value - raw approval_status query value
 * @returns {string[]|null} work-log statuses to include, or null for no filter
 */
function resolveApprovalStatuses(value) {
  const selected = splitApprovalStatus(value);
  if (selected.length === 0 || selected.includes('all')) return null;
  return [...new Set(selected.flatMap((s) => STATUS_FILTER[s] || []))];
}

/**
 * Joi custom validator: every comma-separated token must be a known value.
 */
function validateApprovalStatus(value, helpers) {
  const invalid = splitApprovalStatus(value).filter((s) => s !== 'all' && !APPROVAL_STATUSES.includes(s));
  if (invalid.length > 0) {
    return helpers.message(`"approval_status" must be "all" or a comma-separated list of: ${APPROVAL_STATUSES.join(', ')}`);
  }
  return value;
}

module.exports = { resolveApprovalStatuses, validateApprovalStatus };
