import apiClient, { explicitBuScope } from '@/services/apiClient';

// The backend hard-caps `limit` at 100 (bakend/src/utils/pagination.js MAX_LIMIT), silently
// truncating any request for more — so "export all" / "sum all" callers must page through
// results instead of requesting one large limit.
const RESOURCE_ALLOCATION_PAGE_LIMIT = 100;
const MAX_RESOURCE_ALLOCATION_PAGES = 100; // safety cap: 10,000 records, far beyond any realistic dataset

// Single entry point for every /reports/* GET so the BU rule is applied uniformly instead of
// per-method. `buId` is a pseudo-param: pages put it in their filter params object like any
// other filter (so it lands in the React Query key and refetches on change), but it is pulled
// out here and turned into the request's BU scope rather than a query-string field — the
// backend scopes reports by the X-Company-Id header, not by a body/query param.
// Absent or 'all' => no header => every BU the caller's role can reach, which is why reports
// now load cross-BU on first paint instead of inheriting the navbar's active BU.
const getReport = (url, params = {}) => {
  const { buId, ...query } = params;
  return apiClient.get(url, { params: query, ...explicitBuScope(buId) }).then((r) => r.data);
};

export const reportsApi = {
  getMonthlyCostSummary: (params) => getReport('/reports/monthly-cost-summary', params),
  getResourceAllocation: (params) => getReport('/reports/resource-allocation', params),
  fetchAllResourceAllocationRows: async (filterParams) => {
    const { page: _page, limit: _limit, ...baseParams } = filterParams ?? {};
    const first = await reportsApi.getResourceAllocation({ ...baseParams, page: 1, limit: RESOURCE_ALLOCATION_PAGE_LIMIT });
    const total = first?.meta?.total ?? 0;
    const totalPages = Math.min(MAX_RESOURCE_ALLOCATION_PAGES, Math.max(1, Math.ceil(total / RESOURCE_ALLOCATION_PAGE_LIMIT)));
    const rows = Array.isArray(first?.data) ? [...first.data] : [];

    for (let p = 2; p <= totalPages; p++) {
      const res = await reportsApi.getResourceAllocation({ ...baseParams, page: p, limit: RESOURCE_ALLOCATION_PAGE_LIMIT });
      if (Array.isArray(res?.data)) rows.push(...res.data);
    }

    return rows;
  },
  getServicePOSummary: (params) => getReport('/reports/service-po-summary', params),
  getInvoicePOSummary: (params) => getReport('/reports/invoice-po-summary', params),
  getMonthlyResourceUtilization: (params) => getReport('/reports/monthly-resource-utilization', params),
  getEmployeeUtilizationSummary: (params) => getReport('/reports/employee-utilization-summary', params),
  getResourceProjectUtilization: (params) => getReport('/reports/resource-project-utilization-report', params),
  getClientServicePOHours: (params) => getReport('/reports/client-service-po-hours', params),

  // Analytics — margin/profitability/risk reports (§ new report suite)
  getServicePOProfitability: (params) => getReport('/reports/service-po-profitability', params),
  getBudgetedMarginForecast: (params) => getReport('/reports/budgeted-margin-forecast', params),
  getResourceStaffingPlanAccuracy: (params) => getReport('/reports/resource-staffing-plan-accuracy', params),
  getClientProfitabilityConcentration: (params) => getReport('/reports/client-profitability-concentration', params),
  getBUPerformanceScorecard: (params) => getReport('/reports/bu-performance-scorecard', params),
  getEmployeeCapacityForecast: (params) => getReport('/reports/employee-capacity-forecast', params),
  getServicePOTimelineRisk: (params) => getReport('/reports/service-po-timeline-risk', params),
  getDeliveryHeadPerformance: (params) => getReport('/reports/delivery-head-performance', params),
  getInvoiceRealizationTrend: (params) => getReport('/reports/invoice-realization-trend', params),
  getServiceLineBusinessMix: (params) => getReport('/reports/service-line-business-mix', params),

  // Budget/cost analytics reports (§ new report suite 2)
  getBudgetVsBilled: (params) => getReport('/reports/budget-vs-billed', params),
  getClientCostAnalytics: (params) => getReport('/reports/client-cost-analytics', params),
  getClientWiseAnalytics: (params) => getReport('/reports/client-wise-analytics', params),
  getMonthlyHoursTrend: (params) => getReport('/reports/monthly-hours-trend', params),
  getEmployeeBenchPercentage: (params) => getReport('/reports/employee-bench-percentage', params),

  // Trend/budget reports (§ new report suite 3). Both are server-paginated and server-sorted —
  // page/limit/sortBy/sortOrder go straight through, and the response's `meta` drives the footer.
  getResourceUtilizationTrend: (params) => getReport('/reports/resource-utilization-trend', params),
  getServicePOHoursBudget: (params) => getReport('/reports/service-po-hours-budget', params),
  // This pair predates `getReport` and names its BU filter `company_id` rather than `buId` — it
  // sends the chosen BU as BOTH a query param and the request's BU scope, because unlike the rest
  // of /reports/* this endpoint filters on the param server-side.
  //
  // `company_id` defaults to 'all' — the same "no X-Company-Id, scope by role reach" scope every
  // other report starts on. Without the default, the caller omitting it (which both call sites do
  // while the filter sits on "All Business Units") fell through to explicitBuScope(undefined),
  // i.e. the navbar's globally-active BU: a BU-mapped login asking for all their BUs quietly got
  // one of them, which is precisely the "wrong BU reads as no data" trap the shared BU filter
  // exists to avoid.
  getEmployeeWorkLogHoursSummary: ({ company_id = 'all', ...rest } = {}) =>
    apiClient
      .get('/reports/employee-work-log-hours-summary', {
        params: { ...rest, ...(company_id !== 'all' && { company_id }) },
        ...explicitBuScope(company_id),
      })
      .then((r) => r.data),
  getEmployeeWorkLogHoursSummaryDetails: (employeeId, { company_id = 'all', ...rest } = {}) =>
    apiClient
      .get(`/reports/employee-work-log-hours-summary/${employeeId}/details`, {
        params: { ...rest, ...(company_id !== 'all' && { company_id }) },
        ...explicitBuScope(company_id),
      })
      .then((r) => r.data),

  getEmployeeWorkLogCompliance: (params) =>
    getReport('/reports/employee-work-log-compliance', params),

  // Backend hard-caps limit at 100 for this endpoint. Fetch all pages at 100/page and
  // merge records — same pattern as fetchAllResourceAllocationRows.
  fetchAllEmployeeWorkLogComplianceRows: async (filterParams) => {
    const PAGE_LIMIT = 100;
    const MAX_PAGES = 200; // safety cap — 20,000 records, well beyond any realistic dataset
    const { page: _p, limit: _l, ...baseParams } = filterParams ?? {};
    const first = await reportsApi.getEmployeeWorkLogCompliance({ ...baseParams, page: 1, limit: PAGE_LIMIT });
    const total = first?.meta?.total ?? 0;
    const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_LIMIT)));
    const records = Array.isArray(first?.data?.records) ? [...first.data.records] : [];

    for (let p = 2; p <= totalPages; p++) {
      const res = await reportsApi.getEmployeeWorkLogCompliance({ ...baseParams, page: p, limit: PAGE_LIMIT });
      if (Array.isArray(res?.data?.records)) records.push(...res.data.records);
    }

    // Return the same shape the component already destructures from data?.data?.records
    return { ...first, data: { ...first?.data, records } };
  },

  sendWorkLogComplianceReminder: (body) =>
    apiClient.post('/reports/employee-work-log-compliance/remind', body).then((r) => r.data),

  // Bulk remind — two modes:
  // • remindAll: true + optional company_id → backend resolves all below-threshold employees itself
  // • employeeIds: [...] + period              → remind a specific selection
  sendWorkLogComplianceBulkReminder: (body) =>
    apiClient.post('/reports/employee-work-log-compliance/remind-bulk', body).then((r) => r.data),
};
