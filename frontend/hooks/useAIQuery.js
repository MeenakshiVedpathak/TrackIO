import { useCallback, useState } from 'react';
import { aiCopilotApi } from '@/api/aiCopilot.api';
import { extractApiError } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';

// One-shot (non-conversational) POST /api/v1/ai/query call, for pages that need a single
// answer rather than a chat thread — Root Cause View, Executive Report, Employee AI Profile,
// Project Health Card. useAICopilot.js covers the conversational chat/bubble case instead.
export const useAIQuery = () => {
  const { roleObjects } = useAuth();
  const [state, setState] = useState({ loading: false, answer: null, raw: null, error: null });

  const ask = useCallback(async (question) => {
    setState({ loading: true, answer: null, raw: null, error: null });
    try {
      const res = await aiCopilotApi.query({ question, roleId: roleObjects[0]?.id, hoursSource: 'M' });
      setState({ loading: false, answer: res?.data?.answer ?? null, raw: res?.data ?? null, error: null });
    } catch (err) {
      setState({ loading: false, answer: null, raw: null, error: extractApiError(err) });
    }
  }, [roleObjects]);

  return { ...state, ask };
};

export default useAIQuery;
