import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Home } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { homeRoute } = useAuth();

  // This component doubles as the RBAC "Not Authorized" target (see routes/index.jsx) — that
  // case keeps the manual button so the user actually sees why they landed here. A genuine
  // unmatched URL (typo, stale bookmark, dead link) has nothing worth reading, so it bounces
  // straight to the dashboard instead of making the user click through.
  const isGenuine404 = location.pathname !== ROUTES.NOT_AUTHORIZED;

  useEffect(() => {
    if (isGenuine404) {
      navigate(homeRoute, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isGenuine404) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="text-8xl font-bold text-primary/20 tabular-nums">404</p>
        <h1 className="mt-4 text-xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
          The page you're looking for doesn't exist or you don't have permission to access it.
        </p>
        <Button className="mt-8" onClick={() => navigate(homeRoute)}>
          <Home className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
      </motion.div>
    </div>
  );
};

export default NotFound;
