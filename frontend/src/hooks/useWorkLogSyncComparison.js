import { useQuery } from '@tanstack/react-query';
import { workLogSyncComparisonApi } from '@/api/workLogSyncComparison.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Exactly one period mode must be present: date | start_date+end_date | month+year.
const hasOnePeriod = (params) => {
  const modes = [
    !!params?.date,
    !!(params?.start_date && params?.end_date),
    !!(params?.month && params?.year),
  ].filter(Boolean).length;
  return modes === 1;
};

// React Query hands every queryFn an AbortSignal and cancels the previous request when the key
// changes, so an out-of-order (stale) response never lands. `placeholderData` keeps the previous
// page on screen while the next one loads (the page shows an overlay on top of it).
export const useWorkLogSyncComparison = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_WORK_LOG_SYNC_COMPARISON(params),
    queryFn: ({ signal }) => workLogSyncComparisonApi.getReport(params, { signal }),
    enabled: hasOnePeriod(params),
    staleTime: 0,
    placeholderData: (prev) => prev,
    retry: false,
  });

// Takes only the period params (+ buId) — refetches whenever the period changes.
export const useWorkLogSyncComparisonFilterOptions = (periodParams) =>
  useQuery({
    queryKey: QUERY_KEYS.REPORT_WORK_LOG_SYNC_COMPARISON_FILTER_OPTIONS(periodParams),
    queryFn: ({ signal }) => workLogSyncComparisonApi.getFilterOptions(periodParams, { signal }),
    enabled: hasOnePeriod(periodParams),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
    retry: false,
  });
