import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { FORM_NAMES } from '@/constants/rbacForms';
import { ROLE_NAMES } from '@/constants/roleHierarchy';
import { useAuth } from '@/hooks/useAuth';
import { useCanManageEmployeeRecords } from '@/hooks/usePermissions';
import ProtectedRoute from './ProtectedRoute';
import AuthLayout from '@/layouts/AuthLayout';
import MainLayout from '@/layouts/MainLayout';
import EmployeeLayout from '@/layouts/EmployeeLayout';
import ForgotPasswordLayout from '@/layouts/ForgotPasswordLayout';
import LoadingScreen from '@/components/common/LoadingScreen';

// Employee Master is granted to BU Admin / BU Head for the "Map Roles & Business Units" row
// action only — the Add/Edit Employee form behind it stays with HR / Admin / Entity Admin (see
// useCanManageEmployeeRecords). EmployeeList already hides every button that navigates here;
// this stops a hand-typed URL or a stale bookmark from reaching the form regardless.
//
// A plain ProtectedRoute `allowedRoles` can't express this: the rule is "everyone the form is
// mapped to EXCEPT this one tier", and enumerating the allowed side would silently lock out any
// role added to the mapping later.
const RequireEmployeeRecordAccess = ({ children }) => {
  const canManage = useCanManageEmployeeRecords();
  return canManage ? children : <Navigate to={ROUTES.NOT_AUTHORIZED} replace />;
};

// ── Auth pages ──
const Login = lazy(() => import('@/pages/auth/Login'));
const MicrosoftCallback = lazy(() => import('@/pages/auth/MicrosoftCallback'));
const ForgotPasswordEmail = lazy(() => import('@/pages/auth/ForgotPasswordEmail'));
const ForgotPasswordOtp = lazy(() => import('@/pages/auth/ForgotPasswordOtp'));
const ForgotPasswordReset = lazy(() => import('@/pages/auth/ForgotPasswordReset'));

// ── Employee self-service (dynamic login) ──
const EmployeeDashboard = lazy(() => import('@/pages/employee/EmployeeDashboard'));
const EmployeeTimesheet = lazy(() => import('@/pages/employee/EmployeeTimesheet'));
const EmployeeTimeEntry = lazy(() => import('@/pages/employee/EmployeeTimeEntry'));
const EmployeeMonthlySummary = lazy(() => import('@/pages/employee/EmployeeMonthlySummary'));
const EmployeeReports = lazy(() => import('@/pages/employee/EmployeeReports'));
const EmployeeReportsCenter = lazy(() => import('@/pages/employee/EmployeeReportsCenter'));
const EmployeeReportsLayout = lazy(() => import('@/pages/employee/EmployeeReportsLayout'));
const EmployeeProjectHoursReport = lazy(() => import('@/pages/employee/EmployeeProjectHoursReport'));
const TimesheetApprovalStatusReport = lazy(() => import('@/pages/employee/TimesheetApprovalStatusReport'));
const EmployeeWorkLogTimeReport = lazy(() => import('@/pages/employee/EmployeeWorkLogTimeReport'));
const EmployeeRejectedEntries = lazy(() => import('@/pages/employee/EmployeeRejectedEntries'));

// ── Core ──
const DashboardGate = lazy(() => import('@/pages/DashboardGate'));
const AIInsights = lazy(() => import('@/pages/AIInsights'));

// ── People ──
const EmployeeList = lazy(() => import('@/pages/employees/EmployeeList'));
const EmployeeForm = lazy(() => import('@/pages/employees/EmployeeForm'));
const RoleList = lazy(() => import('@/pages/roles/RoleList'));
const RoleForm = lazy(() => import('@/pages/roles/RoleForm'));

// ── RBAC admin (access gated by Role-Form Mapping, not a hard-coded role) ──
const FormList = lazy(() => import('@/pages/forms/FormList'));
const FormForm = lazy(() => import('@/pages/forms/FormForm'));
const CategoryList = lazy(() => import('@/pages/forms/categories/CategoryList'));
const CategoryForm = lazy(() => import('@/pages/forms/categories/CategoryForm'));
const RoleFormMappingForm = lazy(() => import('@/pages/roleFormMapping/RoleFormMappingForm'));

// ── Platform Admin / Admin tier ──
const AdminList = lazy(() => import('@/pages/admins/AdminList'));
const AdminCreate = lazy(() => import('@/pages/admins/AdminCreate'));
const OrganizationOverview = lazy(() => import('@/pages/organizationOverview/OrganizationOverview'));

// ── Entity Admin tier (also reachable by Admin, platform-wide) ──
const EntityAdminList = lazy(() => import('@/pages/entityAdmins/EntityAdminList'));
const EntityAdminCreate = lazy(() => import('@/pages/entityAdmins/EntityAdminCreate'));
const EntityList = lazy(() => import('@/pages/entities/EntityList'));
const EntityForm = lazy(() => import('@/pages/entities/EntityForm'));
const BuHeadList = lazy(() => import('@/pages/buHeads/BuHeadList'));

