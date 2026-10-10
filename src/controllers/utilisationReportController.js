'use strict';

const service = require('../services/utilisationReportService');
const { sendPaginated, sendError } = require('../utils/response');
const { toMultiSheetExcelBuffer } = require('../utils/reportExporter');
const logger = require('../utils/logger');

const PCT_FMT = '0.00"%"';
const HRS_FMT = '#,##0.00';

const BU_COLUMNS = [
  { key: 'buName', label: 'BU Name', width: 30 },
  { key: 'subBuName', label: 'Sub BU Name', width: 30 },
  { key: 'totalEmployees', label: 'Total Employees', width: 16 },
  { key: 'expectedHours', label: 'Expected Hrs', width: 16, numFmt: HRS_FMT },
  { key: 'billableHours', label: 'Billable Hrs', width: 16, numFmt: HRS_FMT },
  { key: 'nonBillableHours', label: 'Non-Billable Hrs', width: 18, numFmt: HRS_FMT },
  { key: 'customerNonBillableHours', label: 'Customer Non-Billable Hrs', width: 26, numFmt: HRS_FMT },
  { key: 'totalLoggedHours', label: 'Total Logged Hrs', width: 18, numFmt: HRS_FMT },
  { key: 'utilizationPercentage', label: 'Utilisation %', width: 14, numFmt: PCT_FMT },
  { key: 'notLoggedHours', label: 'Not Logged Hrs', width: 16, numFmt: HRS_FMT },
  { key: 'originalBillableHours', label: 'Original Billable Hrs', width: 20, numFmt: HRS_FMT },
  { key: 'originalNonBillableHours', label: 'Original Non-Billable Hrs', width: 24, numFmt: HRS_FMT },
  { key: 'originalCustomerNonBillableHours', label: 'Original Customer Non-Billable Hrs', width: 32, numFmt: HRS_FMT },
  { key: 'originalTotalLoggedHours', label: 'Original Total Logged Hrs', width: 24, numFmt: HRS_FMT },
  { key: 'originalUtilizationPercentage', label: 'Original Utilisation %', width: 20, numFmt: PCT_FMT },
];

const EMP_PROJECT_COLUMNS = [
  { key: 'employeeCode', label: 'Employee Code', width: 16 },
  { key: 'employeeName', label: 'Employee Name', width: 28 },
  { key: 'projectName', label: 'Project Name', width: 32 },
  { key: 'clientName', label: 'Client', width: 24 },
  { key: 'loggedHours', label: 'Logged Hrs', width: 14, numFmt: HRS_FMT },
  { key: 'adjustedHours', label: 'Adjusted Hrs (After Sync)', width: 24, numFmt: HRS_FMT },
  { key: 'originalUtilizationPercentage', label: 'Original Util %', width: 16, numFmt: PCT_FMT },
  { key: 'totalUtilizationPercentage', label: 'Total Util % (After Sync)', width: 24, numFmt: PCT_FMT },
];

const periodSuffix = (period) => (
  [period.startDate, period.endDate].filter(Boolean).join('_to_')
);

/**
 * Shared handler: format=json (default) -> one page; format=excel -> every
 * row matching the same filters (page/limit ignored), with a Total row.
 */
const handle = ({ label, fn, message, columns, sheetName, filePrefix, totalRow }) => async (req, res, next) => {
  try {
    const query = { ...req.body, ...req.query };

    if (query.format === 'excel') {
      const { data, summary, period } = await fn(query, req.companyIds, { exportAll: true });
      const rows = [...data, totalRow(summary)];
      const buffer = await toMultiSheetExcelBuffer([{ name: sheetName, columns, rows }]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}_${periodSuffix(period)}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }

    const { data, meta, summary, period } = await fn(query, req.companyIds);
    return sendPaginated(res, { records: data, summary, period }, meta, message);
  } catch (err) {
    if (err.statusCode) return sendError(res, err.message, err.statusCode);
    logger.error(`${label} error`, { error: err.message, stack: err.stack });
    return next(err);
  }
};

/** GET /api/v1/reports/bu-wise-utilisation  (?format=excel exports every matching row) */
const getBuWiseUtilisation = handle({
  label: 'getBuWiseUtilisation',
  fn: service.getBuWiseUtilisationReport,
  message: 'BU-wise utilisation report fetched successfully.',
  columns: BU_COLUMNS,
  sheetName: 'BU-wise Utilisation',
  filePrefix: 'BU_wise_Utilisation',
  totalRow: (s) => ({
    buName: 'Total',
    totalEmployees: s.totalEmployees,
    expectedHours: s.expectedHours,
    billableHours: s.billableHours,
    nonBillableHours: s.nonBillableHours,
    customerNonBillableHours: s.customerNonBillableHours,
    totalLoggedHours: s.totalLoggedHours,
    utilizationPercentage: s.utilizationPercentage,
    notLoggedHours: s.notLoggedHours,
    originalBillableHours: s.originalBillableHours,
    originalNonBillableHours: s.originalNonBillableHours,
    originalCustomerNonBillableHours: s.originalCustomerNonBillableHours,
    originalTotalLoggedHours: s.originalTotalLoggedHours,
    originalUtilizationPercentage: s.originalUtilizationPercentage,
  }),
});

/** GET /api/v1/reports/employee-project-utilisation  (?format=excel exports every matching row) */
const getEmployeeProjectUtilisation = handle({
  label: 'getEmployeeProjectUtilisation',
  fn: service.getEmployeeProjectUtilisationReport,
  message: 'Employee project utilisation report fetched successfully.',
  columns: EMP_PROJECT_COLUMNS,
  sheetName: 'Employee Project Utilisation',
  filePrefix: 'Employee_Project_Utilisation',
  // The % columns are per-employee totals — meaningless summed/averaged, so left blank.
  totalRow: (s) => ({
    employeeName: 'Total',
    loggedHours: s.loggedHours,
    adjustedHours: s.adjustedHours,
  }),
});

module.exports = { getBuWiseUtilisation, getEmployeeProjectUtilisation };
