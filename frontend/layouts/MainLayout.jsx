import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import AICopilotWidget from '@/components/ai/AICopilotWidget';
import { useSyncAccessibleForms } from '@/hooks/useAccessibleForms';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/constants/routes';

// RBAC redesign (§6.1): the full set of routes a Platform Admin may reach. Platform Admin only
// manages Admins now — Entity Admin/Company management moved to the Admin/Entity Admin tiers.
const PLATFORM_ADMIN_ROUTES = [ROUTES.ADMINS, ROUTES.ADMIN_NEW, ROUTES.ROLES, ROUTES.FORMS, ROUTES.ORGANIZATION_OVERVIEW];

const MainLayout = () => {
  // Mounted for every authenticated page load — including a hard refresh (a fresh page
  // load always gets a brand-new QueryClient, so this always hits the network here, not
  // just when the store happens to be empty) — so the sidebar/route guards reflect the
  // logged-in user's current role-form mappings, not a stale snapshot from last login.
  useSyncAccessibleForms();

  const { isPlatformAdmin, isEmployeeOnly, homeRoute } = useAuth();
  const { pathname } = useLocation();

  // Dynamic login: an account whose ONLY role is Employee has no business on any RBAC-driven
  // Admin/User route — enforced here (not just by hiding nav items) so a direct URL visit still
  // bounces them to their own dashboard, same as the Platform Admin check below. A multi-role
  // account (e.g. Employee + Manager) must still reach MainLayout for its other role's screens,
  // so this checks `isEmployeeOnly`, not just `isEmployee`. Uses useAuth's form-aware `homeRoute`
  // rather than hardcoding ROUTES.EMPLOYEE_DASHBOARD — an Employee not mapped to the "Employee
  // Dashboard" form itself (only to other Employee forms) would otherwise bounce straight into
  // Not Authorized, which (being rendered under this same MainLayout) would bounce right back
  // here, looping forever.
  if (isEmployeeOnly) {
    return <Navigate to={homeRoute} replace />;
  }

  // A Platform Admin's only screens are Admin creation plus Role Master and Forms Master —
  // enforced here (rather than in ProtectedRoute) since this is the one layout every
  // authenticated route renders inside, regardless of whether that route uses
  // formName/allowedRoles guards or none at all (e.g. Notifications, AI Copilot pages).
  // `isPlatformAdmin` is derived from the single role every login returns (§0).
  const isOnPlatformAdminRoute = PLATFORM_ADMIN_ROUTES.some((route) => pathname.startsWith(route));
  if (isPlatformAdmin && !isOnPlatformAdminRoute) {
    return <Navigate to={ROUTES.ADMINS} replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />
        {/* This is the ONE bounded-height region every routed page renders into. It owns the
            page-level scrollbar as a fallback for content that doesn't opt into the internal
            table-scroll pattern (see DataTable.jsx) — but a page that DOES opt in (root element
            sized `h-full flex flex-col min-h-0`) will exactly fill this box, so this never has to
            scroll for it; only that page's own table body does. `min-h-0` is what lets this flex
            child actually shrink to the remaining space instead of growing with its content and
            pushing the footer below (the bug this replaces).
            The footer is a sibling OUTSIDE this scroll region — deliberately, so pagination and
            footer never scroll out of view together with a tall/overflowing page. */}
        <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <div className="mx-auto max-w-screen-2xl px-3 sm:px-4 md:px-6 pt-4 pb-4 flex-1 w-full flex flex-col min-h-0">
            <Outlet />
          </div>
        </main>
        <footer className="shrink-0 w-full border-t bg-slate-50/80 py-2 px-3 sm:px-4 md:px-6">
          <div className="mx-auto max-w-screen-2xl flex flex-col sm:flex-row items-center justify-between gap-1">
            <p className="text-[11px] text-muted-foreground">
              © {new Date().getFullYear()} GTT Data Solutions Ltd. All rights reserved.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Designed &amp; Developed by{' '}
              <span className="font-semibold text-foreground/70">GTT Data Solutions Ltd.</span>
            </p>
          </div>
        </footer>
      </div>
      {/* Chatbot hidden for now */}
      {false && !isPlatformAdmin && <AICopilotWidget />}
    </div>
  );
};

export default MainLayout;