// ── Company Management — Entity Admin scoped (no Form Master row of its own; reached via
// buttons on Entity Master / BU Admin Master, see those pages) ──
const CompanyList = lazy(() => import('@/pages/companies/CompanyList'));
const CompanyForm = lazy(() => import('@/pages/companies/CompanyForm'));

// ── Business ──
const ClientList = lazy(() => import('@/pages/clients/ClientList'));
const ClientForm = lazy(() => import('@/pages/clients/ClientForm'));
const ProjectList = lazy(() => import('@/pages/projects/ProjectList'));
const ProjectForm = lazy(() => import('@/pages/projects/ProjectForm'));
const ServicePOList = lazy(() => import('@/pages/servicePOs/ServicePOList'));
const ServicePOForm = lazy(() => import('@/pages/servicePOs/ServicePOForm'));
const ServicePODetail = lazy(() => import('@/pages/servicePOs/ServicePODetail'));
const ServicePOImport = lazy(() => import('@/pages/servicePOs/ServicePOImport'));
const ServicePOMapping = lazy(() => import('@/pages/servicePOs/ServicePOMapping'));
const SubProjectList = lazy(() => import('@/pages/subProjects/SubProjectList'));
const SubProjectForm = lazy(() => import('@/pages/subProjects/SubProjectForm'));
const ServiceTypeList = lazy(() => import('@/pages/serviceTypes/ServiceTypeList'));
const ServiceTypeForm = lazy(() => import('@/pages/serviceTypes/ServiceTypeForm'));
const ServiceCategoryList = lazy(() => import('@/pages/serviceCategories/ServiceCategoryList'));
const ServiceCategoryForm = lazy(() => import('@/pages/serviceCategories/ServiceCategoryForm'));

// ── Resources ──
const TimesheetList = lazy(() => import('@/pages/timesheets/TimesheetList'));
const TimesheetUpload = lazy(() => import('@/pages/timesheets/TimesheetUpload'));
const TimesheetImportDetail = lazy(() => import('@/pages/timesheets/TimesheetImportDetail'));
const MonthlyCostList = lazy(() => import('@/pages/monthlyCosts/MonthlyCostList'));
const MonthlyCostDetail = lazy(() => import('@/pages/monthlyCosts/MonthlyCostDetail'));
const MonthlyCostForm = lazy(() => import('@/pages/monthlyCosts/MonthlyCostForm'));
const MonthlyCostImport = lazy(() => import('@/pages/monthlyCosts/MonthlyCostImport'));

// ── Reports ──
const ReportsLayout = lazy(() => import('@/pages/reports/ReportsLayout'));
const ReportsCenter = lazy(() => import('@/pages/reports/ReportsCenter'));
const ResourceAllocation = lazy(() => import('@/pages/reports/ResourceAllocation'));
const ServicePOResource = lazy(() => import('@/pages/reports/ServicePOResource'));
const ServicePOSummary = lazy(() => import('@/pages/reports/ServicePOSummary'));
const InvoicePOSummary = lazy(() => import('@/pages/reports/InvoicePOSummary'));
const MonthlyResourceUtilization = lazy(() => import('@/pages/reports/MonthlyResourceUtilization'));
const EmployeeUtilizationSummary = lazy(() => import('@/pages/reports/EmployeeUtilizationSummary'));
const ResourceProjectUtilization = lazy(() => import('@/pages/reports/ResourceProjectUtilization'));
const ClientServicePOHoursReport = lazy(() => import('@/pages/reports/ClientServicePOHoursReport'));
const ServicePOProfitability = lazy(() => import('@/pages/reports/ServicePOProfitability'));
const BudgetedMarginForecast = lazy(() => import('@/pages/reports/BudgetedMarginForecast'));
const ResourceStaffingPlanAccuracy = lazy(() => import('@/pages/reports/ResourceStaffingPlanAccuracy'));
const ClientProfitabilityConcentration = lazy(() => import('@/pages/reports/ClientProfitabilityConcentration'));
const BUPerformanceScorecard = lazy(() => import('@/pages/reports/BUPerformanceScorecard'));
const EmployeeCapacityForecast = lazy(() => import('@/pages/reports/EmployeeCapacityForecast'));
const ServicePOTimelineRisk = lazy(() => import('@/pages/reports/ServicePOTimelineRisk'));
const DeliveryHeadPerformance = lazy(() => import('@/pages/reports/DeliveryHeadPerformance'));
const InvoiceRealizationTrend = lazy(() => import('@/pages/reports/InvoiceRealizationTrend'));
const ServiceLineBusinessMix = lazy(() => import('@/pages/reports/ServiceLineBusinessMix'));
const BudgetVsBilled = lazy(() => import('@/pages/reports/BudgetVsBilled'));
const ClientCostAnalytics = lazy(() => import('@/pages/reports/ClientCostAnalytics'));
const ClientWiseAnalytics = lazy(() => import('@/pages/reports/ClientWiseAnalytics'));
const MonthlyHoursTrend = lazy(() => import('@/pages/reports/MonthlyHoursTrend'));
const EmployeeBenchPercentage = lazy(() => import('@/pages/reports/EmployeeBenchPercentage'));
const ResourceUtilizationTrend = lazy(() => import('@/pages/reports/ResourceUtilizationTrend'));
const ServicePOHoursBudget = lazy(() => import('@/pages/reports/ServicePOHoursBudget'));
const EmployeeWorkLogHoursSummaryReport = lazy(() => import('@/pages/reports/EmployeeWorkLogHoursSummaryReport'));
const EmployeeWorkLogComplianceReport = lazy(() => import('@/pages/reports/EmployeeWorkLogComplianceReport'));

