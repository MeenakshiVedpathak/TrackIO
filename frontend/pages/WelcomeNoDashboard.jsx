import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { resolveFormRoute } from '@/constants/rbacForms';
import { Button } from '@/components/ui/button';

// Shown at ROUTES.DASHBOARD in place of the real Dashboard whenever the caller's roles have
// other forms mapped but not "Dashboard" itself — replaces what used to be a bare Not
// Authorized/404 bounce (see DashboardGate.jsx) with a friendlier landing page pointing at
// whatever the account can actually reach.
const WelcomeNoDashboard = () => {
  const navigate = useNavigate();
  const { employee, accessibleForms, homeRoute } = useAuth();
  const displayName = employee?.full_name ?? employee?.email ?? 'there';

  // Same accessibleForms shape Sidebar/EmployeeSidebar already render from — reused here so
  // this page's quick links never drift from what the sidebar itself shows as available.
  // Deduped by route: a few form names intentionally share one destination (e.g. "Timesheet"
  // and "Timesheet Approval" both resolve to the same Employee Timesheet page).
  const quickLinks = useMemo(() => {
    const seen = new Set();
    return Object.entries(accessibleForms ?? {})
      .flatMap(([, forms]) =>
        (forms ?? []).map((form) => {
          const cfg = resolveFormRoute(form.name);
          return cfg ? { label: form.name, to: cfg.to, icon: cfg.icon } : null;
        })
      )
      .filter(Boolean)
      .filter((link) => (seen.has(link.to) ? false : (seen.add(link.to), true)));
  }, [accessibleForms]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg text-center"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <LayoutDashboard className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Welcome, {displayName}</h1>
        {/* <p className="mt-2 text-sm text-muted-foreground">
          The Dashboard screen hasn't been set up for your account yet. Contact your administrator
          if you think this is a mistake — in the meantime, here's what you can access:
        </p> */}

        {quickLinks.length > 0 ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-2.5 rounded-lg border bg-card px-3.5 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/60"
              >
                <link.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{link.label}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Button className="mt-6" onClick={() => navigate(homeRoute)}>
            Continue <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </motion.div>
    </div>
  );
};

export default WelcomeNoDashboard;
