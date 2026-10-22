import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useDashboard = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.DASHBOARD_STATS(params),
    queryFn: () => dashboardApi.getStats(params),
    staleTime: 0,
  });

export const useEmployeeBillableBreakdown = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.DASHBOARD_EMPLOYEE_BILLABLE(params),
    queryFn: () => dashboardApi.getEmployeeBillableBreakdown(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 1000 * 60 * 2,
  });

export const useTopEmployeesByPO = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.DASHBOARD_TOP_EMPLOYEES_BY_PO(params),
    queryFn: () => dashboardApi.getTopEmployeesByPO(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 1000 * 60 * 2,
  });

export const useDashboardAnalytics = (params, options = {}) =>
  useQuery({
    queryKey: ['dashboard', 'analytics', params],
    queryFn: () => dashboardApi.getAnalytics(params),
    enabled: (options.enabled ?? true) && !!(params?.fiscalYear || (params?.month && params?.year)),
    staleTime: 0,
  });

export const useDashboardAnalytics2 = (params, options = {}) =>
  useQuery({
    queryKey: ['dashboard', 'analytics2', params],
    queryFn: () => dashboardApi.getAnalytics2(params),
    enabled: (options.enabled ?? true) && !!(params?.fiscalYear || (params?.month && params?.year)),
    staleTime: 0,
  });
