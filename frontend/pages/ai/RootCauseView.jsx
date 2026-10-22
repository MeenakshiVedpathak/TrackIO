import { useState } from 'react';
import dayjs from 'dayjs';
import {
  AlertCircle, DollarSign, Activity, Clock, Building2, Search,
  ListChecks, Lightbulb, TriangleAlert,
} from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import PriorityBadge from '@/components/ai/PriorityBadge';
import MarkdownLite from '@/components/ai/MarkdownLite';
import { useAIQuery } from '@/hooks/useAIQuery';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

// Timesheets are only uploaded at month-end, so the current calendar month never has real
// data — an unqualified question (or one saying "this month") gets answered against that
// empty current month by the backend's own period defaulting. Utilization and timesheet
// compliance are both monthly-cadence, so both pin to the last COMPLETED month explicitly.
const lastMonth = dayjs().subtract(1, 'month').format('MMMM');

// Each topic is a natural-language question mapped to a supported /api/v1/ai/query intent
// (bench, cost, utilization, timesheet, client) — the "Issue" a user picks drives the
// question; the AI's summary/findings/actions become Root Cause/Impact/Recommendation.
const TOPICS = [
  { id: 'bench', label: 'Bench Escalation', icon: AlertCircle, question: 'Why are so many resources on the bench right now?' },
  { id: 'budget', label: 'Budget Overrun', icon: DollarSign, question: 'Why are our projects going over budget?' },
  { id: 'utilization', label: 'Utilization Anomaly', icon: Activity, question: `Why was utilization low in ${lastMonth}?` },
  { id: 'timesheet', label: 'Timesheet Compliance', icon: Clock, question: `Why weren't timesheets submitted on time in ${lastMonth}?` },
  { id: 'client', label: 'Client Concentration', icon: Building2, question: 'Which clients are we most dependent on and why is that a risk?' },
];

const RootCauseView = () => {
  const [activeTopic, setActiveTopic] = useState(null);
  const { loading, answer, error, ask } = useAIQuery();

  const selectTopic = (topic) => {
    setActiveTopic(topic);
    ask(topic.question);
  };

  return (
    <div className="pb-8">
      <AIPageHeader title="Root Cause View" description="Pick an issue to see what's driving it, its impact, and what to do about it." />

      <div className="flex flex-wrap gap-2 mb-6">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTopic(t)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              activeTopic?.id === t.id
                ? 'border-transparent text-white shadow-sm'
                : 'bg-card hover:border-primary/40 hover:bg-primary/5',
            )}
            style={activeTopic?.id === t.id ? { background: 'linear-gradient(120deg, #7c3aed, #4f46e5 55%, #2563eb)' } : undefined}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {!activeTopic && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
          Pick an issue above to investigate its root cause.
        </div>
      )}

      {activeTopic && loading && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      )}

      {activeTopic && !loading && error && (
        <Card className="border-destructive/30">
          <CardContent className="p-5 flex items-start gap-3">
            <TriangleAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {activeTopic && !loading && !error && answer && (
        <Card className="overflow-hidden">
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5 55%, #2563eb)' }} />
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <activeTopic.icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue</span>
                <span className="text-sm font-bold">{activeTopic.label}</span>
              </div>
              <PriorityBadge priority={answer.priority} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Root Cause</p>
              <p className="text-sm leading-relaxed">{answer.summary}</p>
            </div>

            {answer.findings?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Impact
                </p>
                <MarkdownLite text={answer.findings.map((f) => `- ${f}`).join('\n')} />
              </div>
            )}

            {answer.actions?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" /> Recommendation
                </p>
                <MarkdownLite text={answer.actions.map((a) => `- ${a}`).join('\n')} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RootCauseView;
