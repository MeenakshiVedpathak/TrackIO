import { Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import { formatHoursMinutes } from '@/utils/formatters';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// One tile per calendar month (1-12), showing that month's total logged hours underneath.
// `monthStats[month]` is `{ hours, eligible, isLoading }` — `eligible` comes straight from the
// backend's GET /employee-timesheets/monthly response and is never computed here. A month
// stays selectable even when ineligible (so it can still be viewed read-only); only the lock
// icon + dimming signal it can't be edited/saved.
const MonthSelector = ({ selectedMonth, onSelectMonth, monthStats = {} }) => (
  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-3">
    {MONTH_LABELS.map((label, i) => {
      const month = i + 1;
      const stat = monthStats[month];
      const isSelected = month === selectedMonth;
      const isIneligible = stat?.eligible === false;

      return (
        <button
          key={month}
          type="button"
          onClick={() => onSelectMonth(month)}
          className={cn(
            'flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-xs transition-colors',
            isSelected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'hover:bg-muted/60',
            isIneligible && !isSelected && 'opacity-50'
          )}
        >
          <span className="flex items-center gap-1 font-semibold">
            {label}
            {isIneligible && <Lock className="h-3 w-3" />}
          </span>
          {stat?.isLoading ? (
            <Skeleton className="h-2.5 w-8" />
          ) : (
            <span className={cn('text-[11px]', isSelected ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
              {formatHoursMinutes(stat?.hours)}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default MonthSelector;
