import { useQuery } from '@tanstack/react-query';
import { timesheetApprovalStatusReportApi } from '@/api/timesheetApprovalStatusReport.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useTimesheetApprovalStatusReport = (params, enabled) =>
  useQuery({
    queryKey: QUERY_KEYS.TIMESHEET_APPROVAL_STATUS_REPORT(params),
    queryFn: () => timesheetApprovalStatusReportApi.getReport(params),
    enabled,
  });
