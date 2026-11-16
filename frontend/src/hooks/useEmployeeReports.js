import { useQuery } from '@tanstack/react-query';
import { employeeReportsApi } from '@/api/employeeReports.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// JSON-view queries only — export-button clicks (excel/csv/pdf) are plain async calls made
// directly against employeeReportsApi from the page, not cached here (a file download isn't
// cacheable "data").
// `paging` ({ page, limit }) is sent to the server; a backend that doesn't paginate yet just
// ignores it and returns every row (the page then slices client-side).
export const useEmployeeDailyReport = (date, paging = {}) =>
  useQuery({
    queryKey: [...QUERY_KEYS.EMPLOYEE_REPORT_DAILY(date), paging],
    queryFn: () => employeeReportsApi.getDaily({ date, ...paging, format: 'json' }),
    enabled: !!date,
    placeholderData: (prev) => prev,
  });

export const useEmployeeMonthlyReport = (month, year, paging = {}) =>
  useQuery({
    queryKey: [...QUERY_KEYS.EMPLOYEE_REPORT_MONTHLY(month, year), paging],
    queryFn: () => employeeReportsApi.getMonthly({ month, year, ...paging, format: 'json' }),
    enabled: !!month && !!year,
    placeholderData: (prev) => prev,
  });

export const useEmployeeRangeReport = (startDate, endDate, paging = {}) =>
  useQuery({
    queryKey: [...QUERY_KEYS.EMPLOYEE_REPORT_RANGE(startDate, endDate), paging],
    queryFn: () => employeeReportsApi.getRange({ startDate, endDate, ...paging, format: 'json' }),
    enabled: !!startDate && !!endDate,
    placeholderData: (prev) => prev,
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
