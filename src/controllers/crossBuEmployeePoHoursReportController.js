'use strict';

const service = require('../services/crossBuEmployeePoHoursReportService');
const { sendPaginated, sendError } = require('../utils/response');
const logger = require('../utils/logger');
const { toMultiSheetExcelBuffer, toCsvExportBuffer } = require('../utils/reportExporter');

/**
 * GET /api/v1/reports/cross-bu-employee-po-hours
 * Employee x Service PO hours with Employee BU and PO BU as independent dimensions.
 * format=json (paged: totals, bu_flow, records) | excel (Details + BU Flow) | csv (details)
 */
async function getCrossBuEmployeePoHoursReport(req, res, next) {
  const authContext = {
    userId: req.userId,
    employeeId: req.employeeId,
    hierarchyRank: req.hierarchyRank,
    roleNames: req.userRoles,
  };
  try {
    const format = req.query.format || 'json';
    if (format === 'json') {
      const result = await service.getReport(req.query, authContext, req.companyIds);
      return sendPaginated(
        res,
        { period: result.period, totals: result.totals, bu_flow: result.bu_flow, records: result.records },
        result.meta,
        'Cross-BU employee & Service PO hours report fetched successfully.'
      );
    }

    const { period, sheets } = await service.getExport(req.query, authContext, req.companyIds);
    const label = period.type === 'month'
      ? `${period.year}-${String(period.month).padStart(2, '0')}`
      : `${period.start_date}_to_${period.end_date}`;
    const isExcel = format === 'excel';
    const buffer = isExcel ? await toMultiSheetExcelBuffer(sheets) : toCsvExportBuffer(sheets[0].rows, sheets[0].columns);
    res.setHeader('Content-Type', isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cross-bu-employee-po-hours-${label}.${isExcel ? 'xlsx' : 'csv'}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    if (err.statusCode) return sendError(res, err.message, err.statusCode);
    logger.error('getCrossBuEmployeePoHoursReport error', { error: err.message, stack: err.stack });
    return next(err);
  }
}

module.exports = { getCrossBuEmployeePoHoursReport };
