import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dayjs from 'dayjs';
import { Bot, X } from 'lucide-react';
import AICopilotBubble from './AICopilotBubble';
import AIChatPanel from './AIChatPanel';
import { useAICopilot } from '@/hooks/useAICopilot';
import { useAuth } from '@/hooks/useAuth';
import { aiCopilotApi } from '@/api/aiCopilot.api';
import { formatGreetingMarkdown } from '@/utils/aiCopilotEngine';
import { cn } from '@/utils/cn';

const BUBBLE_SESSION_KEY = 'rut_ai_copilot_bubble_shown';
const DIGEST_CACHE_KEY = 'rut_ai_copilot_digest_cache';
const BUBBLE_DELAY_MS = 1200;
// Timesheets/costs are only uploaded at month-end, so the current calendar month always
// has zero real data — an unqualified "this month" question gets answered against that
// empty period by the backend's own period defaulting. Ask about the last COMPLETED month.
const DIGEST_QUESTION = `Give me an executive summary for ${dayjs().subtract(1, 'month').format('MMMM YYYY')}`;

// Module-level (not component state) so every mount within the same page load shares ONE
// in-flight request instead of racing — see the comment above the digest useState below for
// why this widget can end up mounting more than once per "session" from the user's perspective.
let sharedDigestPromise = null;

// Single mount point for the whole AI Copilot experience (Features 1 & 3): a floating
// action button, a proactive greeting bubble that surfaces once per session (backed by
// a real POST /api/v1/ai/query executive-summary call, not fabricated numbers), and the
// full chat panel. Mounted once in MainLayout — purely additive, touches no existing
// dashboard/reports/nav code or routes.
const AICopilotWidget = () => {
  const { employee, roleObjects } = useAuth();
  const displayName = employee?.full_name ?? employee?.email?.split('@')[0] ?? 'there';
  const copilot = useAICopilot();
  const widgetRef = useRef(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  // Lazy-init from a sessionStorage cache: MainLayout (and this widget along with it) gets
  // remounted more often than it looks like it should — the app wraps its entire route tree,
  // layout included, in one top-level <Suspense>, so the first visit to any not-yet-loaded
  // lazy page suspends and remounts everything under it, not just that page. Rather than
  // touch that (pre-existing, app-wide routing structure), this widget just makes its own
  // digest fetch remount-proof: once fetched, cache it for the rest of the browser session
  // so a remount reads the cache instead of re-hitting the shared aiLimiter-limited endpoint.
  const [digest, setDigest] = useState(() => {
    try {
      const cached = sessionStorage.getItem(DIGEST_CACHE_KEY);
      return cached ? { loading: false, answer: JSON.parse(cached), error: null } : { loading: true, answer: null, error: null };
    } catch {
      return { loading: true, answer: null, error: null };
    }
  });

  useEffect(() => {
    let timer;
    if (!sessionStorage.getItem(BUBBLE_SESSION_KEY)) {
      timer = setTimeout(() => setBubbleVisible(true), BUBBLE_DELAY_MS);
    }

    if (!sessionStorage.getItem(DIGEST_CACHE_KEY)) {
      if (!sharedDigestPromise) {
        sharedDigestPromise = aiCopilotApi.query({ question: DIGEST_QUESTION, roleId: roleObjects[0]?.id, hoursSource: 'M' })
          .then((res) => res?.data?.answer ?? null)
          .catch(() => null);
      }
      sharedDigestPromise.then((answer) => {
        setDigest({ loading: false, answer, error: answer ? null : true });
        if (answer) {
          try { sessionStorage.setItem(DIGEST_CACHE_KEY, JSON.stringify(answer)); } catch { /* storage full/unavailable — just won't cache */ }
        }
      });
    }

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissBubble = () => {
    setBubbleVisible(false);
    sessionStorage.setItem(BUBBLE_SESSION_KEY, '1');
  };

  const closeChat = () => {
    dismissBubble();
    setChatOpen(false);
  };

  // Click-outside-to-close: only while the chat panel is open. Ignores clicks inside Radix
  // Popover/Select content (e.g. the employee picker in AICopilotHub) — that content renders
  // via a portal straight onto <body>, outside this widget's own DOM subtree, so a plain
  // "is the click inside my container" check would otherwise treat picking an option as an
  // outside click and close the whole panel out from under it.
  useEffect(() => {
    if (!chatOpen) return undefined;

    const handlePointerDown = (e) => {
      if (widgetRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-radix-popper-content-wrapper]')) return;
      closeChat();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  const openChatFromBubble = () => {
    if (copilot.messages.length === 0) {
      if (digest.answer) {
        copilot.seedAssistantMessage(formatGreetingMarkdown(displayName, digest.answer), digest.answer.priority);
      } else {
        copilot.seedAssistantMessage(`Hi ${displayName}, ask me anything about utilization, budget, bench, or timesheets.`);
      }
    }
    dismissBubble();
    setChatOpen(true);
  };

  const toggleChat = () => {
    dismissBubble();
    setChatOpen((prev) => !prev);
  };

  return (
    <div ref={widgetRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {chatOpen && (
          <AIChatPanel key="chat-panel" copilot={copilot} onClose={closeChat} />
        )}
        {!chatOpen && bubbleVisible && (
          <AICopilotBubble
            key="copilot-bubble"
            displayName={displayName}
            digest={digest}
            onViewDetails={openChatFromBubble}
            onDismiss={dismissBubble}
          />
        )}
      </AnimatePresence>

      <motion.button
        onClick={toggleChat}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'relative h-14 w-14 rounded-2xl shadow-xl flex items-center justify-center shrink-0',
          'text-white',
        )}
        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5 55%, #2563eb)' }}
        title="AI Copilot"
      >
        {!chatOpen && (
          <motion.span
            className="absolute inset-0 rounded-2xl"
            animate={{ boxShadow: ['0 0 0 0 rgba(124,58,237,0.35)', '0 0 0 10px rgba(124,58,237,0)', '0 0 0 0 rgba(124,58,237,0)'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {chatOpen ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </motion.button>
    </div>
  );
};

export default AICopilotWidget;
