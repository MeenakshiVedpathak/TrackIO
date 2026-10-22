import apiClient from '@/services/apiClient';

export const aiInsightsApi = {
  // Response: { success, message, data: [...insights], meta: { total, page, limit, totalPages, hasNext, hasPrev } }
  getInsights: (params) =>
    apiClient.get('/ai-insights/', { params }).then((r) => r.data),
};
