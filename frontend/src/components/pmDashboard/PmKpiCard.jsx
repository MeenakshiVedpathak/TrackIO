import { cn } from '@/utils/cn';

// Compact, static summary tile: tinted icon on the left, value + label stacked on the right.
// Deliberately not interactive (no link/button) - it only reports a number. `tone` picks a
// semantic accent (red/amber/blue/violet/emerald/indigo) so an at-a-glance row can read "this
// one needs attention" before the number is read.
const TONE_STYLES = {
  red: { bar: 'bg-red-500', iconBg: 'bg-red-50 dark:bg-red-950/40', iconColor: 'text-red-600 dark:text-red-400' },
  amber: { bar: 'bg-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-950/40', iconColor: 'text-amber-600 dark:text-amber-400' },
  blue: { bar: 'bg-blue-500', iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-600 dark:text-blue-400' },
  violet: { bar: 'bg-violet-500', iconBg: 'bg-violet-50 dark:bg-violet-950/40', iconColor: 'text-violet-600 dark:text-violet-400' },
  emerald: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  indigo: { bar: 'bg-indigo-500', iconBg: 'bg-indigo-50 dark:bg-indigo-950/40', iconColor: 'text-indigo-600 dark:text-indigo-400' },
};

const PmKpiCard = ({ icon: Icon, title, value, subtext, tone = 'violet' }) => {
  const styles = TONE_STYLES[tone] ?? TONE_STYLES.violet;

  return (
    <div className="relative flex h-full items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-card py-2.5 pl-3.5 pr-2.5 shadow-sm">
      <div className={cn('absolute left-0 top-0 h-full w-[3px]', styles.bar)} />

      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', styles.iconBg)}>
        <Icon className={cn('h-4 w-4', styles.iconColor)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-extrabold leading-tight tabular-nums text-foreground">{value}</p>
        <p className="text-[11px] font-semibold leading-tight text-muted-foreground" title={title}>{title}</p>
        {subtext && (
          <p className="truncate text-[10px] leading-tight text-muted-foreground/80" title={subtext}>{subtext}</p>
        )}
      </div>
    </div>
  );
};

export default PmKpiCard;
