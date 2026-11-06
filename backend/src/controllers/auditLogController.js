'use strict';

const service = require('../services/auditLogReportService');
const { sendSuccess, sendPaginated, sendError } = require('../utils/response');
const logger = require('../utils/logger');
const rbacService = require('../services/rbacService');
const securityAuditService = require('../services/securityAuditService');
const requestContext = require('../utils/requestContext');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const { toMultiSheetExcelBuffer, toCsvExportBuffer } = require('../utils/reportExporter');

const authContextOf = (req) => ({
  userId: req.userId,
  employeeId: req.employeeId,
  hierarchyRank: req.hierarchyRank,
});

const handle = (name, fn) => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.message, err.statusCode);
    logger.error(`${name} error`, { error: err.message, stack: err.stack });
    return next(err);
  }
};

/**
 * GET /api/v1/audit-logs
 * format=json (paged: summary cards + records) | excel | csv (every matching row)
 */
const getAuditLogs = handle('getAuditLogs', async (req, res) => {
  const format = req.query.format || 'json';
  if (format === 'json') {
    const result = await service.getLogs(req.query, authContextOf(req), req.companyIds);
    return sendPaginated(res, { period: result.period, summary: result.summary, records: result.records }, result.meta, 'Audit log fetched successfully.');
  }

  const { period, sheets } = await service.getExport(req.query, authContextOf(req), req.companyIds);
  const label = `${period.start_date}_to_${period.end_date}`;
  const isExcel = format === 'excel';
  const buffer = isExcel ? await toMultiSheetExcelBuffer(sheets) : toCsvExportBuffer(sheets[0].rows, sheets[0].columns);
  res.setHeader('Content-Type', isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${label}.${isExcel ? 'xlsx' : 'csv'}"`);
  return res.send(Buffer.from(buffer));
});

/** GET /api/v1/audit-logs/sessions — every sign-in: who, device, login IP + browser, new device?, what it did. */
const getAuditLogSessions = handle('getAuditLogSessions', async (req, res) => {
  const result = await service.getSessions(req.query, authContextOf(req), req.companyIds);
  return sendPaginated(res, { period: result.period, records: result.records }, result.meta, 'Login sessions fetched successfully.');
});

/** GET /api/v1/audit-logs/devices — a person's devices with first/last seen, logins and activity. */
const getAuditLogDevices = handle('getAuditLogDevices', async (req, res) => {
  const result = await service.getDevices(req.query, authContextOf(req), req.companyIds);
  return sendPaginated(res, { period: result.period, records: result.records }, result.meta, 'Devices fetched successfully.');
});

/** GET /api/v1/audit-logs/filter-options — values for the Action / On / Role dropdowns. */
const getAuditLogFilterOptions = handle('getAuditLogFilterOptions', async (req, res) => {
  const options = await service.getFilterOptions(authContextOf(req), req.companyIds);
  return sendSuccess(res, options, 'Audit log filter options fetched successfully.');
});

/** GET /api/v1/audit-logs/:id — one entry with its full before/after values. */
const getAuditLogById = handle('getAuditLogById', async (req, res) => {
  const record = await service.getLog(Number(req.params.id), authContextOf(req), req.companyIds);
  return sendSuccess(res, record, 'Audit log entry fetched successfully.');
});

/**
 * POST /api/v1/audit-logs/access-denied — any signed-in user.
 * The frontend calls this when it blocks a page the user's role has no form for. The claim is
 * re-checked here (a form the user really IS mapped to is ignored) and the attempt is counted; the
 * 2nd attempt at the same form within the window is written to the audit log.
 */
const reportAccessDenied = handle('reportAccessDenied', async (req, res) => {
  const formName = req.body.form_name ? String(req.body.form_name).trim() : null;

  if (formName) {
    const roleIds = (req.activeRoles || []).map((role) => role.id);
    const forms = await rbacService.getActiveFormsForRoles(roleIds, req.hierarchyRank);
    const allowed = new Set(Object.values(forms || {}).flat().map((form) => form.name));
    if (allowed.has(formName)) return sendSuccess(res, { recorded: false }, 'Access is allowed.');
  }

  let formId = null;
  if (formName) {
    const [row] = await sequelize.query('SELECT id FROM form_master WHERE form_name = :formName LIMIT 1', { replacements: { formName }, type: QueryTypes.SELECT });
    formId = row ? row.id : null;
  }

  await securityAuditService.recordAccessDenied({
    employee: { id: req.employeeId },
    roleName: req.userRoleName,
    companyId: (req.employeeBusinessUnits || [])[0]?.id ?? null,
    formId,
    formName,
    path: req.body.path,
    deviceId: requestContext.getDeviceId(req),
  });
  return sendSuccess(res, { recorded: true }, 'Recorded.');
});

module.exports = { getAuditLogs, getAuditLogSessions, getAuditLogDevices, getAuditLogFilterOptions, getAuditLogById, reportAccessDenied };
