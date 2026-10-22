import { useCallback, useEffect, useState } from 'react';
import { aiCopilotApi } from '@/api/aiCopilot.api';
import { extractApiError } from '@/services/apiClient';
import { formatAnswerAsMarkdown } from '@/utils/aiCopilotEngine';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'rut_ai_copilot_conversation';

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

let idCounter = 0;
const nextId = () => {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
};

// Owns the AI Copilot conversation against the real POST /api/v1/ai/query endpoint:
// message history (persisted to localStorage so it survives navigation/reload), the
// "thinking" lifecycle while a question is in flight, and regenerate/clear actions.
// Chat panel and copilot bubble both drive this same hook so history stays a single
// thread regardless of which surface sent the message.
export const useAICopilot = () => {
  const { roleObjects } = useAuth();
  const [messages, setMessages] = useState(loadHistory);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // localStorage unavailable (private mode, quota) — conversation just won't persist
    }
  }, [messages]);

  const pushAssistantReply = useCallback(async (query) => {
    setIsThinking(true);
    const thinkingId = nextId();
    setMessages((prev) => [...prev, { id: thinkingId, role: 'assistant', text: '', thinking: true, createdAt: new Date().toISOString() }]);

    try {
      const res = await aiCopilotApi.query({ question: query, roleId: roleObjects[0]?.id, hoursSource: 'M' });
      const answer = res?.data?.answer;
      const text = formatAnswerAsMarkdown(answer);
      setMessages((prev) =>
        prev.map((m) => (m.id === thinkingId ? { ...m, thinking: false, streaming: true, text, priority: answer?.priority } : m)),
      );
    } catch (err) {
      const text = `Sorry, I ran into a problem: ${extractApiError(err)}`;
      setMessages((prev) =>
        prev.map((m) => (m.id === thinkingId ? { ...m, thinking: false, streaming: true, text, priority: 'critical' } : m)),
      );
    } finally {
      setIsThinking(false);
    }
  }, [roleObjects]);

  const sendMessage = useCallback((query) => {
    const trimmed = (query ?? '').trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed, createdAt: new Date().toISOString() }]);
    pushAssistantReply(trimmed);
  }, [pushAssistantReply]);

  const seedAssistantMessage = useCallback((markdown, priority) => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: markdown, streaming: true, priority, createdAt: new Date().toISOString() }]);
  }, []);

  const regenerateLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((prev) => (prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev));
    pushAssistantReply(lastUser.text);
  }, [messages, pushAssistantReply]);

  const clearConversation = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isThinking, sendMessage, seedAssistantMessage, regenerateLast, clearConversation };
};

export default useAICopilot;
