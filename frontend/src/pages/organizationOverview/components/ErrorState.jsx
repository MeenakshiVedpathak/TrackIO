import { ShieldAlert, ServerCrash, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Inline 403/500 states for this one screen — no shared ErrorState component exists elsewhere in
// the app (see research notes); every other screen relies on route-level redirects or toasts,
// neither of which fits a single-page form that must keep rendering its own header/tabs shell
// around the error.
const ErrorState = ({ status, onRetry }) => {
  const isForbidden = status === 403;
  const Icon = isForbidden ? ShieldAlert : ServerCrash;
  const title = isForbidden
    ? 'You are not authorized to access Organization Overview.'
    : 'Unable to load organization overview.';

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-7 w-7 text-destructive" />
      </div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {!isForbidden && (
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Something went wrong while fetching the latest data. Please try again.
        </p>
      )}
      {!isForbidden && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
        </Button>
      )}
    </div>
  );
};

export default ErrorState;
