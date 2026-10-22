import { useQuery } from '@tanstack/react-query';
import { platformAdminReportsApi } from '@/api/platformAdminReports.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useTotalAdmins = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PLATFORM_ADMIN_TOTAL_ADMINS(params),
    queryFn: () => platformAdminReportsApi.getTotalAdmins(params),
    placeholderData: (prev) => prev,
  });

// Month/year are required together — gated off until both are set (in practice always seeded
// with the current month/year, see EmployeeWorkLogSyncedTab.jsx).
export const useEmployeeWorkLogSynced = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PLATFORM_ADMIN_EMPLOYEE_WORK_LOG(params),
    queryFn: () => platformAdminReportsApi.getEmployeeWorkLogSynced(params),
    enabled: params.month != null && params.year != null,
    placeholderData: (prev) => prev,
  });
