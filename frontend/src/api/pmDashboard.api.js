import apiClient, { explicitBuScope } from '@/services/apiClient';

// Project Manager Dashboard — already live at /api/v1/pm-dashboard/*. Every endpoint accepts an
// optional `buId` pseudo-param, same convention as dashboard.api.js/reports.api.js: it rides
// along inside the params object (so it lands in the React Query key and refetches on change),
// but is pulled out here and applied as the request's BU scope (X-Company-Id header) rather than
// a query-string field. Omitted entirely -> the backend aggregates across every BU the caller
// belongs to, per the spec — never force a BU picker for a single-BU login.
const withBuScope = (url, params = {}) => {
  const { buId, ...query } = params;
  return apiClient.get(url, { params: query, ...explicitBuScope(buId) });
};

export const pmDashboardApi = {
  // KPI row. `month`/`year` optional — the backend defaults to the current server month.
  getSummary: (params) =>
    withBuScope('/pm-dashboard/summary', params).then((r) => r.data?.data ?? {}),

  // Project rollup table (paginated). `month`/`year`/`status`/`search`/`asOfDate`/
  // `varianceThresholdPct`/`sortBy`/`sortOrder`/`page`/`limit` all pass straight through as
  // query params — only `buId` is special-cased above.
  getProjects: (params) =>
    withBuScope('/pm-dashboard/projects', params).then((r) => r.data?.data ?? { records: [], meta: {} }),

  // Team capacity table (paginated). `month`/`year`/`search`/`benchThresholdHours`/`sortBy`/
  // `sortOrder`/`page`/`limit` pass straight through.
  getTeam: (params) =>
    withBuScope('/pm-dashboard/team', params).then((r) => r.data?.data ?? { records: [], meta: {} }),

  // Work log compliance (paginated, thin pass-through to the existing compliance report).
  // `date` OR `month`+`year`, plus `search`/`page`/`limit`. No sortBy/sortOrder — the backend
  // doesn't document one for this endpoint, so this table is never sorted client-triggered.
  getWorklog: (params) =>
    withBuScope('/pm-dashboard/worklog', params).then((r) => r.data?.data ?? { records: [], meta: {} }),

  // Merged exception feed — NOT paginated, capped at 20 per list server-side. `month`/`year` only.
  getActionRequired: (params) =>
    withBuScope('/pm-dashboard/action-required', params).then((r) => r.data?.data ?? {}),
};
