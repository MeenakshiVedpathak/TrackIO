export const QUERY_KEYS = {
  // Auth
  AUTH_PROFILE: ['auth', 'profile'],

  // Dashboard
  DASHBOARD_STATS: (params) => ['dashboard', 'stats', params],
  DASHBOARD_EMPLOYEE_BILLABLE: (params) => ['dashboard', 'employee-billable-breakdown', params],
  DASHBOARD_TOP_EMPLOYEES_BY_PO: (params) => ['dashboard', 'top-employees-by-po', params],

  // AI Insights
  AI_INSIGHTS: (params) => ['ai-insights', params],

  // Employees
  EMPLOYEES: (params) => ['employees', params],
  EMPLOYEES_ACTIVE: ['employees', 'active'],
  ELIGIBLE_DELIVERY_HEADS: ['employees', 'eligible-delivery-heads'],
  ELIGIBLE_MANAGERS: ['employees', 'eligible-managers'],
  EMPLOYEE: (id) => ['employees', id],
  EMPLOYEE_MAPPINGS: (id) => ['employees', id, 'mappings'],

  // Roles
  ROLES: (params) => ['roles', params],
  ROLE: (id) => ['roles', id],
  ACCESSIBLE_FORMS: (roleIds) => ['roles', 'forms', [...roleIds].sort()],
  ROLE_FORM_MAPPINGS: (roleId) => ['roles', 'form-mappings', roleId],

  // Forms (Form Master)
  FORMS: (params) => ['forms', params],
  FORM: (id) => ['forms', id],
  FORM_MODULES: (params) => ['forms', 'modules', params],
  FORM_HIERARCHY: ['forms', 'hierarchy'],
  FORM_CATEGORIES: (params) => ['forms', 'categories', params],
  FORM_CATEGORY: (id) => ['forms', 'categories', id],

  // Clients
  CLIENTS: (params) => ['clients', params],
  CLIENTS_ACTIVE: ['clients', 'active'],
  CLIENT: (id) => ['clients', id],

  // Projects
  PROJECTS: (params) => ['projects', params],
  PROJECTS_ACTIVE: ['projects', 'active'],
  PROJECTS_BY_CLIENT: (clientId) => ['projects', 'by-client', clientId],
  PROJECT: (id) => ['projects', id],

  // Team Mapping (Service PO Admin self-service)
  TEAM_MAPPINGS: ['team-mappings'],
  TEAM_MAPPING_AVAILABLE_MANAGERS: ['team-mappings', 'available-managers'],
  TEAM_MAPPING_SERVICE_PO_GRANTS: ['team-mappings', 'service-po-grants'],

  // My Team (Manager self-service)
  MY_TEAM_EMPLOYEES: ['my-team', 'employees'],
  MY_TEAM_SERVICE_POS: ['my-team', 'service-pos'],
  MY_TEAM_APPROVAL_SUMMARY: (params) => ['my-team', 'approval-summary', params],

  // Admins (Platform Admin -> Admin)
  ADMINS: (params) => ['admins', params],

  // Organization Overview (Platform Admin only — one API, all tabs read from this one cache entry)
  ORGANIZATION_OVERVIEW: ['organization-overview'],

  // Entity Admins (Admin tier)
  ENTITY_ADMINS: (params) => ['entity-admins', params],
  ENTITY_ADMIN: (id) => ['entity-admins', id],

  // Companies — now Entity Admin scoped
  COMPANIES: (params) => ['companies', params],
  COMPANY: (id) => ['companies', id],

  // Entities (Entity Admin tier)
  ENTITIES: (params) => ['entities', params],
  ENTITIES_ACTIVE: ['entities', 'active'],
  ENTITY: (id) => ['entities', id],

  // BU Heads (Admin / Entity Admin tier) — additive peer of BU Admin
  BU_HEADS: (params) => ['bu-heads', params],
  BU_HEAD: (id) => ['bu-heads', id],
  BU_HEAD_MAPPED_BUS: (id) => ['bu-heads', id, 'mapped-bus'],

  // Service POs
  SERVICE_POS: (params) => ['service-pos', params],
  // `buId` is optional — undefined for the cross-BU callers that make up most of the app (they
  // all share one cache entry), a BU id only for screens that narrow the picker to one BU first
  // (Cost Budget, Resource Budget). Still under the 'service-pos' prefix every mutation
  // invalidates.
  SERVICE_POS_ACTIVE: (buId) => ['service-pos', 'active', buId],
  SERVICE_PO: (id) => ['service-pos', id],
  SERVICE_PO_UTILISATION: (id) => ['service-pos', id, 'utilisation'],
  SERVICE_PO_HIERARCHY: (id) => ['service-pos', id, 'hierarchy'],

  // Sub-Projects
  SUB_PROJECTS: (params) => ['sub-projects', params],
  SUB_PROJECTS_BY_PO: (poId) => ['sub-projects', 'by-po', poId],
  SUB_PROJECT: (id) => ['sub-projects', id],

  // Service Types
  SERVICE_TYPES: (params) => ['service-types', params],
  SERVICE_TYPE: (id) => ['service-types', id],

  // Service Categories
  SERVICE_CATEGORIES: (params) => ['service-categories', params],
  SERVICE_CATEGORY: (id) => ['service-categories', id],

  // Monthly Costs
  MONTHLY_COSTS: (params) => ['monthly-costs', params],
  MONTHLY_COST: (id) => ['monthly-costs', id],

  // Service PO Monthly Budget ("Monthly PO Reporting" in the UI, was "Invoice Master")
  SERVICE_PO_MONTHLY_BUDGET_SERVICE_POS: (buId) => ['service-po-monthly-budget', 'service-pos', buId],
  // `buId` is the page's own Business Unit filter (undefined for a single-BU login, which keeps
  // following the global header). It MUST stay in the key: the month grid and the 12-month
  // summary strip share these cache entries, so without it a BU switch would serve the previous
  // BU's records to both.
  SERVICE_PO_MONTHLY_BUDGET_LIST: (month, year, buId) => ['service-po-monthly-budget', 'list', month, year, buId],
  // `buId` — see SERVICE_PO_MONTHLY_BUDGET_LIST above: must stay in the key so a BU switch never
  // serves a different BU's cached record for the same PO/month/year.
  SERVICE_PO_MONTHLY_BUDGET_RECORD: (servicePoId, month, year, buId) =>
    ['service-po-monthly-budget', 'record', servicePoId, month, year, buId],

  // Cost Budget
  COST_BUDGETS: (params) => ['cost-budgets', params],
  COST_BUDGETS_BY_SERVICE_PO: (servicePoId) => ['cost-budgets', 'service-po', servicePoId],

  // Resource Budget
  RESOURCE_BUDGET_MAPPED_EMPLOYEES: (servicePoId) => ['resource-budgets', 'mapped-employees', servicePoId],
  RESOURCE_BUDGETS_BY_SERVICE_PO: (servicePoId) => ['resource-budgets', 'service-po', servicePoId],
  RESOURCE_BUDGETS: (params) => ['resource-budgets', params],

  // Timesheets
  TIMESHEETS: (params) => ['timesheets', params],
  TIMESHEET: (id) => ['timesheets', id],
  TIMESHEET_IMPORT_HISTORY: (params) => ['timesheets', 'import', 'history', params],
  TIMESHEET_IMPORT: (id) => ['timesheets', 'import', id],
  TIMESHEET_IMPORT_ROWS: (id) => ['timesheets', 'import', id, 'rows'],

  // Reports
  REPORT_MONTHLY_COST_SUMMARY: (params) => ['reports', 'monthly-cost-summary', params],
  REPORT_RESOURCE_ALLOCATION: (params) => ['reports', 'resource-allocation', params],
  REPORT_RESOURCE_ALLOCATION_ALL_ROWS: (params) => ['reports', 'resource-allocation-all-rows', params],
  REPORT_SERVICE_PO_RESOURCE: (params) => ['reports', 'service-po-resource', params],
  REPORT_SERVICE_PO_SUMMARY: (params) => ['reports', 'service-po-summary', params],
  REPORT_SERVICE_PO_SUMMARY_TOTALS: (params) => ['reports', 'service-po-summary-totals', params],
  REPORT_INVOICE_PO_SUMMARY: (params) => ['reports', 'invoice-po-summary', params],
  REPORT_INVOICE_PO_SUMMARY_TOTALS: (params) => ['reports', 'invoice-po-summary-totals', params],
  REPORT_MONTHLY_RESOURCE_UTILIZATION: (params) => ['reports', 'monthly-resource-utilization', params],
  REPORT_EMPLOYEE_UTILIZATION_SUMMARY: (params) => ['reports', 'employee-utilization-summary', params],
  REPORT_EMPLOYEE_UTILIZATION_SUMMARY_TOTALS: (params) => ['reports', 'employee-utilization-summary-totals', params],
  REPORT_RESOURCE_PROJECT_UTILIZATION: (params) => ['reports', 'resource-project-utilization', params],
  REPORT_CLIENT_SERVICE_PO_HOURS: (params) => ['reports', 'client-service-po-hours', params],
  REPORT_SERVICE_PO_PROFITABILITY: (params) => ['reports', 'service-po-profitability', params],
  REPORT_BUDGETED_MARGIN_FORECAST: (params) => ['reports', 'budgeted-margin-forecast', params],
  REPORT_RESOURCE_STAFFING_PLAN_ACCURACY: (params) => ['reports', 'resource-staffing-plan-accuracy', params],
  REPORT_CLIENT_PROFITABILITY_CONCENTRATION: (params) => ['reports', 'client-profitability-concentration', params],
  REPORT_BU_PERFORMANCE_SCORECARD: (params) => ['reports', 'bu-performance-scorecard', params],
  REPORT_EMPLOYEE_CAPACITY_FORECAST: (params) => ['reports', 'employee-capacity-forecast', params],
  REPORT_SERVICE_PO_TIMELINE_RISK: (params) => ['reports', 'service-po-timeline-risk', params],
  REPORT_DELIVERY_HEAD_PERFORMANCE: (params) => ['reports', 'delivery-head-performance', params],
  REPORT_INVOICE_REALIZATION_TREND: (params) => ['reports', 'invoice-realization-trend', params],
  REPORT_SERVICE_LINE_BUSINESS_MIX: (params) => ['reports', 'service-line-business-mix', params],
  REPORT_BUDGET_VS_BILLED: (params) => ['reports', 'budget-vs-billed', params],
  REPORT_CLIENT_COST_ANALYTICS: (params) => ['reports', 'client-cost-analytics', params],
  REPORT_CLIENT_WISE_ANALYTICS: (params) => ['reports', 'client-wise-analytics', params],
  REPORT_MONTHLY_HOURS_TREND: (params) => ['reports', 'monthly-hours-trend', params],
  REPORT_EMPLOYEE_BENCH_PERCENTAGE: (params) => ['reports', 'employee-bench-percentage', params],
  REPORT_RESOURCE_UTILIZATION_TREND: (params) => ['reports', 'resource-utilization-trend', params],
  REPORT_SERVICE_PO_HOURS_BUDGET: (params) => ['reports', 'service-po-hours-budget', params],
  REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY: (params) => ['reports', 'employee-work-log-hours-summary', params],
  REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY_DETAILS: (employeeId, params) => ['reports', 'employee-work-log-hours-summary', employeeId, 'details', params],

  // Notifications
  NOTIFICATIONS: (params) => ['notifications', params],

  // Employee self-service Work Log (draft/synced two-stage model)
  EMPLOYEE_WORKLOG_CALENDAR: (month, year) => ['employee-worklog', 'calendar', month, year],
  EMPLOYEE_WORKLOG_DAILY: (date) => ['employee-worklog', 'daily', date],
  EMPLOYEE_WORKLOG_MONTHLY_SUMMARY: (month, year, viewType = 'day') => ['employee-worklog', 'monthly-summary', month, year, viewType],
  EMPLOYEE_WORKLOG_MONTHLY: (month, year) => ['employee-worklog', 'monthly', month, year],
  EMPLOYEE_WORKLOG_ENTRIES: (params) => ['employee-worklog', 'entries', params],
  EMPLOYEE_PROJECTS: ['employee-worklog', 'projects'],

  // Employee <-> Service PO mapping (Admin-side, backs the Project dropdown above)
  EMPLOYEE_SERVICEPO_MAPPING_BY_EMPLOYEE: (employeeId) => ['employee-servicepo-mapping', 'employee', employeeId],
  EMPLOYEE_SERVICEPO_MAPPING_BY_SERVICE_PO: (servicePOId) => ['employee-servicepo-mapping', 'service-po', servicePOId],
  EMPLOYEE_SERVICEPO_MAPPING_OPTIONS: (employeeId) => ['employee-servicepo-mapping', 'options', employeeId],
  // Service PO → Map Employees' left panel. `search` and `businessUnitId` are part of the key
  // because both are applied server-side — a new value is a different paged result set, not a
  // client-side filter of this one. Prefix-matched by ['employee-servicepo-mapping'], so the
  // existing map/unmap invalidations reach it and the panel's mapped_employee_ids refresh after a save.
  EMPLOYEE_SERVICEPO_MAPPING_SERVICE_PO_OPTIONS: (servicePOId, search, businessUnitId) =>
    ['employee-servicepo-mapping', 'service-po', servicePOId, 'options', search ?? '', businessUnitId ?? ''],
  // Map Employees' Entity → BU filter bar — same for every Service PO the caller can open this
  // screen for, so no servicePOId in the key.
  EMPLOYEE_SERVICEPO_MAPPING_FILTER_OPTIONS: ['employee-servicepo-mapping', 'filter-options'],

  // Employee Reports
  EMPLOYEE_REPORT_DAILY: (date) => ['employee-report', 'daily', date],
  EMPLOYEE_REPORT_MONTHLY: (month, year) => ['employee-report', 'monthly', month, year],
  EMPLOYEE_REPORT_RANGE: (startDate, endDate) => ['employee-report', 'range', startDate, endDate],
  EMPLOYEE_REPORT_WORK_LOG_TIME: (params) => ['employee-report', 'work-log-time', params],

  // Employee Project Hours Report
  EMPLOYEE_PROJECT_HOURS_FILTER_TREE: ['employee-project-hours-report', 'filter-tree'],
  EMPLOYEE_PROJECT_HOURS_REPORT: (params) => ['employee-project-hours-report', 'report', params],

  // Timesheet Approval Status Report (Employee sees own, Manager sees mapped team — one endpoint)
  TIMESHEET_APPROVAL_STATUS_REPORT: (params) => ['timesheet-approval-status-report', params],
};
