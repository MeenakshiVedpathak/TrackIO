import dayjs from 'dayjs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatters';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ num: i + 1, label: dayjs().month(i).format('MMM') }));

// One tile per calendar month for the given year — summary totals only, clicking a tile is how
// the user picks which month's PO cards render below. `currentMonth`/`currentYear` mark today's
// real period with a dot, independent of which tile is currently selected. `totalPOCount`, when
// known, turns the entry count into "x/y filled" instead of a bare count.
const MonthSummaryStrip = ({
  year, summaries, selectedMonth, onSelectMonth, currentMonth, currentYear, totalPOCount = 0,
}) => {
  const byMonth = new Map(summaries.map((s) => [s.month, s]));
  const isCurrentYear = year === currentYear;

  return (
    <div className="flex gap-1.5 overflow-x-auto p-1 -m-1">
      {MONTHS.map(({ num, label }) => {
        const summary = byMonth.get(num);
        const isSelected = num === selectedMonth;
        const isToday = isCurrentYear && num === currentMonth;

        return (
          <button
            key={num}
            type="button"
            onClick={() => onSelectMonth(num)}
            className={cn(
              'flex w-[92px] shrink-0 flex-col items-start gap-1 rounded-xl border p-2 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring',
              isSelected
                ? 'relative z-10 border-primary bg-gradient-to-br from-primary/15 to-primary/5 shadow-lg shadow-primary/20 ring-2 ring-primary'
                : 'border-primary/20 bg-primary/5 shadow-sm hover:border-primary/50 hover:bg-primary/10 hover:shadow-md'
            )}
          >
            <div className="flex w-full items-center justify-between gap-1">
              <span className={cn('text-xs', isSelected ? 'font-bold text-primary' : 'font-semibold text-foreground')}>
                {label}
              </span>
              {isToday && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </div>

            {!summary || summary.isLoading ? (
              <div className="w-full space-y-1">
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-2.5 w-2/3" />
              </div>
            ) : summary.filledCount > 0 ? (
              <div className="w-full space-y-0.5">
                <p
                  className="flex items-baseline gap-1 truncate text-[11px] font-semibold tabular-nums"
                  title={`Invoice ${formatCurrency(summary.invoiceTotal)}`}
                >
                  <span className="shrink-0 text-[9px] font-medium text-muted-foreground">Inv</span>
                  <span className="truncate">{formatCurrency(summary.invoiceTotal, 'INR', 0)}</span>
                </p>
                <p
                  className="flex items-baseline gap-1 truncate text-[10px] tabular-nums text-muted-foreground"
                  title={`Billed ${formatCurrency(summary.billedTotal)}`}
                >
                  <span className="shrink-0 text-[9px] font-medium">Bil</span>
                  <span className="truncate">{formatCurrency(summary.billedTotal, 'INR', 0)}</span>
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {totalPOCount > 0 ? `${summary.filledCount}/${totalPOCount}` : summary.filledCount}
                </p>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">No entries</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default MonthSummaryStrip;
