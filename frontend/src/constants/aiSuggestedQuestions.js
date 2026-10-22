import dayjs from 'dayjs';
import {
  TrendingDown, DollarSign, CalendarClock, GitCompare, ClipboardX,
  Trophy, Users, LineChart, Sparkles,
} from 'lucide-react';

// Single source of truth for the clickable suggestion chips shown in the empty-state
// of the AI Chat panel and inside the proactive Copilot bubble. Each `query` is sent
// verbatim to POST /api/v1/ai/query (see hooks/useAICopilot.js) — the backend's own NLP
// does intent detection, so these just need to read as natural questions.
//
// Timesheets and monthly costs are only uploaded at month-end, so the CURRENT calendar
// month never has real data yet — a question left unqualified (or saying "this month")
// gets silently answered against that empty current month by the backend's own period
// defaulting (see the /api/v1/ai/query docs: unspecified period -> current month). Every
// utilization/timesheet-cadence question below is pinned to the last COMPLETED month
// instead. Budget (PO-lifetime cumulative), client ranking, and bench headcount aren't
// tied to a single month's timesheets the same way, so those are left unqualified.
const lastMonth = dayjs().subtract(1, 'month').format('MMMM');
const twoMonthsAgo = dayjs().subtract(2, 'month').format('MMMM');

export const AI_SUGGESTED_QUESTIONS = [
  { id: 'underutilized', label: 'Who is underutilized?', query: `Who was underutilized in ${lastMonth}?`, icon: TrendingDown },
  { id: 'overbudget', label: 'Projects over budget?', query: 'Which projects are over budget?', icon: DollarSign },
  { id: 'last-month-utilization', label: `Show ${lastMonth} utilization`, query: `Show ${lastMonth} utilization`, icon: CalendarClock },
  { id: 'compare-months', label: `Compare ${twoMonthsAgo} vs ${lastMonth}`, query: `Compare ${twoMonthsAgo} vs ${lastMonth} utilization`, icon: GitCompare },
  { id: 'missed-timesheets', label: 'Who missed timesheets?', query: `Who missed timesheets in ${lastMonth}?`, icon: ClipboardX },
  { id: 'top-clients', label: 'Top clients', query: 'Show top clients', icon: Trophy },
  { id: 'bench', label: 'Bench resources', query: 'Show bench resources', icon: Users },
  { id: 'forecast', label: 'Revenue forecast', query: 'What is the revenue forecast?', icon: LineChart },
  { id: 'recommendations', label: 'Resource recommendations', query: 'Recommend resources for a new project', icon: Sparkles },
];
