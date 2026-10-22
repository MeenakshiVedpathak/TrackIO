import { QueryClient, QueryCache } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { extractApiError, isNetworkOrTimeoutError } from '@/services/apiClient';

export const queryClient = new QueryClient({
  // Most read-only queries (list/report pages) never render their own error state for a failed
  // GET, so a dropped connection or a timed-out request used to fail completely silently — the
  // page just sat on its skeleton/empty state forever. This surfaces exactly that one case (never
  // got a response at all) as a toast everywhere, without touching each page individually.
  //
  // Deliberately scoped to network/timeout failures only, not every query error: a page that
  // already renders its own inline error banner for a real backend error (4xx/5xx) keeps owning
  // that message, so this doesn't start double-reporting errors that were already visible.
  // A fixed toast id means a connectivity outage that fails several queries at once (or the same
  // polling query failing repeatedly) collapses into one updating toast instead of a stack of them.
  queryCache: new QueryCache({
    onError: (error) => {
      if (!isNetworkOrTimeoutError(error)) return;
      toast.error(extractApiError(error), { id: 'network-error' });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5 minutes
      gcTime: 1000 * 60 * 10,         // 10 minutes
      retry: (failureCount, error) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
