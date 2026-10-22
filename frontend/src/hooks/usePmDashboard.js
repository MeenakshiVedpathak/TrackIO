import { useQuery } from '@tanstack/react-query';
import { pmDashboardApi } from '@/api/pmDashboard.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// KPI row + Action Required must be populated the instant the page opens (no filters
// required), so neither hook below is ever `enabled`-gated on anything but the params
// object itself always being present — which it is, since PmDashboard.jsx seeds month/year
// from the current date on first render.
export const usePmDashboardSummary = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PM_DASHBOARD_SUMMARY(params),
    queryFn: () => pmDashboardApi.getSummary(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const usePmDashboardActionRequired = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PM_DASHBOARD_ACTION_REQUIRED(params),
    queryFn: () => pmDashboardApi.getActionRequired(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Project Overview / Project Health table — `enabled` lets the page defer this query until the
// table has actually scrolled into view (see components/pmDashboard/ProjectOverviewTable.jsx),
// so it never competes with the KPI row/Action Required feed for the first paint.
export const usePmDashboardProjects = (params, enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.PM_DASHBOARD_PROJECTS(params),
    queryFn: () => pmDashboardApi.getProjects(params),
    enabled,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const usePmDashboardTeam = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PM_DASHBOARD_TEAM(params),
    queryFn: () => pmDashboardApi.getTeam(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const usePmDashboardWorklog = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PM_DASHBOARD_WORKLOG(params),
    queryFn: () => pmDashboardApi.getWorklog(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