// ── AI Copilot (new pages, launched from the floating AI Copilot widget) ──
const RootCauseView = lazy(() => import('@/pages/ai/RootCauseView'));
const ExecutiveReport = lazy(() => import('@/pages/ai/ExecutiveReport'));
const ForecastDashboard = lazy(() => import('@/pages/ai/ForecastDashboard'));
const ResourceRecommendations = lazy(() => import('@/pages/ai/ResourceRecommendations'));
const WhatIfSimulator = lazy(() => import('@/pages/ai/WhatIfSimulator'));
const ProjectHealthCard = lazy(() => import('@/pages/ai/ProjectHealthCard'));
const EmployeeAIProfile = lazy(() => import('@/pages/ai/EmployeeAIProfile'));

// ── Team Mapping (Service PO Admin self-service — no Form Master row exists for this yet, so
// it's gated by allowedRoles) ──
const TeamMappingList = lazy(() => import('@/pages/teamMappings/TeamMappingList'));

// ── My Team (Manager self-service — same allowedRoles gating as Team Mapping above) ──
const MyTeamList = lazy(() => import('@/pages/myTeam/MyTeamList'));

// ── Service PO Monthly Budget (Manager self-service, net-new — same allowedRoles gating) ──
const ServicePoMonthlyBudgetPage = lazy(() => import('@/pages/servicePoMonthlyBudget/ServicePoMonthlyBudgetPage'));

// ── Timesheet Approval (Manager self-service, net-new — split off from My Work Log) ──
const ManagerTimesheetApproval = lazy(() => import('@/pages/managerTimesheet/ManagerTimesheetApproval'));

// ── Cost Budget / Resource Budget (net-new, per Service PO + month) ──
const CostBudgetList = lazy(() => import('@/pages/costBudgets/CostBudgetList'));
const ResourceBudgetPage = lazy(() => import('@/pages/resourceBudgets/ResourceBudgetPage'));

// ── Settings ──
const Notifications = lazy(() => import('@/pages/Notifications'));

// ── Errors ──
const NotFound = lazy(() => import('@/pages/NotFound'));

// Employee self-service screens — reused under whichever layout actually fits the caller (see
// AppRoutes below). Gating stays formName-only, same as every other RBAC-driven screen; the
// `employeeOnly` tier check that used to double as "which layout do these live under" is now
// just a defensive re-check inside the EmployeeLayout branch, not the sole gate.
//
// A plain function called inline (`{employeeSelfServiceRoutes()}`), NOT a component used as
// `<EmployeeSelfServiceRoutes/>` — React Router's route-config extraction walks the literal
// `<Route>`/Fragment elements in the JSX tree without ever rendering custom components, so a
// `<Route>` hidden inside one would silently never register. Calling the function inline
// splices its returned Fragment's `<Route>` children directly into the tree instead.
const employeeSelfServiceRoutes = () => (
  <>
    <Route path={ROUTES.EMPLOYEE_DASHBOARD} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_DASHBOARD} allowIfNoFormsMapped><EmployeeDashboard /></ProtectedRoute>} />
    <Route path={ROUTES.EMPLOYEE_TIMESHEET} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_WORK_LOG}><EmployeeTimesheet /></ProtectedRoute>} />
    <Route path={ROUTES.EMPLOYEE_TIME_ENTRY} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_TIME_ENTRY}><EmployeeTimeEntry /></ProtectedRoute>} />
    <Route path={ROUTES.EMPLOYEE_MONTHLY_SUMMARY} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_MONTHLY_SUMMARY}><EmployeeMonthlySummary /></ProtectedRoute>} />
    {/* Employee reports sit under their own pathless layout route, mirroring how the admin
        reports nest under ReportsLayout: the layout supplies the inherited "Back to Report"
        arrow and the mobile tab strip, so each report page passes no backTo of its own. Pathless
        means the URLs are unchanged — only the shell around them is. Each child keeps its own
        formName guard; the layout adds no gating. */}
    <Route element={<EmployeeReportsLayout />}>
      <Route path={ROUTES.EMPLOYEE_REPORTS} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_REPORTS}><EmployeeReports /></ProtectedRoute>} />
      {/* No formName guard, deliberately — parity with the admin hub, which is likewise
          unguarded (`<Route index element={<ReportsCenter />} />` under ROUTES.REPORTS).
          Authentication still comes from the parent layout route either way.

          This page is a navigation aid, not a data screen: it lists ONLY the reports already in
          the caller's own accessibleForms, so an account with none sees an empty list rather than
          anything it shouldn't. Guarding it on an "Employee Reports Center" Form Master row
          instead made the sidebar's REPORTS header link dead-end at Not Authorized on every
          tenant where that row (a guessed name — see rbacForms.js) was never seeded. */}
      <Route path={ROUTES.EMPLOYEE_REPORTS_CENTER} element={<EmployeeReportsCenter />} />
      <Route path={ROUTES.EMPLOYEE_PROJECT_HOURS_REPORT} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_PROJECT_HOURS_REPORT}><EmployeeProjectHoursReport /></ProtectedRoute>} />
      <Route path={ROUTES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT}><TimesheetApprovalStatusReport /></ProtectedRoute>} />
      <Route path={ROUTES.EMPLOYEE_WORK_LOG_TIME_REPORT} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_WORK_LOG_TIME_REPORT}><EmployeeWorkLogTimeReport /></ProtectedRoute>} />
    </Route>
    <Route path={ROUTES.EMPLOYEE_REJECTED_ENTRIES} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEE_REJECTED_ENTRIES}><EmployeeRejectedEntries /></ProtectedRoute>} />
  </>
);

