// ⚠️ GUESSED MAPPING — CONFIRM WITH BACKEND/ADMIN ⚠️
//
// The backend's Form Master only knows a form's `form_name` string (see POST /roles/forms
// response, e.g. { "Dashboard": [{ id, name: "Analytics Dashboard" }] }). It has no concept
// of a frontend route. Until the real Form Master rows exist, the `name` values below are
// GUESSES based on this app's current page titles/sidebar labels — they are almost certainly
// not identical to what a Management user will actually type into the new Form Master screen.
//
// The lookup below is case-insensitive/trimmed to reduce accidental breakage, but the key
// strings themselves still need to match whatever `form_name` values get seeded/entered.
// Any accessible-forms entry with no match here is dropped from the sidebar (see Sidebar.jsx)
// and logged via console.warn so mismatches are visible during rollout instead of silently
// wrong.
import {
  LayoutDashboard, Users, Shield, Building2,
  FileText, FolderOpen, FolderKanban, Clock, DollarSign,
  Tag, Layers, Sparkles, ClipboardList, Landmark, ShieldCheck,
  FileBarChart2, PieChart, CalendarRange, UserCheck, Network, Receipt, Table2, Wallet, IndianRupee,
  ListTree, ListChecks, Banknote, CalendarClock, Timer, Hourglass,
  TrendingUp, LineChart, Target, Percent, Award, BatteryCharging, AlertTriangle, Crown,
  ReceiptText, GitCompare, Scale, BarChart3, Building, Activity, Armchair, Users2,
  ClipboardCheck, XCircle, UserCog,
} from 'lucide-react';
import { ROUTES } from '@/constants/routes';

