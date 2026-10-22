import { Clock, Timer, FolderKanban } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatHoursMinutes } from '@/utils/formatters';
import { EXPECTED_DAILY_HOURS } from './WorkLogEntryModal';

// One `border` wrapper per tile (not two) — the mobile/desktop variants below are its only
// children, swapped via `md:hidden`/`hidden md:flex`, so each tile stays a single grid item
// instead of two competing ones (a Fragment returning both would double the grid's child count
// and break the 3-column layout).
const StatTile = ({ icon: Icon, iconClassName, label, value, sub }) => (
  <div className="rounded-lg border">
    {/* Mobile — compact enough for all three to share one row: icon + value + label stacked and
        centered, no `sub` line (there isn't room for it at this width). */}
    <div className="flex flex-col items-center gap-1 px-2 py-2 text-center md:hidden">
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', iconClassName)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="truncate text-sm font-semibold leading-tight">{value}</p>
      <p className="truncate text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>

    {/* Desktop — unchanged original layout. */}
    <div className="hidden items-center gap-3 px-3 py-2.5 md:flex">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconClassName)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
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
      <div className="grid grid-cols-3 gap-2 md:gap-3">
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
