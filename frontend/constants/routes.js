export const ROUTES = {
  // Auth — a real route per screen (not just steps in one page): the Forgot Password flow's
  // state (email/otp/timers) needs "refresh/back-button/direct-URL -> Email screen" semantics,
  // which only make sense with separate URLs to refresh/navigate/back into.
  LOGIN: '/login',
  // Popup redirect target for Microsoft SSO (loginPopup) — must match VITE_MICROSOFT_REDIRECT_URI
  // and the Entra App Registration's SPA redirect URI. Rendered inside the MSAL popup window
  // only; not part of AuthLayout since it must never redirect based on the opener's auth state.
  MICROSOFT_CALLBACK: '/auth/microsoft/callback',
  FORGOT_PASSWORD: '/forgot-password',
  FORGOT_PASSWORD_OTP: '/forgot-password/verify-otp',
  FORGOT_PASSWORD_RESET: '/forgot-password/reset-password',

  // Core
  DASHBOARD: '/',
  AI_INSIGHTS: '/ai-insights',

  // Employee self-service (dynamic login)
  EMPLOYEE_DASHBOARD: '/employee/dashboard',
  EMPLOYEE_TIMESHEET: '/employee/timesheet',
  EMPLOYEE_TIME_ENTRY: '/employee/time-entry',
  EMPLOYEE_MONTHLY_SUMMARY: '/employee/monthly-summary',
  EMPLOYEE_REPORTS: '/employee/reports',
  // Hub page (category-browser, same layout as admin ReportsCenter) — the individual report
  // routes above remain their destinations; this is just the landing/navigation layer.
  EMPLOYEE_REPORTS_CENTER: '/employee/reports-center',
  EMPLOYEE_PROJECT_HOURS_REPORT: '/employee/project-hours-report',
  EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT: '/employee/timesheet-approval-status-report',
  EMPLOYEE_WORK_LOG_TIME_REPORT: '/employee/work-log-time-report',
  // Work Log Rejection Workflow (2026-08-23), Employee side — entries a Manager rejected.
  EMPLOYEE_REJECTED_ENTRIES: '/employee/rejected-entries',

  // AI Copilot — new pages added on top of the existing app, reachable from the
  // floating AI Copilot widget's launcher rather than the RBAC-driven sidebar
  // (see components/ai/AICopilotHub.jsx for why).
  AI_ROOT_CAUSE: '/ai/root-cause',
  AI_EXECUTIVE_REPORT: '/ai/executive-report',
  AI_FORECAST: '/ai/forecast',
  AI_RECOMMENDATIONS: '/ai/recommendations',
  AI_WHAT_IF: '/ai/what-if',
  AI_PROJECT_HEALTH: '/ai/project-health',
  EMPLOYEE_AI_PROFILE: '/employees/:id/ai-profile',

  // People
  EMPLOYEES: '/employees',
  EMPLOYEE_NEW: '/employees/new',
  EMPLOYEE_EDIT: '/employees/:id/edit',

  ROLES: '/roles',
  ROLE_NEW: '/roles/new',
  ROLE_EDIT: '/roles/:id/edit',

  FORMS: '/forms',
  FORM_NEW: '/forms/new',
  FORM_EDIT: '/forms/:id/edit',

  // Form Categories — sub-screen of Form Master, reached via its "Manage Categories" button
  FORM_CATEGORIES: '/forms/categories',
  FORM_CATEGORY_NEW: '/forms/categories/new',
  FORM_CATEGORY_EDIT: '/forms/categories/:id/edit',

  // Role-Form Mapping is a per-row action on the Roles page, not its own menu item
  ROLE_FORM_MAPPING_EDIT: '/roles/:roleId/forms',

  // Admin management (Platform Admin only, §6.1)
  ADMINS: '/admins',
  ADMIN_NEW: '/admins/new',

  // Organization Overview — Platform Admin only, single read-only screen (Entity/BU/Project/
  // Service PO/User overview across the whole platform, tabbed — see pages/organizationOverview)
  ORGANIZATION_OVERVIEW: '/platform-admin/organization-overview',

  // Entity Admin management (Admin tier, platform-wide, §6.2)
  ENTITY_ADMINS: '/entity-admins',
  ENTITY_ADMIN_NEW: '/entity-admins/new',

  // Entity Master (Admin / Entity Admin)
  ENTITIES: '/entities',
  ENTITY_NEW: '/entities/new',
  ENTITY_EDIT: '/entities/:id/edit',

  // BU Head Master (Admin / Entity Admin) — additive peer of BU Admin Master, §24
  BU_HEADS: '/bu-heads',

  // Company Management — Admin (platform-wide) or Entity Admin (own Entities), §6.3
  COMPANIES: '/companies',
  COMPANY_NEW: '/companies/new',
  COMPANY_EDIT: '/companies/:id/edit',

  // Business
  CLIENTS: '/clients',
  CLIENT_NEW: '/clients/new',
  CLIENT_EDIT: '/clients/:id/edit',

  PROJECTS: '/projects',
  PROJECT_NEW: '/projects/new',
  PROJECT_EDIT: '/projects/:id/edit',

  SERVICE_POS: '/service-pos',
  SERVICE_PO_NEW: '/service-pos/new',
  SERVICE_PO_DETAIL: '/service-pos/:id',
  SERVICE_PO_EDIT: '/service-pos/:id/edit',
  SERVICE_PO_IMPORT: '/service-pos/import',
  SERVICE_PO_MAP_EMPLOYEES: '/service-pos/:id/map-employees',

  SUB_PROJECTS: '/sub-projects',
  SUB_PROJECT_NEW: '/sub-projects/new',
  SUB_PROJECT_EDIT: '/sub-projects/:id/edit',

  SERVICE_TYPES: '/service-types',
  SERVICE_TYPE_NEW: '/service-types/new',
  SERVICE_TYPE_EDIT: '/service-types/:id/edit',

  SERVICE_CATEGORIES: '/service-categories',
  SERVICE_CATEGORY_NEW: '/service-categories/new',
  SERVICE_CATEGORY_EDIT: '/service-categories/:id/edit',

  // Resources
  RESOURCE_ALLOCATION: '/resource-allocation',
  TIMESHEETS: '/timesheets',
  TIMESHEET_UPLOAD: '/timesheets/upload',
  TIMESHEET_IMPORT_DETAIL: '/timesheets/import/:id',
  MONTHLY_COSTS: '/monthly-costs',
  MONTHLY_COST_IMPORT: '/monthly-costs/import',
  MONTHLY_COST_DETAIL: '/monthly-costs/:month/:year',
  MONTHLY_COST_NEW: '/monthly-costs/:month/:year/new',
  MONTHLY_COST_EDIT: '/monthly-costs/:month/:year/:id/edit',

  // Analytics
  REPORTS: '/reports',
  REPORT_RESOURCE_ALLOCATION: '/reports/resource-allocation',
  REPORT_SERVICE_PO_RESOURCE: '/reports/service-po-resource',
  REPORT_SERVICE_PO_SUMMARY: '/reports/service-po-summary',
  REPORT_INVOICE_PO_SUMMARY: '/reports/invoice-po-summary',
  REPORT_MONTHLY_RESOURCE_UTILIZATION: '/reports/monthly-resource-utilization',
  REPORT_EMPLOYEE_UTILIZATION_SUMMARY: '/reports/employee-utilization-summary',
  REPORT_RESOURCE_PROJECT_UTILIZATION: '/reports/resource-project-utilization',
  REPORT_CLIENT_SERVICE_PO_HOURS: '/reports/client-service-po-hours',
  REPORT_SERVICE_PO_PROFITABILITY: '/reports/service-po-profitability',
  REPORT_BUDGETED_MARGIN_FORECAST: '/reports/budgeted-margin-forecast',
  REPORT_RESOURCE_STAFFING_PLAN_ACCURACY: '/reports/resource-staffing-plan-accuracy',
  REPORT_CLIENT_PROFITABILITY_CONCENTRATION: '/reports/client-profitability-concentration',
  REPORT_BU_PERFORMANCE_SCORECARD: '/reports/bu-performance-scorecard',
  REPORT_EMPLOYEE_CAPACITY_FORECAST: '/reports/employee-capacity-forecast',
  REPORT_SERVICE_PO_TIMELINE_RISK: '/reports/service-po-timeline-risk',
  REPORT_DELIVERY_HEAD_PERFORMANCE: '/reports/delivery-head-performance',
  REPORT_INVOICE_REALIZATION_TREND: '/reports/invoice-realization-trend',
  REPORT_SERVICE_LINE_BUSINESS_MIX: '/reports/service-line-business-mix',
  REPORT_BUDGET_VS_BILLED: '/reports/budget-vs-billed',
  REPORT_CLIENT_COST_ANALYTICS: '/reports/client-cost-analytics',
  REPORT_CLIENT_WISE_ANALYTICS: '/reports/client-wise-analytics',
  REPORT_MONTHLY_HOURS_TREND: '/reports/monthly-hours-trend',
  REPORT_EMPLOYEE_BENCH_PERCENTAGE: '/reports/employee-bench-percentage',
  REPORT_RESOURCE_UTILIZATION_TREND: '/reports/resource-utilization-trend',
  REPORT_SERVICE_PO_HOURS_BUDGET: '/reports/service-po-hours-budget',
  REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY: '/reports/employee-work-log-hours-summary',
  REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE: '/reports/employee-work-log-compliance',

  // Team Mapping — Service PO Admin self-service (§7)
  TEAM_MAPPINGS: '/team-mappings',

  // My Team — Manager self-service (§8)
  MY_TEAM: '/my-team',

  // Service PO Monthly Budget — Manager self-service, net-new (Service PO Manager screen)
  SERVICE_PO_MONTHLY_BUDGET: '/service-po-monthly-budget',

  // Timesheet Approval — Manager self-service, net-new; split off from My Work Log into its
  // own screen (2026-08-23) so approving a team's timesheets no longer lives behind the
  // employee selector on the work-log page.
  MANAGER_TIMESHEET_APPROVAL: '/manager/timesheet-approval',

  // Cost Budget / Resource Budget — net-new, per Service PO + month
  COST_BUDGETS: '/cost-budgets',
  RESOURCE_BUDGETS: '/resource-budgets',

  // Settings
  NOTIFICATIONS: '/notifications',
  SETTINGS: '/settings',

  // Error
  NOT_FOUND: '*',
  NOT_AUTHORIZED: '/not-authorized',
};

export const buildPath = (route, params = {}) => {
  let path = route;
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`:${key}`, value);
  });
  return path;
};
