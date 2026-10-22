import { Link } from 'react-router-dom';
import { ListChecks, Hourglass, Table2, XCircle, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';

const ACTIONS = [
  {
    key: 'log-work', label: "Log Today's Work", description: 'Add or review your entries',
    icon: ListChecks, to: ROUTES.EMPLOYEE_TIMESHEET,
    iconBg: 'bg-primary/10 text-primary',
  },
  {
    key: 'time-entry', label: 'Time Entry', description: 'Fill or edit custom dates',
    icon: Hourglass, to: ROUTES.EMPLOYEE_TIME_ENTRY,
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
  },
  {
    key: 'monthly-summary', label: 'Monthly Summary', description: 'See hours by Service PO',
    icon: Table2, to: ROUTES.EMPLOYEE_MONTHLY_SUMMARY,
    iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
  },
  {
    key: 'rejected-entries', label: 'Rejected Entries', description: 'Check and update rejected logs',
    icon: XCircle, to: ROUTES.EMPLOYEE_REJECTED_ENTRIES,
    iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  },
];

const QuickActionsPanel = () => (
  <Card className="flex h-full flex-col">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Zap className="h-4 w-4 text-muted-foreground" />
        Quick Actions
      </CardTitle>
    </CardHeader>
    <CardContent className="grid flex-1 grid-cols-2 gap-3">
      {ACTIONS.map((a) => (
        <Link
          key={a.key}
          to={a.to}
          className="flex flex-col gap-2 rounded-xl border p-3 transition-colors hover:bg-muted/50"
        >
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', a.iconBg)}>
            <a.icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold leading-tight">{a.label}</span>
          <span className="text-[11px] leading-tight text-muted-foreground">{a.description}</span>
        </Link>
      ))}
    </CardContent>
  </Card>
);

export default QuickActionsPanel;
