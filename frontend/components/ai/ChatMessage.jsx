import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Copy, RotateCcw, Check } from 'lucide-react';
import MarkdownLite from './MarkdownLite';
import TypingDots from './TypingDots';
import { useNotification } from '@/hooks/useNotification';
import { cn } from '@/utils/cn';

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Same severity language as pages/AIInsights.jsx, applied to the answer.priority
// the AI Copilot API returns (critical | warning | info) — keeps the two AI
// surfaces visually consistent.
const PRIORITY_BAR = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

// Reveals assistant text word-by-word to simulate a live-typed response — purely
// cosmetic, the full answer is already known (see aiCopilotEngine.js).
const useTypewriter = (fullText, enabled) => {
  const [revealed, setRevealed] = useState(enabled ? '' : fullText);
  const doneRef = useRef(!enabled);

  useEffect(() => {
    if (!enabled) {
      setRevealed(fullText);
      return undefined;
    }
    doneRef.current = false;
    const words = fullText.split(' ');
    let idx = 0;
    setRevealed('');
    const id = setInterval(() => {
      idx += 1;
      setRevealed(words.slice(0, idx).join(' '));
      if (idx >= words.length) {
        clearInterval(id);
        doneRef.current = true;
      }
    }, 18);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, enabled]);

  return revealed;
};

const ChatMessage = ({ message, isLast, onRegenerate }) => {
  const { success } = useNotification();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isThinking = !isUser && message.thinking;
  const revealed = useTypewriter(message.text ?? '', !isUser && message.streaming);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text ?? '');
      setCopied(true);
      success('Copied to clipboard.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore, not worth surfacing an error toast
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2.5 text-sm shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <div className="h-7 w-7 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-sm">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative rounded-2xl rounded-tl-md border bg-card px-3.5 py-3 shadow-sm overflow-hidden">
          {message.priority && PRIORITY_BAR[message.priority] && (
            <span className={cn('absolute inset-y-0 left-0 w-[3px]', PRIORITY_BAR[message.priority])} />
          )}
          {isThinking ? (
            <TypingDots />
          ) : (
            <MarkdownLite text={revealed} />
          )}
        </div>
        {!isThinking && (
          <div className="flex items-center gap-3 mt-1 pl-1">
            <span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isLast && onRegenerate && (
              <button
                onClick={onRegenerate}
                className={cn('inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors')}
              >
                <RotateCcw className="h-3 w-3" />
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
