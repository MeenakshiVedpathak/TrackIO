import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { PageHeaderBackProvider } from '@/components/common/PageHeader';
import { cn } from '@/utils/cn';

const NAV = [
  { label: 'PO vs Resource', to: ROUTES.REPORT_SERVICE_PO_RESOURCE },
  { label: 'Service PO Summary', to: ROUTES.REPORT_SERVICE_PO_SUMMARY },
  { label: 'Invoice PO Summary', to: ROUTES.REPORT_INVOICE_PO_SUMMARY },
  { label: 'Monthly Utilization', to: ROUTES.REPORT_MONTHLY_RESOURCE_UTILIZATION },
  { label: 'Employee Utilization Summary', to: ROUTES.REPORT_EMPLOYEE_UTILIZATION_SUMMARY },
  { label: 'Resource Allocation', to: ROUTES.REPORT_RESOURCE_ALLOCATION },
  { label: 'Resource Project Utilization', to: ROUTES.REPORT_RESOURCE_PROJECT_UTILIZATION },
  { label: 'Client Service PO Hours', to: ROUTES.REPORT_CLIENT_SERVICE_PO_HOURS },
  { label: 'Service PO Profitability', to: ROUTES.REPORT_SERVICE_PO_PROFITABILITY },
  { label: 'Budgeted Margin Forecast', to: ROUTES.REPORT_BUDGETED_MARGIN_FORECAST },
  { label: 'Staffing Plan Accuracy', to: ROUTES.REPORT_RESOURCE_STAFFING_PLAN_ACCURACY },
  { label: 'Client Profitability', to: ROUTES.REPORT_CLIENT_PROFITABILITY_CONCENTRATION },
  { label: 'BU Performance Scorecard', to: ROUTES.REPORT_BU_PERFORMANCE_SCORECARD },
  { label: 'Capacity & Bench Forecast', to: ROUTES.REPORT_EMPLOYEE_CAPACITY_FORECAST },
  { label: 'PO Timeline Risk', to: ROUTES.REPORT_SERVICE_PO_TIMELINE_RISK },
  { label: 'Delivery Head Performance', to: ROUTES.REPORT_DELIVERY_HEAD_PERFORMANCE },
  { label: 'Invoice Realization Trend', to: ROUTES.REPORT_INVOICE_REALIZATION_TREND },
  { label: 'Service Line Business Mix', to: ROUTES.REPORT_SERVICE_LINE_BUSINESS_MIX },
  { label: 'Budget vs Billed', to: ROUTES.REPORT_BUDGET_VS_BILLED },
  { label: 'Client Cost Analytics', to: ROUTES.REPORT_CLIENT_COST_ANALYTICS },
  { label: 'Client Wise Analytics', to: ROUTES.REPORT_CLIENT_WISE_ANALYTICS },
  { label: 'Monthly Hours Trend', to: ROUTES.REPORT_MONTHLY_HOURS_TREND },
  { label: 'Employee Bench Percentage', to: ROUTES.REPORT_EMPLOYEE_BENCH_PERCENTAGE },
  { label: 'Resource Utilization Trend', to: ROUTES.REPORT_RESOURCE_UTILIZATION_TREND },
  { label: 'PO Hours & Budget', to: ROUTES.REPORT_SERVICE_PO_HOURS_BUDGET },
  { label: 'Employee Work Log Hours Summary', to: ROUTES.REPORT_EMPLOYEE_WORK_LOG_HOURS_SUMMARY },
];

// Module-level so the context value keeps a stable identity across renders.
const BACK_TO_REPORTS = { to: ROUTES.REPORTS, label: 'Back to Report' };

// Reports that behave like their own standalone screen rather than one of the swipeable
// analytics reports above (a Master-style record list, reached from — and backed by — a specific
// non-Reports screen instead of the Reports Center) — the mobile tab strip is Reports-suite
// cross-navigation and doesn't belong here, and this page isn't even in NAV to begin with.
const HIDE_MOBILE_NAV_FOR = [ROUTES.REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE];

const ReportsLayout = () => {
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/, '');

  // The Reports Center itself is the back button's destination, so it doesn't get one.
  const backTarget = normalizedPath === ROUTES.REPORTS ? null : BACK_TO_REPORTS;
  const showMobileNav = !HIDE_MOBILE_NAV_FOR.includes(normalizedPath);

  return (
    // `h-full min-h-0 flex-col` passes the bounded height MainLayout's <main> hands this route
    // down to whichever report page the nested <Outlet/> renders — without it, this layout route
    // (a plain block div) would shrink-wrap to the report's content height instead, breaking the
    // chain that lets a report's own <DataTable> own the scrollbar (see DataTable.jsx).
    <div className="flex h-full min-h-0 flex-col">
      {/* Mobile horizontal tabs — desktop nav is in the main sidebar */}
      {showMobileNav && (
        <div className="shrink-0 md:hidden -mx-6 -mt-6 mb-5 border-b bg-muted/20 overflow-x-auto">
          <nav className="flex gap-1 px-4 py-2 min-w-max">
            {NAV.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col">
        <PageHeaderBackProvider value={backTarget}>
          <Outlet />
        </PageHeaderBackProvider>
      </div>
    </div>
  );
};

export default ReportsLayout;
