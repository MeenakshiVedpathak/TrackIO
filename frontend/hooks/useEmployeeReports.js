import { useQuery } from '@tanstack/react-query';
import { employeeReportsApi } from '@/api/employeeReports.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// JSON-view queries only — export-button clicks (excel/csv/pdf) are plain async calls made
// directly against employeeReportsApi from the page, not cached here (a file download isn't
// cacheable "data").
export const useEmployeeDailyReport = (date) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_REPORT_DAILY(date),
    queryFn: () => employeeReportsApi.getDaily({ date, format: 'json' }),
    enabled: !!date,
  });

export const useEmployeeMonthlyReport = (month, year) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_REPORT_MONTHLY(month, year),
    queryFn: () => employeeReportsApi.getMonthly({ month, year, format: 'json' }),
    enabled: !!month && !!year,
  });

export const useEmployeeRangeReport = (startDate, endDate) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_REPORT_RANGE(startDate, endDate),
    queryFn: () => employeeReportsApi.getRange({ startDate, endDate, format: 'json' }),
    enabled: !!startDate && !!endDate,
  });

// `params` carries whichever period shape the caller built (startDate/endDate or month/year)
// plus optional employee_id/service_po_id/project_id filters — `enabled` gates the fetch until
// the period is actually complete (e.g. a Range picker with only one side chosen).
export const useEmployeeWorkLogTimeReport = (params, enabled) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_REPORT_WORK_LOG_TIME(params),
    queryFn: () => employeeReportsApi.getWorkLogTime({ ...params, format: 'json' }),
    enabled,
  });
