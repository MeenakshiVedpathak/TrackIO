import apiClient, { explicitBuScope } from '@/services/apiClient';

// The Analytics Dashboard's Business Unit filter. `buId` is a pseudo-param, same convention as
// Reports and the Masters: the page puts it in its params object like any other filter (so it
// lands in the React Query key and refetches on change), but it is pulled out here and applied
// as the request's BU scope (X-Company-Id) rather than a query-string field.
const withBuScope = (url, params = {}) => {
  const { buId, ...query } = params;
  return apiClient.get(url, { params: query, ...explicitBuScope(buId) });
};

export const dashboardApi = {
  getStats: (params) =>
    apiClient.get('/dashboard/stats', { params }).then((r) => r.data?.data ?? {}),

  getEmployeeBillableBreakdown: (params) =>
    apiClient.get('/dashboard/employee-billable-breakdown', { params }).then((r) => r.data),

  getTopEmployeesByPO: (params) =>
    apiClient.get('/dashboard/top-employees-by-po', { params }).then((r) => r.data),

  getAnalytics: (params) =>
    withBuScope('/dashboard/analytics', params).then((r) => r.data?.data ?? {}),

  getAnalytics2: (params) =>
    withBuScope('/dashboard/analytics2', params).then((r) => r.data?.data ?? {}),
};
