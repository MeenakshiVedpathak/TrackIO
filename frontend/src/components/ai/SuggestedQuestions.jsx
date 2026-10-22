import { AI_SUGGESTED_QUESTIONS } from '@/constants/aiSuggestedQuestions';
import { cn } from '@/utils/cn';

const SuggestedQuestions = ({ onSelect, disabled, className, limit }) => {
  const items = limit ? AI_SUGGESTED_QUESTIONS.slice(0, limit) : AI_SUGGESTED_QUESTIONS;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((q) => (
        <button
          key={q.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(q.query)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <q.icon className="h-3 w-3 text-primary shrink-0" />
          {q.label}
        </button>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