export const FORM_NAMES = {
  DASHBOARD: 'Dashboard',
  AI_INSIGHTS: 'AI Insights',
  EMPLOYEES: 'Employee Master',
  ROLES: 'Roles',
  FORMS: 'Forms',
  // Not in FORM_ROUTE_CONFIG on purpose — it's a per-row "Manage Forms" action on the Roles
  // page, not its own sidebar item. Kept here only so useHasForm() can gate that action.
  ROLE_FORM_MAPPING: 'Role Form Mapping',
  // Entity Admin tier — these two are the ONLY forms an Entity Admin's login ever returns
  // (module "Entity Management"). Company Management has no form of its own on purpose — it's
  // reached via buttons on these two screens, not a sidebar item (see CompanyList/BuAdminList).
  ENTITY_MASTER: 'Entity Master',
  // Global Entity Admin account pool (§6.2) — previously injected into the Sidebar directly
  // off hasRole('Admin') rather than resolved from accessibleForms; now needs a real Form
  // Master row named exactly this, assigned to the Admin role via Role Form Mapping.
  ENTITY_ADMINS: 'Entity Admins',
  BU_ADMIN_MASTER: 'BU Master',
  // Additive BU Head role form — real Form Master row confirmed seeded under "Entity
  // Management"; nav item now comes entirely from accessibleForms (no Sidebar.jsx injection).
  BU_HEAD_MASTER: 'BU Head Master',
  CLIENTS: 'Client Master',
  // Matches the actual Form Master row name ("Project Master"), not the page's own title.
  PROJECTS: 'Project Master',
  SERVICE_POS: 'Service PO Master',
  SUB_PROJECTS: 'Sub-Projects',
  SERVICE_TYPES: 'Service Types',
  SERVICE_CATEGORIES: 'Service Categories',
  TIMESHEETS: 'Timesheets',
  MONTHLY_COSTS: 'Monthly Costs',
  REPORT_PO_VS_RESOURCE: 'PO vs Resource',
  REPORT_SERVICE_PO_SUMMARY: 'Service PO Summary',
  REPORT_INVOICE_PO_SUMMARY: 'Invoice PO Summary',
  REPORT_MONTHLY_UTILIZATION: 'Monthly Utilization',
  // Guessed name — same caveat as this file's header comment; confirm against the actual Form
  // Master row once one is seeded for this new report (backend GET /reports/employee-utilization-
  // summary already exists and is tested — only the Form Master row + Role Form Mapping grant are
  // missing, which is an admin action via the Forms/Role Form Mapping screens, not a code change).
  REPORT_EMPLOYEE_UTILIZATION_SUMMARY: 'Employee Utilization Summary',
  REPORT_RESOURCE_ALLOCATION: 'Resource Allocation',
  REPORT_RESOURCE_PROJECT_UTILIZATION: 'Resource Project Utilization',
  // Matches the backend's actual Form Master row name (confirmed via GET /roles/forms), not
  // the report's own page title.
  REPORT_CLIENT_SERVICE_PO_HOURS: 'Client × Service PO',
  // Employee self-service (§ RBAC mapping migration) — previously static/hardcoded
  // (EmployeeSidebar + `employeeOnly`), now driven by Form Master + Role-Form Mapping like
  // every other screen. "Employee Dashboard" (not "Dashboard") on purpose — that name is
  // already taken by the admin-side Dashboard form and this lookup is a flat, name-keyed map;
  // reusing "Dashboard" here would collide and resolve to the wrong route.
  EMPLOYEE_DASHBOARD: 'Employee Dashboard',
  EMPLOYEE_WORK_LOG: 'My Work Log',
  // Guessed name — same caveat as the rest of this file's Employee self-service entries; confirm
  // against the actual Form Master row once one is seeded. Brand-new screen (frontend brief
  // dated 2026-08-23) that split off "My Work Log"'s old exact-time toggle into its own form —
  // see pages/employee/EmployeeTimeEntry.jsx.
  EMPLOYEE_TIME_ENTRY: 'Time Entry',
  EMPLOYEE_MONTHLY_SUMMARY: 'Monthly Summary',
  EMPLOYEE_REPORTS: 'PO Wise Report',
  // Hub page — a category-browser landing page for all employee-side reports, mirroring the
  // admin ReportsCenter. Needs a real Form Master row named exactly this and mapped to the
  // Employee role via Role Form Mapping (guessed name — confirm once seeded).
  EMPLOYEE_REPORTS_CENTER: 'Employee Reports Center',
  // Guessed name — same caveat as the rest of this file's Employee self-service entries; confirm
  // against the actual Form Master row once one is seeded for this new report.
  EMPLOYEE_PROJECT_HOURS_REPORT: 'Project Hours Report',
  // Guessed name — same caveat as the rest of this file's Employee self-service entries; confirm
  // against the actual Form Master row once one is seeded for this new report. Shared by both
  // Employee and Manager logins (single endpoint auto-resolves "own" vs "team" data), so whichever
  // role(s) this form gets mapped to will reach the same page/route.
  EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT: 'Timesheet Approval Status Report',
  // Guessed name — same caveat as the rest of this file's Employee self-service entries; confirm
  // against the actual Form Master row once one is seeded for this new report (backend spec
  // dated 2026-08-20, GET /employee-reports/work-log-time). Shared by both Employee and Manager
  // logins, same as EMPLOYEE_PROJECT_HOURS_REPORT above.
  EMPLOYEE_WORK_LOG_TIME_REPORT: 'Work Log Time Report',
  // Guessed name — same caveat as the rest of this file's Employee self-service entries; confirm
  // against the actual Form Master row once one is seeded. Work Log Rejection Workflow
  // (2026-08-23) — entries a Manager rejected, awaiting Employee edit+resubmit or delete.
  EMPLOYEE_REJECTED_ENTRIES: 'Rejected Entries',
  // Manager Timesheet Access & Approval — the backend's Form Master grants Managers these two
  // Resources-module rows (distinct from the Employee Self-Service "My Work Log" row an Employee
  // gets). "Timesheet" still points at the same EmployeeTimesheet page as "My Work Log" (a
  // Manager logs their own hours the same way an Employee does). "Timesheet Approval" moved
  // (2026-08-23) to its own dedicated screen — see pages/managerTimesheet/ManagerTimesheetApproval.jsx.
  MANAGER_TIMESHEET: 'Timesheet',
  MANAGER_TIMESHEET_APPROVAL: 'Timesheet Approval',
  // Business module, Service PO Admin login (confirmed via GET /roles/forms) — the Form Master
  // row now exists on the backend, so this is picked up automatically by Sidebar's RBAC-driven
  // buildNavGroups() instead of the Manager-only hardcoded injection below.
  SERVICE_PO_MONTHLY_BUDGET: 'Monthly PO Reporting',
  // People module, Manager login (confirmed via GET /roles/forms) — the Form Master row now
  // exists on the backend, so this is picked up automatically by buildNavGroups() instead of
  // the MY_TEAM_ROLES hardcoded injection in Sidebar.jsx.
  MY_TEAM: 'My Team',
  // Business module, Service PO Admin login — previously injected into the Sidebar directly
  // off hasRole('Service PO Admin') rather than resolved from accessibleForms; now needs a
  // real Form Master row named exactly this, assigned via Role Form Mapping.
  TEAM_MAPPING: 'Team Mapping',
  // Guessed names — same caveat as the rest of this file: these two screens are brand new
  // (backend spec dated 2026-08-19, no Form Master rows confirmed yet). Confirm against the
  // real GET /roles/forms response once these are seeded.
  COST_BUDGET: 'Cost Budget',
  RESOURCE_BUDGET: 'Resource Budget',
  // Guessed names — same caveat as the rest of this file: these ten margin/profitability/risk
  // reports are brand new (no Form Master rows confirmed yet). Confirm against the real
  // GET /roles/forms response once seeded. REPORT_BU_PERFORMANCE_SCORECARD in particular should
  // only ever be mapped to the Admin / Entity Admin roles — the backend 403s everyone else.
  REPORT_SERVICE_PO_PROFITABILITY: 'Service PO Profitability',
  REPORT_BUDGETED_MARGIN_FORECAST: 'Budgeted Margin Forecast',
  REPORT_RESOURCE_STAFFING_PLAN_ACCURACY: 'Resource Staffing Plan Accuracy',
  REPORT_CLIENT_PROFITABILITY_CONCENTRATION: 'Client Profitability & Concentration',
  REPORT_BU_PERFORMANCE_SCORECARD: 'BU Performance Scorecard',
  REPORT_EMPLOYEE_CAPACITY_FORECAST: 'Employee Capacity & Bench Forecast',
  REPORT_SERVICE_PO_TIMELINE_RISK: 'Service PO Timeline Risk',
  REPORT_DELIVERY_HEAD_PERFORMANCE: 'Delivery Head Performance',
  REPORT_INVOICE_REALIZATION_TREND: 'Invoice Realization Trend',
  REPORT_SERVICE_LINE_BUSINESS_MIX: 'Service Line Business Mix',
  // Guessed names — same caveat as the rest of this file: these five budget/cost analytics
  // reports are brand new (no Form Master rows confirmed yet). Confirm against the real
  // GET /roles/forms response once seeded.
  REPORT_BUDGET_VS_BILLED: 'Budget vs Billed',
  REPORT_CLIENT_COST_ANALYTICS: 'Client Cost Analytics',
  REPORT_CLIENT_WISE_ANALYTICS: 'Client Wise Analytics',
  REPORT_MONTHLY_HOURS_TREND: 'Monthly Hours Trend',
  REPORT_EMPLOYEE_BENCH_PERCENTAGE: 'Employee Bench Percentage',
  REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY: 'Employee Work Log Hours Summary',
  REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE: 'Employee Work Log Compliance',
  // Same caveat as the block above — guessed names pending real Form Master rows.
  REPORT_RESOURCE_UTILIZATION_TREND: 'Resource Utilization Trend',
  REPORT_SERVICE_PO_HOURS_BUDGET: 'PO Hours & Budget',
};

