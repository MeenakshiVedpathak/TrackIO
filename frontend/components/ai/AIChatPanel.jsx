import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, X, Send, Trash2, Mic, LayoutGrid, MessageSquare } from 'lucide-react';
import ChatMessage from './ChatMessage';
import SuggestedQuestions from './SuggestedQuestions';
import AICopilotHub from './AICopilotHub';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { cn } from '@/utils/cn';

const AIChatPanel = ({ copilot, onClose, className }) => {
  const { messages, isThinking, sendMessage, regenerateLast, clearConversation } = copilot;
  const [input, setInput] = useState('');
  const [view, setView] = useState('chat'); // 'chat' | 'hub'
  const scrollAnchorRef = useRef(null);

  // Feature 11 — Voice Search: speak a question, it's asked immediately (no extra tap).
  const speech = useSpeechRecognition({ onResult: (transcript) => sendMessage(transcript) });

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const trimmedLength = input.trim().length;
  const canSend = trimmedLength >= 3 && trimmedLength <= 500 && !isThinking;

  const handleSend = () => {
    if (!canSend) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className={cn(
        'flex flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden',
        'w-[92vw] max-w-[400px] h-[min(600px,75vh)]',
        className,
      )}
    >
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(120deg, #7c3aed, #4f46e5 55%, #2563eb)' }} />
        <div className="relative flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">AI Copilot</p>
              <p className="text-[10px] text-white/75 mt-1">Ask about utilization, budget, bench &amp; more</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setView((v) => (v === 'chat' ? 'hub' : 'chat'))}
              title={view === 'chat' ? 'Explore AI Copilot pages' : 'Back to chat'}
              className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 active:bg-white/25 transition-colors touch-manipulation"
            >
              {view === 'chat' ? <LayoutGrid className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={clearConversation}
              title="Clear conversation"
              className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 active:bg-white/25 transition-colors touch-manipulation"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 active:bg-white/25 transition-colors touch-manipulation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {view === 'hub' ? (
        <ScrollArea className="flex-1 min-h-0">
          <AICopilotHub onNavigated={onClose} />
        </ScrollArea>
      ) : (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-6">
                  <Bot className="h-6 w-6 text-primary mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">How can I help?</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Try one of these, or type your own question below.</p>
                  <SuggestedQuestions onSelect={sendMessage} className="justify-center" />
                </div>
              ) : (
                messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    isLast={m.id === lastAssistantId}
                    onRegenerate={m.id === lastAssistantId && !isThinking ? regenerateLast : undefined}
                  />
                ))
              )}
              <div ref={scrollAnchorRef} />
            </div>
          </ScrollArea>

          {/* Suggested questions strip (only once conversation has started) */}
          {messages.length > 0 && (
            <div className="shrink-0 px-3 pt-2 border-t overflow-x-auto">
              <SuggestedQuestions onSelect={sendMessage} disabled={isThinking} limit={4} className="flex-nowrap pb-2" />
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t p-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about utilization, budget, bench..."
              rows={1}
              maxLength={500}
              className="flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-24"
            />
            {speech.supported && (
              <Button
                size="icon"
                variant={speech.listening ? 'destructive' : 'outline'}
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                disabled={isThinking}
                title={speech.listening ? 'Stop listening' : 'Ask by voice'}
                className="shrink-0 rounded-xl"
              >
                <Mic className={cn('h-4 w-4', speech.listening && 'animate-pulse')} />
              </Button>
            )}
            <Button size="icon" onClick={handleSend} disabled={!canSend} className="shrink-0 rounded-xl">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="shrink-0 pb-2 text-center text-[10px] text-muted-foreground">
            AI Copilot can make mistakes. Check important info.
          </p>
        </>
      )}
    </motion.div>
  );
};

export default AIChatPanel;
