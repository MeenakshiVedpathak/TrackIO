import { motion } from 'framer-motion';
import { Bot, X, ArrowRight } from 'lucide-react';

const AICopilotBubble = ({ displayName, digest, onViewDetails, onDismiss }) => {
  const hasSummary = !digest?.loading && !digest?.error && digest?.answer?.summary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 340, damping: 26 }}
      className="w-[86vw] max-w-[320px] rounded-2xl border bg-card shadow-2xl overflow-hidden"
    >
      <div className="flex items-start gap-2.5 p-4">
        <div className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Hi {displayName || 'there'},</p>

          {digest?.loading ? (
            <div className="space-y-1.5 mt-2">
              <div className="h-2.5 w-full rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-4/5 rounded bg-muted animate-pulse" />
            </div>
          ) : hasSummary ? (
            <p className="text-xs text-foreground/85 mt-1.5 line-clamp-4">{digest.answer.summary}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5">
              Ask me about utilization, budget, bench, or timesheets.
            </p>
          )}

          <button
            onClick={onViewDetails}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {hasSummary ? 'Would you like details?' : 'Start chatting'} <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <button
          onClick={onDismiss}
          className="h-6 w-6 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
};

export default AICopilotBubble;
