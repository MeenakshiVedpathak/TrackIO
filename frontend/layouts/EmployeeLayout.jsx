import { Outlet } from 'react-router-dom';
import EmployeeSidebar from '@/components/layout/EmployeeSidebar';
import Topbar from '@/components/layout/Topbar';
import { useSyncAccessibleForms } from '@/hooks/useAccessibleForms';

// Employee self-service shell — same structure as MainLayout (Sidebar + Topbar + Outlet +
// footer) but with the reduced EmployeeSidebar and no AICopilotWidget (admin/reporting-scoped
// feature, out of scope for employees). Topbar/UserMenu are reused unchanged — they're fully
// generic (theme toggle, sign out), no admin-only links.
const EmployeeLayout = () => {
  // Same as MainLayout — without this, an Employee's accessibleForms is only ever set once by
  // Login.jsx's one-shot fetch, so a Role-Form Mapping change or hard refresh never re-syncs it
  // here the way every other role's layout already does.
  useSyncAccessibleForms();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <EmployeeSidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />
        {/* Same bounded-scroll-region pattern as MainLayout — see the comment there. */}
        <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <div className="mx-auto max-w-screen-2xl px-3 sm:px-4 md:px-6 pt-3 pb-4 flex-1 w-full flex flex-col min-h-0">
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
    </div>
  );
};

export default EmployeeLayout;
