import { useQuery } from '@tanstack/react-query';
import { employeeProjectHoursReportApi } from '@/api/employeeProjectHoursReport.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Structure-only, no hours — safe to fetch once and cache for the session.
export const useEmployeeProjectHoursFilterTree = () =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_PROJECT_HOURS_FILTER_TREE,
    queryFn: employeeProjectHoursReportApi.getFilterTree,
    staleTime: 5 * 60 * 1000,
  });

export const useEmployeeProjectHoursReport = (params, enabled) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_PROJECT_HOURS_REPORT(params),
    queryFn: () => employeeProjectHoursReportApi.getReport(params),
    enabled,
  });
