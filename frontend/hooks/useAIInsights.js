import { useQuery } from '@tanstack/react-query';
import { aiInsightsApi } from '@/api/aiInsights.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useAIInsights = (params, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.AI_INSIGHTS(params),
    queryFn: () => aiInsightsApi.getInsights(params),
    enabled: options.enabled ?? true,
    staleTime: 1000 * 60 * 2,
  });
