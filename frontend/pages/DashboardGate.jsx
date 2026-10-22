import Dashboard from './Dashboard';
import WelcomeNoDashboard from './WelcomeNoDashboard';
import LoadingScreen from '@/components/common/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { computeHomeRoute } from '@/constants/rbacForms';
import { ROUTES } from '@/constants/routes';

// Sits at ROUTES.DASHBOARD in place of a plain formName-gated ProtectedRoute. computeHomeRoute
// already resolves to ROUTES.DASHBOARD exactly when "Dashboard" is mapped (or nothing at all is
// mapped, the zero-forms safety net) — anything else means the caller has other real forms but
// not this one, which used to bounce straight to the shared 404/Not Authorized page. Showing
// WelcomeNoDashboard there instead avoids that dead-end for an account whose role just wasn't
// given the Dashboard form (e.g. a Manager mapped to reporting/self-service screens only).
const DashboardGate = () => {
  const { accessibleForms, accessibleFormsLoaded } = useAuth();

  if (!accessibleFormsLoaded) return <LoadingScreen />;

  return computeHomeRoute(accessibleForms) === ROUTES.DASHBOARD
    ? <Dashboard />
    : <WelcomeNoDashboard />;
};

export default DashboardGate;