const AppRoutes = () => {
  // A multi-role account (e.g. Employee + Manager) must reach Employee self-service screens
  // (My Work Log, PO Wise Report, etc.) inside the SAME MainLayout/Sidebar shell as its other
  // forms — Sidebar.jsx already renders nav links for these whenever they're mapped (module ->
  // form, same as everything else), but until now those links 404'd because the routes only
  // existed under the separate employeeOnly-gated EmployeeLayout tree, which a Manager holding
  // Employee only as a secondary role would bounce into and out of, losing Manager-only nav
  // (My Team, Team Mapping) and the AI Copilot widget along the way. Only an account whose SOLE
  // role is Employee (isEmployeeOnly) still gets the separate, reduced EmployeeLayout shell.
  const { isEmployeeOnly } = useAuth();

  return (
  <Suspense fallback={<LoadingScreen />}>
    <Routes>
      {/* Microsoft SSO popup redirect target — standalone, no layout/auth redirect, since it
          renders inside the loginPopup window rather than as a normal page the user navigates to. */}
      <Route path={ROUTES.MICROSOFT_CALLBACK} element={<MicrosoftCallback />} />

      {/* Auth */}
      <Route element={<AuthLayout />}>
        <Route path={ROUTES.LOGIN} element={<Login />} />

        {/* Forgot Password — three real routes sharing one in-memory ForgotPasswordProvider,
            so refresh/back-button/direct-URL on any of them correctly lands back on the Email
            screen (the provider unmounts, clearing state, whenever none of the three match). */}
        <Route element={<ForgotPasswordLayout />}>
          <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPasswordEmail />} />
          <Route path={ROUTES.FORGOT_PASSWORD_OTP} element={<ForgotPasswordOtp />} />
          <Route path={ROUTES.FORGOT_PASSWORD_RESET} element={<ForgotPasswordReset />} />
        </Route>
      </Route>

      {/* Protected app */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Dashboard — gated like every other screen by whether it's actually mapped to the
            caller's roles; the zero-forms safety net (nothing mapped at all) still lands on the
            real Dashboard (empty state). An account with OTHER real forms mapped but not
            Dashboard itself (e.g. an Entity Admin, or a Manager mapped to reporting/self-service
            screens only) gets WelcomeNoDashboard instead of the old dead-end 404 bounce — see
            DashboardGate.jsx, which reuses computeHomeRoute rather than duplicating the check. */}
        <Route path={ROUTES.DASHBOARD} element={<DashboardGate />} />
        <Route path={ROUTES.AI_INSIGHTS} element={<ProtectedRoute formName={FORM_NAMES.AI_INSIGHTS}><AIInsights /></ProtectedRoute>} />

        {/* Employees */}
        <Route path={ROUTES.EMPLOYEES} element={<ProtectedRoute formName={FORM_NAMES.EMPLOYEES}><EmployeeList /></ProtectedRoute>}>
          <Route path="new" element={<RequireEmployeeRecordAccess><EmployeeForm /></RequireEmployeeRecordAccess>} />
          <Route path=":id/edit" element={<RequireEmployeeRecordAccess><EmployeeForm /></RequireEmployeeRecordAccess>} />
        </Route>

        {/* Roles — form-mapping is a per-row action on this same page, not a separate menu item */}
        <Route path={ROUTES.ROLES} element={<ProtectedRoute formName={FORM_NAMES.ROLES}><RoleList /></ProtectedRoute>}>
          <Route path="new" element={<RoleForm />} />
          <Route path=":id/edit" element={<RoleForm />} />
          <Route
            path=":roleId/forms"
            element={
              <ProtectedRoute formName={FORM_NAMES.ROLE_FORM_MAPPING}>
                <RoleFormMappingForm />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Form Master — access controlled by Role-Form Mapping, not a hard-coded role */}
        <Route
          path={ROUTES.FORMS}
          element={
            <ProtectedRoute formName={FORM_NAMES.FORMS}>
              <FormList />
            </ProtectedRoute>
          }
        >
          <Route path="new" element={<FormForm />} />
          <Route path=":id/edit" element={<FormForm />} />
        </Route>

        {/* Form Categories — sub-screen of Form Master, same RBAC gate, reached via its
            "Manage Categories" button rather than its own Sidebar entry. */}
        <Route
          path={ROUTES.FORM_CATEGORIES}
          element={
            <ProtectedRoute formName={FORM_NAMES.FORMS}>
              <CategoryList />
            </ProtectedRoute>
          }
        >
          <Route path="new" element={<CategoryForm />} />
          <Route path=":id/edit" element={<CategoryForm />} />
        </Route>

        {/* Platform Admin — manages Admins only; no longer touches Entity Admins/Companies.
            "Add Admin" is a nested route rendered as a Sheet over this list (Outlet), same
            drawer pattern as every other master — it used to be its own full page. */}
        <Route path={ROUTES.ADMINS} element={<ProtectedRoute platformAdminOnly><AdminList /></ProtectedRoute>}>
          <Route path="new" element={<AdminCreate />} />
        </Route>

        {/* Organization Overview — Platform Admin's read-only, whole-platform screen. One route,
            one form, tabs inside (Overview/Business Units/Projects & POs/Users) — see
            pages/organizationOverview/OrganizationOverview.jsx. */}
        <Route path={ROUTES.ORGANIZATION_OVERVIEW} element={<ProtectedRoute platformAdminOnly><OrganizationOverview /></ProtectedRoute>} />

        {/* Admin tier — manages Entity Admins platform-wide. Same drawer-over-list pattern as
            Admins above. */}
        <Route path={ROUTES.ENTITY_ADMINS} element={<ProtectedRoute allowedRoles={['Admin']}><EntityAdminList /></ProtectedRoute>}>
          <Route path="new" element={<EntityAdminCreate />} />
        </Route>

        {/* Entity Master — Admin and Entity Admin both manage Entities here (reverts the earlier
            "ownership flip (§1)" that made Entity Admin read-only). */}
        <Route path={ROUTES.ENTITIES} element={<ProtectedRoute formName={FORM_NAMES.ENTITY_MASTER}><EntityList /></ProtectedRoute>}>
          <Route path="new" element={<ProtectedRoute allowedRoles={['Admin', 'Entity Admin']}><EntityForm /></ProtectedRoute>} />
          <Route path=":id/edit" element={<ProtectedRoute allowedRoles={['Admin', 'Entity Admin']}><EntityForm /></ProtectedRoute>} />
        </Route>

        {/* BU Head Master — additive peer of BU Admin Master, also kept fully live.
            allowedRoles (not formName) — same as Entity Admins/Companies below — since there's
            no real Form Master row for this yet and ProtectedRoute ANDs formName with
            allowedRoles when both are given (a formName check would 403 every Admin/Entity
            Admin whose accessible-forms map doesn't have this row). Switch to formName once a
            real "BU Head Master" Form Master row + Role-Form-Mapping exists. */}
        <Route path={ROUTES.BU_HEADS} element={<ProtectedRoute allowedRoles={['Admin', 'Entity Admin']}><BuHeadList /></ProtectedRoute>} />

        {/* Company Management — Admin (platform-wide) and Entity Admin (own Entities) both reach
            this, reached via a button on Entity Master / BU Admin Master. No Form Master row of
            its own, so it's gated by role name directly rather than formName.

            BU Admin / BU Head are on the LIST only, and only read-only: once "BU Master" is
            mapped to the BU Admin role they need to see the BUs they map employees against, but
            a BU is an Entity-tier object they may never create or change. Same split Entity
            Master above already uses — the list is open, `new`/`:id/edit` carry their own
            Admin/Entity-Admin guard so a deep link (or a stale bookmark) can't reach the form
            that the hidden buttons in CompanyList no longer navigate to. */}
        <Route path={ROUTES.COMPANIES} element={<ProtectedRoute allowedRoles={['Admin', 'Entity Admin', 'BU Admin', 'BU Head']}><CompanyList /></ProtectedRoute>}>
          <Route path="new" element={<ProtectedRoute allowedRoles={['Admin', 'Entity Admin']}><CompanyForm /></ProtectedRoute>} />
          <Route path=":id/edit" element={<ProtectedRoute allowedRoles={['Admin', 'Entity Admin']}><CompanyForm /></ProtectedRoute>} />
        </Route>

        {/* Clients */}
        <Route path={ROUTES.CLIENTS} element={<ProtectedRoute formName={FORM_NAMES.CLIENTS}><ClientList /></ProtectedRoute>}>
          <Route path="new" element={<ClientForm />} />
          <Route path=":id/edit" element={<ClientForm />} />
        </Route>

        {/* Projects */}
        <Route path={ROUTES.PROJECTS} element={<ProtectedRoute formName={FORM_NAMES.PROJECTS}><ProjectList /></ProtectedRoute>}>
          <Route path="new" element={<ProjectForm />} />
          <Route path=":id/edit" element={<ProjectForm />} />
        </Route>

        {/* Service POs */}
        <Route path={ROUTES.SERVICE_POS} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_POS}><ServicePOList /></ProtectedRoute>}>
          <Route path="new" element={<ServicePOForm />} />
          <Route path=":id/edit" element={<ServicePOForm />} />
        </Route>
        <Route path={ROUTES.SERVICE_PO_IMPORT} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_POS}><ServicePOImport /></ProtectedRoute>} />
        <Route path={ROUTES.SERVICE_PO_MAP_EMPLOYEES} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_POS}><ServicePOMapping /></ProtectedRoute>} />
        <Route path={ROUTES.SERVICE_PO_DETAIL} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_POS}><ServicePODetail /></ProtectedRoute>} />

        {/* Sub-projects */}
        <Route path={ROUTES.SUB_PROJECTS} element={<ProtectedRoute formName={FORM_NAMES.SUB_PROJECTS}><SubProjectList /></ProtectedRoute>}>
          <Route path="new" element={<SubProjectForm />} />
          <Route path=":id/edit" element={<SubProjectForm />} />
        </Route>

        {/* Service Types */}
        <Route path={ROUTES.SERVICE_TYPES} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_TYPES}><ServiceTypeList /></ProtectedRoute>}>
          <Route path="new" element={<ServiceTypeForm />} />
          <Route path=":id/edit" element={<ServiceTypeForm />} />
        </Route>

        {/* Service Categories */}
        <Route path={ROUTES.SERVICE_CATEGORIES} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_CATEGORIES}><ServiceCategoryList /></ProtectedRoute>}>
          <Route path="new" element={<ServiceCategoryForm />} />
          <Route path=":id/edit" element={<ServiceCategoryForm />} />
        </Route>

        {/* Resources */}
        <Route path={ROUTES.TIMESHEETS} element={<ProtectedRoute formName={FORM_NAMES.TIMESHEETS}><TimesheetList /></ProtectedRoute>} />
        <Route path={ROUTES.TIMESHEET_UPLOAD} element={<ProtectedRoute formName={FORM_NAMES.TIMESHEETS}><TimesheetUpload /></ProtectedRoute>} />
        <Route path={ROUTES.TIMESHEET_IMPORT_DETAIL} element={<ProtectedRoute formName={FORM_NAMES.TIMESHEETS}><TimesheetImportDetail /></ProtectedRoute>} />
        <Route path={ROUTES.MONTHLY_COSTS} element={<ProtectedRoute formName={FORM_NAMES.MONTHLY_COSTS}><MonthlyCostList /></ProtectedRoute>} />
        <Route path={ROUTES.MONTHLY_COST_IMPORT} element={<ProtectedRoute formName={FORM_NAMES.MONTHLY_COSTS}><MonthlyCostImport /></ProtectedRoute>} />
        <Route path={ROUTES.MONTHLY_COST_DETAIL} element={<ProtectedRoute formName={FORM_NAMES.MONTHLY_COSTS}><MonthlyCostDetail /></ProtectedRoute>}>
          <Route path="new" element={<MonthlyCostForm />} />
          <Route path=":id/edit" element={<MonthlyCostForm />} />
        </Route>

        {/* Reports */}
        <Route path={ROUTES.REPORTS} element={<ReportsLayout />}>
          <Route index element={<ReportsCenter />} />
          <Route path={ROUTES.REPORT_RESOURCE_ALLOCATION} element={<ProtectedRoute formName={FORM_NAMES.REPORT_RESOURCE_ALLOCATION}><ResourceAllocation /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_SERVICE_PO_RESOURCE} element={<ProtectedRoute formName={FORM_NAMES.REPORT_PO_VS_RESOURCE}><ServicePOResource /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_SERVICE_PO_SUMMARY} element={<ProtectedRoute formName={FORM_NAMES.REPORT_SERVICE_PO_SUMMARY}><ServicePOSummary /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_INVOICE_PO_SUMMARY} element={<ProtectedRoute formName={FORM_NAMES.REPORT_INVOICE_PO_SUMMARY}><InvoicePOSummary /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_MONTHLY_RESOURCE_UTILIZATION} element={<ProtectedRoute formName={FORM_NAMES.REPORT_MONTHLY_UTILIZATION}><MonthlyResourceUtilization /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_EMPLOYEE_UTILIZATION_SUMMARY} element={<ProtectedRoute formName={FORM_NAMES.REPORT_EMPLOYEE_UTILIZATION_SUMMARY}><EmployeeUtilizationSummary /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_RESOURCE_PROJECT_UTILIZATION} element={<ProtectedRoute formName={FORM_NAMES.REPORT_RESOURCE_PROJECT_UTILIZATION}><ResourceProjectUtilization /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_CLIENT_SERVICE_PO_HOURS} element={<ProtectedRoute formName={FORM_NAMES.REPORT_CLIENT_SERVICE_PO_HOURS}><ClientServicePOHoursReport /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_SERVICE_PO_PROFITABILITY} element={<ProtectedRoute formName={FORM_NAMES.REPORT_SERVICE_PO_PROFITABILITY}><ServicePOProfitability /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_BUDGETED_MARGIN_FORECAST} element={<ProtectedRoute formName={FORM_NAMES.REPORT_BUDGETED_MARGIN_FORECAST}><BudgetedMarginForecast /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_RESOURCE_STAFFING_PLAN_ACCURACY} element={<ProtectedRoute formName={FORM_NAMES.REPORT_RESOURCE_STAFFING_PLAN_ACCURACY}><ResourceStaffingPlanAccuracy /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_CLIENT_PROFITABILITY_CONCENTRATION} element={<ProtectedRoute formName={FORM_NAMES.REPORT_CLIENT_PROFITABILITY_CONCENTRATION}><ClientProfitabilityConcentration /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_BU_PERFORMANCE_SCORECARD} element={<ProtectedRoute formName={FORM_NAMES.REPORT_BU_PERFORMANCE_SCORECARD}><BUPerformanceScorecard /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_EMPLOYEE_CAPACITY_FORECAST} element={<ProtectedRoute formName={FORM_NAMES.REPORT_EMPLOYEE_CAPACITY_FORECAST}><EmployeeCapacityForecast /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_SERVICE_PO_TIMELINE_RISK} element={<ProtectedRoute formName={FORM_NAMES.REPORT_SERVICE_PO_TIMELINE_RISK}><ServicePOTimelineRisk /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_DELIVERY_HEAD_PERFORMANCE} element={<ProtectedRoute formName={FORM_NAMES.REPORT_DELIVERY_HEAD_PERFORMANCE}><DeliveryHeadPerformance /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_INVOICE_REALIZATION_TREND} element={<ProtectedRoute formName={FORM_NAMES.REPORT_INVOICE_REALIZATION_TREND}><InvoiceRealizationTrend /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_SERVICE_LINE_BUSINESS_MIX} element={<ProtectedRoute formName={FORM_NAMES.REPORT_SERVICE_LINE_BUSINESS_MIX}><ServiceLineBusinessMix /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_BUDGET_VS_BILLED} element={<ProtectedRoute formName={FORM_NAMES.REPORT_BUDGET_VS_BILLED}><BudgetVsBilled /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_CLIENT_COST_ANALYTICS} element={<ProtectedRoute formName={FORM_NAMES.REPORT_CLIENT_COST_ANALYTICS}><ClientCostAnalytics /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_CLIENT_WISE_ANALYTICS} element={<ProtectedRoute formName={FORM_NAMES.REPORT_CLIENT_WISE_ANALYTICS}><ClientWiseAnalytics /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_MONTHLY_HOURS_TREND} element={<ProtectedRoute formName={FORM_NAMES.REPORT_MONTHLY_HOURS_TREND}><MonthlyHoursTrend /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_EMPLOYEE_BENCH_PERCENTAGE} element={<ProtectedRoute formName={FORM_NAMES.REPORT_EMPLOYEE_BENCH_PERCENTAGE}><EmployeeBenchPercentage /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_RESOURCE_UTILIZATION_TREND} element={<ProtectedRoute formName={FORM_NAMES.REPORT_RESOURCE_UTILIZATION_TREND}><ResourceUtilizationTrend /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_SERVICE_PO_HOURS_BUDGET} element={<ProtectedRoute formName={FORM_NAMES.REPORT_SERVICE_PO_HOURS_BUDGET}><ServicePOHoursBudget /></ProtectedRoute>} />
          <Route path={ROUTES.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY} element={<ProtectedRoute formName={FORM_NAMES.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY} allowIfNoFormsMapped><EmployeeWorkLogHoursSummaryReport /></ProtectedRoute>} />
          {/* No formName gate — reachable by any authenticated login regardless of Role-Form
              Mapping, since Manager Timesheet Approval's "Check Pending & Remind" button links
              here directly and a Manager role may not have this form explicitly granted. */}
          <Route path={ROUTES.REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE} element={<ProtectedRoute><EmployeeWorkLogComplianceReport /></ProtectedRoute>} />
        </Route>

        {/* AI Copilot — new, additive pages. No RBAC form rows exist for these yet (they're
            brand new), so — same as Profile/Notifications below — they're available to any
            authenticated user rather than blocked behind a formName gate that would 404 for
            everyone until an admin manually creates matching Forms + Role-Form-Mapping rows. */}
        <Route path={ROUTES.AI_ROOT_CAUSE} element={<RootCauseView />} />
        <Route path={ROUTES.AI_EXECUTIVE_REPORT} element={<ExecutiveReport />} />
        <Route path={ROUTES.AI_FORECAST} element={<ForecastDashboard />} />
        <Route path={ROUTES.AI_RECOMMENDATIONS} element={<ResourceRecommendations />} />
        <Route path={ROUTES.AI_WHAT_IF} element={<WhatIfSimulator />} />
        <Route path={ROUTES.AI_PROJECT_HEALTH} element={<ProjectHealthCard />} />
        <Route path={ROUTES.EMPLOYEE_AI_PROFILE} element={<EmployeeAIProfile />} />

        {/* Team Mapping — Service PO Admin's own team self-service (§7). Gated by allowedRoles
            rather than formName since there's no Form Master row for this feature. */}
        <Route path={ROUTES.TEAM_MAPPINGS} element={<ProtectedRoute allowedRoles={[ROLE_NAMES.SERVICE_PO_ADMIN]}><TeamMappingList /></ProtectedRoute>} />

        {/* My Team — People module Form Master row (confirmed via GET /roles/forms), now gated
            dynamically by formName like every other RBAC-driven screen instead of a hardcoded
            allowedRoles whitelist, so any role the admin maps this form to gets access
            automatically. */}
        <Route path={ROUTES.MY_TEAM} element={<ProtectedRoute formName={FORM_NAMES.MY_TEAM}><MyTeamList /></ProtectedRoute>} />

        {/* Service PO Monthly Budget — Business module Form Master row (confirmed via
            GET /roles/forms), now gated dynamically by formName like every other RBAC-driven
            screen instead of a hardcoded allowedRoles whitelist, so any role the admin maps
            this form to (Manager, Service PO Admin, BU Admin, etc.) gets access automatically. */}
        <Route path={ROUTES.SERVICE_PO_MONTHLY_BUDGET} element={<ProtectedRoute formName={FORM_NAMES.SERVICE_PO_MONTHLY_BUDGET}><ServicePoMonthlyBudgetPage /></ProtectedRoute>} />

        {/* Timesheet Approval — Resources module Form Master row ("Timesheet Approval"), split
            off (2026-08-23) from the employee selector that used to live inside My Work Log. */}
        <Route path={ROUTES.MANAGER_TIMESHEET_APPROVAL} element={<ProtectedRoute formName={FORM_NAMES.MANAGER_TIMESHEET_APPROVAL}><ManagerTimesheetApproval /></ProtectedRoute>} />

        {/* Cost Budget / Resource Budget — net-new, gated by formName like every other
            RBAC-driven screen (see rbacForms.js for the guessed Form Master names). */}
        <Route path={ROUTES.COST_BUDGETS} element={<ProtectedRoute formName={FORM_NAMES.COST_BUDGET}><CostBudgetList /></ProtectedRoute>} />
        <Route path={ROUTES.RESOURCE_BUDGETS} element={<ProtectedRoute formName={FORM_NAMES.RESOURCE_BUDGET}><ResourceBudgetPage /></ProtectedRoute>} />

        {/* Settings — personal-account pages, always available to any authenticated user.
            Change Password used to live at ROUTES.PROFILE as a full page — it's now a modal
            (ChangePasswordDialog) opened from UserMenu instead, so that route is gone. */}
        <Route path={ROUTES.NOTIFICATIONS} element={<Notifications />} />

        {/* Employee self-service, rendered here (same shell, same formName gating as every
            other screen above) for any account that ISN'T employee-only — a Manager who also
            holds Employee, for instance, keeps My Team/Team Mapping/AI Copilot while using
            My Work Log or PO Wise Report instead of losing them to a shell swap. */}
        {!isEmployeeOnly && employeeSelfServiceRoutes()}

        {/* RBAC guard redirect target — a real path, unlike the '*' catch-all below */}
        <Route path={ROUTES.NOT_AUTHORIZED} element={<NotFound />} />
      </Route>

      {/* Employee self-service for an account whose SOLE role is Employee (isEmployeeOnly) —
          the separate, reduced shell (no AICopilotWidget, no Manager/Admin nav) still applies
          only here; anyone holding an additional role gets the block above instead. Dashboard
          alone carries `allowIfNoFormsMapped` so a brand-new Employee with nothing mapped yet
          still has a landing page instead of an infinite Not-Authorized <-> MainLayout-redirect
          loop (see ProtectedRoute.jsx). */}
      {isEmployeeOnly && (
        <Route element={<ProtectedRoute employeeOnly><EmployeeLayout /></ProtectedRoute>}>
          {employeeSelfServiceRoutes()}
        </Route>
      )}

      <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
    </Routes>
  </Suspense>
  );
};

export default AppRoutes;
