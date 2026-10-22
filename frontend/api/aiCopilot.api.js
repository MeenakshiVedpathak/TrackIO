import apiClient from '@/services/apiClient';

// POST /api/v1/ai/query — { question, roleId?, hoursSource? } → { success, message, data }
// data shape: { question, intents_detected, unsupported_intents_detected, period, data, answer }
// Shared aiLimiter rate limit (20 req / 15 min) — same budget as the AI Insights endpoints.
export const aiCopilotApi = {
  query: (payload) => apiClient.post('/ai/query', payload).then((r) => r.data),
};

export default aiCopilotApi;
