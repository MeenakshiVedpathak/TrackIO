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
  // "Resource Monthly Utilization" (§ new report, 2026-09) — NOT the same screen as
  // getMonthlyResourceUtilization above (that one is the dynamic-service-category "Excel-style"
  // report) or getResourceProjectUtilization (per-project hours breakdown). This one is a flat,
  // fixed-column billable/non-billable/overall utilization % per employee per month. Its own
  // endpoint, own page, own hook — none of the other two are touched by this addition.
  getResourceMonthlyUtilization: (params) => getReport('/reports/resource-monthly-utilization', params),

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
  // BU-wise Utilisation / Employee x Project Utilisation — same envelope/period/multi-select-id
  // conventions as every other report above, via the shared getReport helper.
  getBuWiseUtilisation: (params) => getReport('/reports/bu-wise-utilisation', params),
  getEmployeeProjectUtilisation: (params) => getReport('/reports/employee-project-utilisation', params),
  // Backend-generated Excel of EVERY row matching the current filters (not just the current page) —
  // same blob/Content-Disposition pattern as exportEmployeeRoleBuMapping. The caller strips page/limit.
  exportBuWiseUtilisation: async (params) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/bu-wise-utilisation', {
      params: { ...query, format: 'excel' },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    return { blob: res.data, filename: match?.[1] ?? 'BU_wise_Utilisation.xlsx' };
  },
  // Backend-generated Excel of EVERY row matching the current filters (not just the current page) —
  // same blob/Content-Disposition pattern as exportEmployeeRoleBuMapping. The caller strips page/limit.
  exportEmployeeProjectUtilisation: async (params) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/employee-project-utilisation', {
      params: { ...query, format: 'excel' },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    return { blob: res.data, filename: match?.[1] ?? 'Employee_Project_Utilisation.xlsx' };
  },
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

  // Management Reports — PM-wise / Project-wise Utilization + Month/Resource-wise Bench (§ new
  // report suite 4). All server-paginated and server-sorted like getResourceUtilizationTrend
  // above — page/limit/sortBy/sortOrder go straight through as query params, no special handling
  // needed here.
  getPmWiseUtilization: (params) => getReport('/reports/pm-wise-utilization', params),
  getProjectWiseUtilization: (params) => getReport('/reports/project-wise-utilization', params),
  // Small, fixed-size result (one row per calendar month in the selected range) — not paginated.
  getMonthWiseBench: (params) => getReport('/reports/month-wise-bench', params),
  // Its own report page (ResourceWiseBenchReport.jsx) — server-paginated and server-sorted.
  getResourceWiseBench: (params) => getReport('/reports/resource-wise-bench', params),

  // Resource Cost / Utilization Report (§ new report, 2026-09) — per-employee, per-month
  // Hours/Logged Hrs/Projection %/Actual %/Contribution across a month range, with dynamic
  // month-group columns (data.records[]/data.summary[]/data.period). Confirmed contract.
  getResourceCostUtilization: (params) => getReport('/reports/resource-cost-utilization', params),
  // Same query params as above (page/limit have no effect — always the full filtered set).
  // Returns a real .xlsx binary with merged month headers and frozen static columns already
  // built in server-side, so this is a pure file download, not a client-side sheet build.
  exportResourceCostUtilization: async (params) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/resource-cost-utilization/export', {
      params: query,
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    const filename = match?.[1] ?? 'Resource_Cost_Utilization_Report.xlsx';
    return { blob: res.data, filename };
  },

  // Project-Wise Timesheet Report (§ new report, 2026-09-26) — employee-wise, day-wise timesheet
  // entries with work description, for monthly project review, effort validation, client billing
  // and management reporting. Scoping is via the `entity_ids`/`business_unit_ids` query params
  // the page sends explicitly (not the navbar's active BU header) — routed through getReport so
  // it drops X-Company-Id the same way every other multi-select report does; confirmed live that
  // going through a bare apiClient.get() here inherited the active BU header instead and silently
  // scoped every result down to just that one BU (0 rows instead of the full filtered set).
  getProjectTimesheet: (params) => getReport('/reports/project-timesheet', params),
  // Cross-BU Employee & PO Hours — one row per Employee + Service PO + Activity + month. `buId`
  // rides the same pseudo-param convention as every report above (dropped from the query string,
  // turned into BU scope instead); the two REAL BU axes here (employee_bu_ids/employee_sub_bu_ids
  // and po_bu_ids) are independent filters the page sends as plain query params, never merged.
  getCrossBuEmployeePoHours: (params) => getReport('/reports/cross-bu-employee-po-hours', params),
  // Same endpoint, `?format=excel` — not a separate `/export` path, same convention as
  // downloadProjectTimesheet below (the backend returns every matching row for the current
  // filters, not just the current page, so the caller strips page/limit first).
  downloadCrossBuEmployeePoHours: async (params) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/cross-bu-employee-po-hours', {
      params: { ...query, format: 'excel' },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    const filename = match?.[1] ?? 'Cross_BU_Employee_PO_Hours.xlsx';
    return { blob: res.data, filename };
  },
  // `format` always overrides to 'excel'/'csv' and reads back a real file, same
  // Content-Disposition filename pattern as exportResourceCostUtilization above. Manual header
  // handling (not getReport, which only returns `.data` for JSON) but the same BU-scope pseudo-
  // param handling: `buId` rides inside `params` (see the page's own params builder) purely to
  // reach this pull-out, never as a real query-string field.
  downloadProjectTimesheet: async (params, format) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/project-timesheet', {
      params: { ...query, format },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    const ext = format === 'csv' ? 'csv' : 'xlsx';
    const filename = match?.[1] ?? `project-timesheet.${ext}`;
    return { blob: res.data, filename };
  },

  // Employee Role & Organization Mapping (§ new report, 2026) — one row per employee with their
  // roles/BUs/Sub-BUs already comma-separated by the backend. Routed through getReport like every
  // other multi-select report so entityIds/buIds/subBuIds/roleIds narrow the result instead of the
  // navbar's active BU (see getReport's own comment above for why `buId` always rides as 'all').
  getEmployeeRoleBuMapping: (params) => getReport('/reports/employee-role-bu-mapping', params),
  // Same URL, `format: 'excel'` appended and read back as a blob — same pattern as
  // downloadProjectTimesheet above, not a separate /export path. The backend exports every
  // matching row for the current filters, not just the current page, so page/limit are stripped
  // by the caller before this is invoked (see the report page's handleExport).
  exportEmployeeRoleBuMapping: async (params) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/employee-role-bu-mapping', {
      params: { ...query, format: 'excel' },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    const filename = match?.[1] ?? 'Employee_Role_BU_Mapping_Report.xlsx';
    return { blob: res.data, filename };
  },
  // Team Lead's own view of the work-log entries of every Employee mapped to them as
  // Primary/Secondary manager — the backend resolves "which Team Lead" from the login itself,
  // never from a param, so this never sends one. Real server-side pagination/sorting/filtering,
  // same as every field `params` carries (see TeamLeadEmployeeProjectHours.jsx's own comment).
  getTeamLeadEmployeeProjectHours: (params) => getReport('/reports/team-lead-employee-project-hours', params),
  // Dropdown option lists (Employee/Client/Project/SPO/BU/Sub-BU) for the same report — scoped to
  // the caller's own mapped Employees, same as the report itself. Only period params matter here;
  // the rest of the report's filters don't narrow this call.
  getTeamLeadEmployeeProjectHoursFilterOptions: (params) => getReport('/reports/team-lead-employee-project-hours/filter-options', params),
  // Backend-generated export of every row matching the current filters, not just the current
  // page — the report's own endpoint caps `limit` at 100, so a client-side "fetch everything with
  // one huge limit" export (the trick some other reports use) isn't possible here; this needs its
  // own endpoint. Same blob/Content-Disposition pattern as downloadProjectTimesheet above. `page`/
  // `limit` are stripped by the caller before this is invoked (see the report page's handleExport),
  // same convention exportEmployeeRoleBuMapping/downloadProjectTimesheet already use.
  exportTeamLeadEmployeeProjectHours: async (params) => {
    const { buId, ...query } = params;
    const res = await apiClient.get('/reports/team-lead-employee-project-hours/export', {
      params: { ...query, format: 'excel' },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    const filename = match?.[1] ?? 'Team_Lead_Employee_Project_Hours.xlsx';
    return { blob: res.data, filename };
  },
};
