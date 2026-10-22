import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useMonthlyCostSummary = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_MONTHLY_COST_SUMMARY(params),
    queryFn: () => reportsApi.getMonthlyCostSummary(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useResourceAllocationReport = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_RESOURCE_ALLOCATION(params),
    queryFn: () => reportsApi.getResourceAllocation(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useServicePOResourceReport = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_PO_RESOURCE(params),
    queryFn: () => reportsApi.getResourceAllocation(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Every matching record for the current filters, not just one page — used for on-screen
// totals and Excel export, which both need the full filtered dataset. Same page-walking
// workaround as useServicePOSummaryTotals below (backend caps `limit` at 100).
export const useResourceAllocationAllRows = (filterParams) => {
  const { page: _page, limit: _limit, ...baseParams } = filterParams ?? {};
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_RESOURCE_ALLOCATION_ALL_ROWS(baseParams),
    queryFn: () => reportsApi.fetchAllResourceAllocationRows(baseParams),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

export const useServicePOSummary = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_PO_SUMMARY(params),
    queryFn: () => reportsApi.getServicePOSummary(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

/*
 * TEMPORARY frontend workaround: the backend's `summary` totals are computed
 * only from the current page's rows instead of the full filtered set (a
 * backend bug — flagged separately, not fixed here since backend is owned by
 * another developer). Until that's fixed server-side, walk every page
 * (capped at the API's own page-size ceiling of 100) and sum each page's
 * summary fields client-side to get a correct grand total.
 */
const PO_SUMMARY_PAGE_LIMIT = 100;
const MAX_SUMMARY_PAGES = 50; // safety cap: 5,000 records: far beyond any realistic PO count

export const useServicePOSummaryTotals = (filterParams) => {
  const { page: _page, limit: _limit, ...baseParams } = filterParams ?? {};
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_PO_SUMMARY_TOTALS(baseParams),
    queryFn: async () => {
      const first = await reportsApi.getServicePOSummary({ ...baseParams, page: 1, limit: PO_SUMMARY_PAGE_LIMIT });
      const total = first?.meta?.total ?? 0;
      const totalPages = Math.min(MAX_SUMMARY_PAGES, Math.max(1, Math.ceil(total / PO_SUMMARY_PAGE_LIMIT)));
      const summaries = [first?.data?.summary].filter(Boolean);

      for (let p = 2; p <= totalPages; p++) {
        const res = await reportsApi.getServicePOSummary({ ...baseParams, page: p, limit: PO_SUMMARY_PAGE_LIMIT });
        if (res?.data?.summary) summaries.push(res.data.summary);
      }

      return summaries.reduce((acc, s) => {
        Object.keys(s).forEach((key) => { acc[key] = (acc[key] ?? 0) + (Number(s[key]) || 0); });
        return acc;
      }, {});
    },
    enabled: !!(baseParams?.month && baseParams?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

export const useInvoicePOSummary = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_INVOICE_PO_SUMMARY(params),
    queryFn: () => reportsApi.getInvoicePOSummary(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

/*
 * Same page-only `summary` limitation as Service PO Summary (confirmed by the backend team for
 * this endpoint too — "summary totals are computed over the current page only, not the full
 * filtered dataset"). Walk every page and sum client-side for a correct grand total.
 */
const INVOICE_PO_SUMMARY_PAGE_LIMIT = 100;
const MAX_INVOICE_PO_SUMMARY_PAGES = 50; // safety cap: 5,000 records: far beyond any realistic PO count

export const useInvoicePOSummaryTotals = (filterParams) => {
  const { page: _page, limit: _limit, ...baseParams } = filterParams ?? {};
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_INVOICE_PO_SUMMARY_TOTALS(baseParams),
    queryFn: async () => {
      const first = await reportsApi.getInvoicePOSummary({ ...baseParams, page: 1, limit: INVOICE_PO_SUMMARY_PAGE_LIMIT });
      const total = first?.meta?.total ?? 0;
      const totalPages = Math.min(MAX_INVOICE_PO_SUMMARY_PAGES, Math.max(1, Math.ceil(total / INVOICE_PO_SUMMARY_PAGE_LIMIT)));
      const summaries = [first?.data?.summary].filter(Boolean);

      for (let p = 2; p <= totalPages; p++) {
        const res = await reportsApi.getInvoicePOSummary({ ...baseParams, page: p, limit: INVOICE_PO_SUMMARY_PAGE_LIMIT });
        if (res?.data?.summary) summaries.push(res.data.summary);
      }

      return summaries.reduce((acc, s) => {
        Object.keys(s).forEach((key) => { acc[key] = (acc[key] ?? 0) + (Number(s[key]) || 0); });
        return acc;
      }, {});
    },
    enabled: !!(baseParams?.month && baseParams?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

export const useMonthlyResourceUtilization = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_MONTHLY_RESOURCE_UTILIZATION(params),
    queryFn: () => reportsApi.getMonthlyResourceUtilization(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useEmployeeUtilizationSummary = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_EMPLOYEE_UTILIZATION_SUMMARY(params),
    queryFn: () => reportsApi.getEmployeeUtilizationSummary(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

/*
 * Same page-only `summary` limitation as Invoice PO Summary / Service PO Summary (the backend's
 * summary only aggregates the current page). Walk every page and sum client-side for a correct
 * grand total.
 */
const EMPLOYEE_UTILIZATION_SUMMARY_PAGE_LIMIT = 100;
const MAX_EMPLOYEE_UTILIZATION_SUMMARY_PAGES = 50; // safety cap: 5,000 employees: far beyond any realistic headcount

export const useEmployeeUtilizationSummaryTotals = (filterParams) => {
  const { page: _page, limit: _limit, ...baseParams } = filterParams ?? {};
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_EMPLOYEE_UTILIZATION_SUMMARY_TOTALS(baseParams),
    queryFn: async () => {
      const first = await reportsApi.getEmployeeUtilizationSummary({ ...baseParams, page: 1, limit: EMPLOYEE_UTILIZATION_SUMMARY_PAGE_LIMIT });
      const total = first?.meta?.total ?? 0;
      const totalPages = Math.min(MAX_EMPLOYEE_UTILIZATION_SUMMARY_PAGES, Math.max(1, Math.ceil(total / EMPLOYEE_UTILIZATION_SUMMARY_PAGE_LIMIT)));
      const summaries = [first?.data?.summary].filter(Boolean);

      for (let p = 2; p <= totalPages; p++) {
        const res = await reportsApi.getEmployeeUtilizationSummary({ ...baseParams, page: p, limit: EMPLOYEE_UTILIZATION_SUMMARY_PAGE_LIMIT });
        if (res?.data?.summary) summaries.push(res.data.summary);
      }

      return summaries.reduce((acc, s) => {
        Object.keys(s).forEach((key) => { acc[key] = (acc[key] ?? 0) + (Number(s[key]) || 0); });
        return acc;
      }, {});
    },
    enabled: !!(baseParams?.month && baseParams?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

export const useResourceProjectUtilization = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_RESOURCE_PROJECT_UTILIZATION(params),
    queryFn: () => reportsApi.getResourceProjectUtilization(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Backend requires exactly one date mode: {month, year} XOR {startDate, endDate} — the query
// only fires once one full mode is selected, mirroring the other period-gated report hooks above.
export const useClientServicePOHours = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_CLIENT_SERVICE_PO_HOURS(params),
    queryFn: () => reportsApi.getClientServicePOHours(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

export const useServicePOProfitability = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_PO_PROFITABILITY(params),
    queryFn: () => reportsApi.getServicePOProfitability(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useBudgetedMarginForecast = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_BUDGETED_MARGIN_FORECAST(params),
    queryFn: () => reportsApi.getBudgetedMarginForecast(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useResourceStaffingPlanAccuracy = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_RESOURCE_STAFFING_PLAN_ACCURACY(params),
    queryFn: () => reportsApi.getResourceStaffingPlanAccuracy(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useClientProfitabilityConcentration = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_CLIENT_PROFITABILITY_CONCENTRATION(params),
    queryFn: () => reportsApi.getClientProfitabilityConcentration(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Entity Admin / Admin only — the backend 403s for every other role. This hook doesn't special-case
// that; the page just renders whatever error extractApiError surfaces for a 403.
export const useBUPerformanceScorecard = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_BU_PERFORMANCE_SCORECARD(params),
    queryFn: () => reportsApi.getBUPerformanceScorecard(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });

export const useEmployeeCapacityForecast = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_EMPLOYEE_CAPACITY_FORECAST(params),
    queryFn: () => reportsApi.getEmployeeCapacityForecast(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// No month/year required — asOfDate is optional and defaults server-side to today, so this
// always fires (unlike every other period-gated hook above).
export const useServicePOTimelineRisk = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_PO_TIMELINE_RISK(params),
    queryFn: () => reportsApi.getServicePOTimelineRisk(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

export const useDeliveryHeadPerformance = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_DELIVERY_HEAD_PERFORMANCE(params),
    queryFn: () => reportsApi.getDeliveryHeadPerformance(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Accepts either the single-month shorthand {month, year} or a range {startMonth, startYear,
// endMonth, endYear} — fires once either full mode is present.
export const useInvoiceRealizationTrend = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasRange = !!(params?.startMonth && params?.startYear && params?.endMonth && params?.endYear);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_INVOICE_REALIZATION_TREND(params),
    queryFn: () => reportsApi.getInvoiceRealizationTrend(params),
    enabled: hasMonthYear || hasRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

// Not paginated — small, fixed result set per month.
export const useServiceLineBusinessMix = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_LINE_BUSINESS_MIX(params),
    queryFn: () => reportsApi.getServiceLineBusinessMix(params),
    enabled: !!(params?.month && params?.year),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Backend requires exactly one date mode: {month, year} XOR {startDate, endDate} — same
// XOR-gated pattern as useClientServicePOHours above.
export const useBudgetVsBilled = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_BUDGET_VS_BILLED(params),
    queryFn: () => reportsApi.getBudgetVsBilled(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

// No period filter — always all-time, matching the Dashboard. Always enabled.
export const useClientCostAnalytics = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_CLIENT_COST_ANALYTICS(params),
    queryFn: () => reportsApi.getClientCostAnalytics(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

// Backend requires exactly one date mode: {month, year} XOR {startDate, endDate}.
export const useClientWiseAnalytics = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_CLIENT_WISE_ANALYTICS(params),
    queryFn: () => reportsApi.getClientWiseAnalytics(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

// Backend requires exactly one date mode: {month, year} XOR {startDate, endDate}. Not
// paginated — a fixed-size, zero-filled series across the resolved month range.
export const useMonthlyHoursTrend = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_MONTHLY_HOURS_TREND(params),
    queryFn: () => reportsApi.getMonthlyHoursTrend(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

// Backend requires exactly one date mode: {month, year} XOR {startDate, endDate} — 422 otherwise,
// so the request is held until exactly one is supplied. Server-paginated AND server-sorted: unlike
// the client-paginated reports above, page/limit/sortBy/sortOrder go straight to the backend and
// the response's `meta` drives the footer.
export const useResourceUtilizationTrend = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_RESOURCE_UTILIZATION_TREND(params),
    queryFn: () => reportsApi.getResourceUtilizationTrend(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

// Same contract as useResourceUtilizationTrend above.
export const useServicePOHoursBudget = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_SERVICE_PO_HOURS_BUDGET(params),
    queryFn: () => reportsApi.getServicePOHoursBudget(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

// Backend requires exactly one date mode: {month, year} XOR {startDate, endDate}.
export const useEmployeeBenchPercentage = (params) => {
  const hasMonthYear = !!(params?.month && params?.year);
  const hasDateRange = !!(params?.startDate && params?.endDate);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_EMPLOYEE_BENCH_PERCENTAGE(params),
    queryFn: () => reportsApi.getEmployeeBenchPercentage(params),
    enabled: hasMonthYear !== hasDateRange,
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });
};

export const useEmployeeWorkLogHoursSummary = (params) => {
  const hasDate = !!params?.date;
  const hasMonthYear = !!(params?.month && params?.year);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY(params),
    queryFn: () => reportsApi.getEmployeeWorkLogHoursSummary(params),
    enabled: hasDate || hasMonthYear,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

export const useEmployeeWorkLogHoursSummaryDetails = (employeeId, params, isModalOpen = true) => {
  const hasDate = !!params?.date;
  const hasMonthYear = !!(params?.month && params?.year);
  return useQuery({
    queryKey: QUERY_KEYS.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY_DETAILS(employeeId, params),
    queryFn: () => reportsApi.getEmployeeWorkLogHoursSummaryDetails(employeeId, params),
    enabled: !!employeeId && isModalOpen && (hasDate || hasMonthYear),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
};