// form_name (lowercased/trimmed) -> { to, icon, exact, addTo?, addLabel? }. Icons are used by
// the dynamic Sidebar. `addTo` is only set when the module has a real, dedicated Add/Create
// route already used by that list page's own "Add" button (see Sidebar.jsx's quick-add "+") —
// a module whose "Add" opens an in-page Sheet/mutation instead of navigating (e.g. BU Head
// Master, Team Mapping) is deliberately left without one rather than inventing a route.
export const FORM_ROUTE_CONFIG = {
  [FORM_NAMES.DASHBOARD]: { to: ROUTES.DASHBOARD, icon: LayoutDashboard, exact: true },
  [FORM_NAMES.AI_INSIGHTS]: { to: ROUTES.AI_INSIGHTS, icon: Sparkles, exact: true },
  [FORM_NAMES.EMPLOYEES]: { to: ROUTES.EMPLOYEES, icon: Users, addTo: ROUTES.EMPLOYEE_NEW, addLabel: 'Add Employee' },
  [FORM_NAMES.ROLES]: { to: ROUTES.ROLES, icon: Shield, addTo: ROUTES.ROLE_NEW, addLabel: 'Add Role' },
  [FORM_NAMES.FORMS]: { to: ROUTES.FORMS, icon: ClipboardList, addTo: `${ROUTES.FORM_NEW}?type=form`, addLabel: 'Add Form' },
  [FORM_NAMES.ENTITY_MASTER]: { to: ROUTES.ENTITIES, icon: Landmark, addTo: ROUTES.ENTITY_NEW, addLabel: 'Add Entity' },
  [FORM_NAMES.ENTITY_ADMINS]: { to: ROUTES.ENTITY_ADMINS, icon: Landmark, addTo: ROUTES.ENTITY_ADMIN_NEW, addLabel: 'Add Entity Admin' },
  // Points at the Companies screen, not a dedicated BU Admin Master page — see routes/index.jsx.
  // addTo likewise reuses Companies' own "Add BU" route rather than a BU-Admin-specific one.
  [FORM_NAMES.BU_ADMIN_MASTER]: { to: ROUTES.COMPANIES, icon: ShieldCheck, addTo: ROUTES.COMPANY_NEW, addLabel: 'Add BU' },
  [FORM_NAMES.BU_HEAD_MASTER]: { to: ROUTES.BU_HEADS, icon: Users2 },
  [FORM_NAMES.CLIENTS]: { to: ROUTES.CLIENTS, icon: Building2, addTo: ROUTES.CLIENT_NEW, addLabel: 'Add Client' },
  [FORM_NAMES.PROJECTS]: { to: ROUTES.PROJECTS, icon: FolderKanban, addTo: ROUTES.PROJECT_NEW, addLabel: 'Add Project' },
  [FORM_NAMES.SERVICE_POS]: { to: ROUTES.SERVICE_POS, icon: FileText, addTo: ROUTES.SERVICE_PO_NEW, addLabel: 'Add Service PO' },
  [FORM_NAMES.SUB_PROJECTS]: { to: ROUTES.SUB_PROJECTS, icon: FolderOpen, addTo: ROUTES.SUB_PROJECT_NEW, addLabel: 'Add Sub-Project' },
  [FORM_NAMES.SERVICE_TYPES]: { to: ROUTES.SERVICE_TYPES, icon: Layers, addTo: ROUTES.SERVICE_TYPE_NEW, addLabel: 'Add Service Type' },
  [FORM_NAMES.SERVICE_CATEGORIES]: { to: ROUTES.SERVICE_CATEGORIES, icon: Tag, addTo: ROUTES.SERVICE_CATEGORY_NEW, addLabel: 'Add Category' },
  [FORM_NAMES.TIMESHEETS]: { to: ROUTES.TIMESHEETS, icon: Clock },
  [FORM_NAMES.MONTHLY_COSTS]: { to: ROUTES.MONTHLY_COSTS, icon: DollarSign },
  [FORM_NAMES.REPORT_PO_VS_RESOURCE]: { to: ROUTES.REPORT_SERVICE_PO_RESOURCE, icon: Network, description: '' },
  [FORM_NAMES.REPORT_SERVICE_PO_SUMMARY]: { to: ROUTES.REPORT_SERVICE_PO_SUMMARY, icon: FileBarChart2, description: 'Service PO Summary with Hours & Billing' },
  [FORM_NAMES.REPORT_INVOICE_PO_SUMMARY]: { to: ROUTES.REPORT_INVOICE_PO_SUMMARY, icon: IndianRupee, description: '' },
  [FORM_NAMES.REPORT_MONTHLY_UTILIZATION]: { to: ROUTES.REPORT_MONTHLY_RESOURCE_UTILIZATION, icon: CalendarRange, description: '' },
  [FORM_NAMES.REPORT_EMPLOYEE_UTILIZATION_SUMMARY]: { to: ROUTES.REPORT_EMPLOYEE_UTILIZATION_SUMMARY, icon: Users2, description: "Each employee's total logged hours for the month, billable/non-billable breakdown" },
  [FORM_NAMES.REPORT_RESOURCE_ALLOCATION]: { to: ROUTES.REPORT_RESOURCE_ALLOCATION, icon: PieChart, description: '' },
  [FORM_NAMES.REPORT_RESOURCE_PROJECT_UTILIZATION]: { to: ROUTES.REPORT_RESOURCE_PROJECT_UTILIZATION, icon: UserCheck, description: '' },
  [FORM_NAMES.REPORT_CLIENT_SERVICE_PO_HOURS]: { to: ROUTES.REPORT_CLIENT_SERVICE_PO_HOURS, icon: Receipt, description: 'Hours delivered per Service PO, grouped by Client' },
  [FORM_NAMES.EMPLOYEE_DASHBOARD]: { to: ROUTES.EMPLOYEE_DASHBOARD, icon: LayoutDashboard, exact: true },
  [FORM_NAMES.EMPLOYEE_WORK_LOG]: { to: ROUTES.EMPLOYEE_TIMESHEET, icon: Clock },
  [FORM_NAMES.EMPLOYEE_TIME_ENTRY]: { to: ROUTES.EMPLOYEE_TIME_ENTRY, icon: Hourglass, exact: true },
  [FORM_NAMES.EMPLOYEE_MONTHLY_SUMMARY]: { to: ROUTES.EMPLOYEE_MONTHLY_SUMMARY, icon: Table2 },
  [FORM_NAMES.EMPLOYEE_REPORTS]: { to: ROUTES.EMPLOYEE_REPORTS, icon: FileBarChart2 },
  // Hub page — points to the Reports Center landing page; exact: true so only /employee/reports-center
  // itself is highlighted active (not every child report route under /employee/*).
  [FORM_NAMES.EMPLOYEE_REPORTS_CENTER]: { to: ROUTES.EMPLOYEE_REPORTS_CENTER, icon: FolderOpen, exact: true },
  [FORM_NAMES.EMPLOYEE_PROJECT_HOURS_REPORT]: { to: ROUTES.EMPLOYEE_PROJECT_HOURS_REPORT, icon: ListTree },
  [FORM_NAMES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT]: { to: ROUTES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT, icon: ListChecks },
  [FORM_NAMES.EMPLOYEE_WORK_LOG_TIME_REPORT]: { to: ROUTES.EMPLOYEE_WORK_LOG_TIME_REPORT, icon: Timer },
  [FORM_NAMES.EMPLOYEE_REJECTED_ENTRIES]: { to: ROUTES.EMPLOYEE_REJECTED_ENTRIES, icon: XCircle, exact: true },
  [FORM_NAMES.MANAGER_TIMESHEET]: { to: ROUTES.EMPLOYEE_TIMESHEET, icon: Clock },
  [FORM_NAMES.MANAGER_TIMESHEET_APPROVAL]: { to: ROUTES.MANAGER_TIMESHEET_APPROVAL, icon: ClipboardCheck, exact: true },
  [FORM_NAMES.SERVICE_PO_MONTHLY_BUDGET]: { to: ROUTES.SERVICE_PO_MONTHLY_BUDGET, icon: Wallet, exact: true },
  [FORM_NAMES.MY_TEAM]: { to: ROUTES.MY_TEAM, icon: Network, exact: true },
  [FORM_NAMES.TEAM_MAPPING]: { to: ROUTES.TEAM_MAPPINGS, icon: UserCog, exact: true },
  [FORM_NAMES.COST_BUDGET]: { to: ROUTES.COST_BUDGETS, icon: Banknote, exact: true },
  [FORM_NAMES.RESOURCE_BUDGET]: { to: ROUTES.RESOURCE_BUDGETS, icon: CalendarClock, exact: true },
  [FORM_NAMES.REPORT_SERVICE_PO_PROFITABILITY]: { to: ROUTES.REPORT_SERVICE_PO_PROFITABILITY, icon: TrendingUp, description: 'Margin analysis per Service PO — invoiced amount vs delivery cost.' },
  [FORM_NAMES.REPORT_BUDGETED_MARGIN_FORECAST]: { to: ROUTES.REPORT_BUDGETED_MARGIN_FORECAST, icon: LineChart, description: 'Forecasted margin from budgeted revenue vs budgeted cost, by Service PO.' },
  [FORM_NAMES.REPORT_RESOURCE_STAFFING_PLAN_ACCURACY]: { to: ROUTES.REPORT_RESOURCE_STAFFING_PLAN_ACCURACY, icon: Target, description: 'Planned vs actual hours per employee/Service PO, flagged when variance exceeds a threshold.' },
  [FORM_NAMES.REPORT_CLIENT_PROFITABILITY_CONCENTRATION]: { to: ROUTES.REPORT_CLIENT_PROFITABILITY_CONCENTRATION, icon: Percent, description: 'Revenue concentration and margin per client for the selected month.' },
  [FORM_NAMES.REPORT_BU_PERFORMANCE_SCORECARD]: { to: ROUTES.REPORT_BU_PERFORMANCE_SCORECARD, icon: Award, description: 'Per-company scorecard of active employees, POs, and margin.' },
  [FORM_NAMES.REPORT_EMPLOYEE_CAPACITY_FORECAST]: { to: ROUTES.REPORT_EMPLOYEE_CAPACITY_FORECAST, icon: BatteryCharging, description: 'Capacity utilization and bench/overallocation risk per employee for the selected month.' },
  [FORM_NAMES.REPORT_SERVICE_PO_TIMELINE_RISK]: { to: ROUTES.REPORT_SERVICE_PO_TIMELINE_RISK, icon: AlertTriangle, description: 'Burn-rate risk per Service PO based on elapsed time vs hours consumed.' },
  [FORM_NAMES.REPORT_DELIVERY_HEAD_PERFORMANCE]: { to: ROUTES.REPORT_DELIVERY_HEAD_PERFORMANCE, icon: Crown, description: 'Portfolio performance per Delivery Head — PO count, hours, and margin delivered.' },
  [FORM_NAMES.REPORT_INVOICE_REALIZATION_TREND]: { to: ROUTES.REPORT_INVOICE_REALIZATION_TREND, icon: ReceiptText, description: 'Invoiced vs billed amounts per Service PO across a month range, with a monthly trend drill-down.' },
  [FORM_NAMES.REPORT_SERVICE_LINE_BUSINESS_MIX]: { to: ROUTES.REPORT_SERVICE_LINE_BUSINESS_MIX, icon: GitCompare, description: 'Hours, cost, and margin by Service Category/Type, with optional month-over-month comparison.' },
  [FORM_NAMES.REPORT_BUDGET_VS_BILLED]: { to: ROUTES.REPORT_BUDGET_VS_BILLED, icon: Scale, description: 'Budget cost vs billed amount per Service PO, with a monthly trend and over/under-budget breakdown.' },
  [FORM_NAMES.REPORT_CLIENT_COST_ANALYTICS]: { to: ROUTES.REPORT_CLIENT_COST_ANALYTICS, icon: BarChart3, description: 'Cost and hours breakdown per client — an all-time view with no date range filter.' },
  [FORM_NAMES.REPORT_CLIENT_WISE_ANALYTICS]: { to: ROUTES.REPORT_CLIENT_WISE_ANALYTICS, icon: Building, description: 'Cost, hours and project distribution per client for the selected period.' },
  [FORM_NAMES.REPORT_MONTHLY_HOURS_TREND]: { to: ROUTES.REPORT_MONTHLY_HOURS_TREND, icon: Activity, description: 'Hours by category, cost by category, utilization, and leave/no-work hours across a resolved month range.' },
  [FORM_NAMES.REPORT_EMPLOYEE_BENCH_PERCENTAGE]: { to: ROUTES.REPORT_EMPLOYEE_BENCH_PERCENTAGE, icon: Armchair, description: "Share of each employee's hours that went unbilled (bench) for the selected period." },
  [FORM_NAMES.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY]: { to: ROUTES.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY, icon: FileBarChart2, description: 'Aggregated work log hours per employee for the selected date or month.' },
  [FORM_NAMES.REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE]: { to: ROUTES.REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE, icon: ClipboardList, description: 'Employees whose total logged hours fall below the required threshold for the selected period.' },
  [FORM_NAMES.REPORT_RESOURCE_UTILIZATION_TREND]: { to: ROUTES.REPORT_RESOURCE_UTILIZATION_TREND, icon: LineChart, description: 'Monthly utilization per resource — billable hours as a share of total hours.' },
  [FORM_NAMES.REPORT_SERVICE_PO_HOURS_BUDGET]: { to: ROUTES.REPORT_SERVICE_PO_HOURS_BUDGET, icon: Wallet, description: "Hours delivered against each Service PO's month-specific cost budget." },
};

