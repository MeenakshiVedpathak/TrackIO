import { Clock, Timer, FolderKanban } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatHoursMinutes } from '@/utils/formatters';
import { EXPECTED_DAILY_HOURS } from './WorkLogEntryModal';

const StatTile = ({ icon: Icon, iconClassName, label, value, sub }) => (
  <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconClassName)}>
      <Icon className="h-4 w-4" />
    </span>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-base font-semibold leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  </div>
);

// Worked/Remaining/Progress are all read against EXPECTED_DAILY_HOURS, a client-side standard
// workday — the backend has no daily target field. "Projects" counts every Service PO mapped to
// the employee, regardless of whether any hours are logged against it today.
const WorkLogDaySummary = ({ totalHours, projectsCount }) => {
  const remaining = Math.max(EXPECTED_DAILY_HOURS - totalHours, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          icon={Clock}
          iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
          label="Worked"
          value={formatHoursMinutes(totalHours)}
          sub={`of ${formatHoursMinutes(EXPECTED_DAILY_HOURS)}`}
        />
        <StatTile
          icon={Timer}
          iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
          label="Remaining"
          value={formatHoursMinutes(remaining)}
          sub="to complete"
        />
        <StatTile
          icon={FolderKanban}
          iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
          label="Projects"
          value={projectsCount}
          sub="mapped"
        />
      </div>
    </div>
  );
};

export default WorkLogDaySummary;
