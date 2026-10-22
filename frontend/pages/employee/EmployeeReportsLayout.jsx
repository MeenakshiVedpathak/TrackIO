import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/constants/routes';
import { FORM_NAMES } from '@/constants/rbacForms';
import { PageHeaderBackProvider } from '@/components/common/PageHeader';
import { cn } from '@/utils/cn';

// Employee-side peer of pages/reports/ReportsLayout — same shell, so an employee report looks and
// behaves exactly like an admin one: a mobile horizontal tab strip (desktop nav lives in the
// sidebar) plus a PageHeaderBackProvider so every report beneath inherits its back arrow instead
// of hardcoding one. Before this, the four employee reports each passed
// `backTo={ROUTES.REPORTS}` themselves — the ADMIN hub, a route an Employee login can't reach —
// so the arrow bounced them out of their own section.
//
// `form` on each row is the Form Master name, used to hide a tab the login isn't actually mapped
// to. The admin layout's NAV is unfiltered because every row there belongs to one module an admin
// either has or doesn't; employee report mappings vary per role, so a tab is only offered when the
// report behind it will actually open.
const NAV = [
  { label: 'PO Wise Report', to: ROUTES.EMPLOYEE_REPORTS, form: FORM_NAMES.EMPLOYEE_REPORTS },
  { label: 'Project Hours Report', to: ROUTES.EMPLOYEE_PROJECT_HOURS_REPORT, form: FORM_NAMES.EMPLOYEE_PROJECT_HOURS_REPORT },
  { label: 'Timesheet Approval Status', to: ROUTES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT, form: FORM_NAMES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT },
  { label: 'Work Log Time Report', to: ROUTES.EMPLOYEE_WORK_LOG_TIME_REPORT, form: FORM_NAMES.EMPLOYEE_WORK_LOG_TIME_REPORT },
];

// Module-level so the context value keeps a stable identity across renders.
const BACK_TO_REPORTS = { to: ROUTES.EMPLOYEE_REPORTS_CENTER, label: 'Back to Report' };

const normalize = (s) => (s ?? '').trim().toLowerCase();

const EmployeeReportsLayout = () => {
  const { pathname } = useLocation();
  const { accessibleForms, isPlatformAdmin } = useAuth();

  const grantedFormNames = useMemo(
    () => new Set(Object.values(accessibleForms ?? {}).flat().map((f) => normalize(f?.name))),
    [accessibleForms]
  );

  const navItems = useMemo(
    () => (isPlatformAdmin ? NAV : NAV.filter((item) => grantedFormNames.has(normalize(item.form)))),
    [grantedFormNames, isPlatformAdmin]
  );

  // The Reports Center itself is the back button's destination, so it doesn't get one — same rule
  // the admin layout applies to /reports. Every other report always gets the arrow: the hub route
  // carries no formName guard (see routes/index.jsx), so it's reachable by anyone who can reach a
  // report in the first place.
  const isHub = pathname.replace(/\/+$/, '') === ROUTES.EMPLOYEE_REPORTS_CENTER;
  const backTarget = isHub ? null : BACK_TO_REPORTS;

  return (
    <div>
      {/* Mobile horizontal tabs — desktop nav is in the sidebar */}
      {navItems.length > 0 && (
        <div className="md:hidden -mx-6 -mt-6 mb-5 border-b bg-muted/20 overflow-x-auto">
          <nav className="flex gap-1 px-4 py-2 min-w-max">
            {navItems.map(({ label, to }) => (
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

      <PageHeaderBackProvider value={backTarget}>
        <Outlet />
      </PageHeaderBackProvider>
    </div>
  );
};

export default EmployeeReportsLayout;
