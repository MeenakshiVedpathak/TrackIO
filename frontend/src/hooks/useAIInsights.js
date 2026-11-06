import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiInsightsApi } from '@/api/aiInsights.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useAIInsights = (params, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.AI_INSIGHTS(params),
    queryFn: () => aiInsightsApi.getInsights(params),
    enabled: options.enabled ?? true,
    // Monthly reports are REPLACED in place (same id, new content) as more units sync, so a cached
    // copy is never trusted: refetch on mount and whenever the tab regains focus. A month change
    // gets a fresh query because `month` is part of the key.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

export const useRunAIInsightJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobKey, companyId }) => aiInsightsApi.run(jobKey, { companyId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-insights'] }),
  });
};

export const useRunAllAIInsights = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId }) => aiInsightsApi.runAll({ companyId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-insights'] }),
  });
};