const NORMALIZED_CONFIG = Object.fromEntries(
  Object.entries(FORM_ROUTE_CONFIG).map(([name, cfg]) => [name.trim().toLowerCase(), cfg])
);

// Case-insensitive/trimmed lookup so minor casing differences from the Form Master
// don't silently drop a nav item.
export const resolveFormRoute = (formName) => NORMALIZED_CONFIG[(formName ?? '').trim().toLowerCase()];

// First route the accessible-forms map actually resolves to, module order be damned — used as
// a landing page when Dashboard itself isn't one of the caller's mapped forms.
export const getFirstAccessibleRoute = (accessibleForms) => {
  const allForms = Object.values(accessibleForms ?? {}).flat();
  for (const f of allForms) {
    const cfg = resolveFormRoute(f?.name);
    if (cfg) return cfg.to;
  }
  return null;
};

// Pure — takes a plain accessible-forms map (module -> [{ name }]), not a hook, so it works
// equally from Redux-derived state (useAuth's homeRoute) and from a login response's own
// `forms` object before that's even landed in the store yet (Login.jsx's post-auth redirect,
// where waiting for a re-render to read it back out of Redux would be too late). The preferred
// home (Dashboard by default) is the destination whenever it's actually mapped, or when NOTHING
// is mapped (the zero-forms safety net ProtectedRoute's `allowIfNoFormsMapped` also honors) —
// otherwise the first form that resolves to a real route.
//
// `homeFormName`/`homeRoute` let an Employee-only account reuse this same logic against
// "Employee Dashboard" / EMPLOYEE_DASHBOARD instead of the admin-side Dashboard — an Employee
// whose role mapping omits
// "Employee Dashboard" itself (but has other Employee forms like "My Work Log") must still land
// on one of those, not get bounced to Not Authorized (see Login.jsx, useAuth's homeRoute).
export const computeHomeRoute = (accessibleForms, { homeFormName = FORM_NAMES.DASHBOARD, homeRoute = ROUTES.DASHBOARD } = {}) => {
  const allForms = Object.values(accessibleForms ?? {}).flat();
  const hasHome = allForms.some((f) => (f?.name ?? '').trim().toLowerCase() === homeFormName.trim().toLowerCase());
  if (hasHome || allForms.length === 0) return homeRoute;
  return getFirstAccessibleRoute(accessibleForms) ?? homeRoute;
};
