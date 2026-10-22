import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatPercentage } from '@/utils/formatters';
import { cn } from '@/utils/cn';

export const utilizationColorClass = (value) => {
  if (value == null) return 'text-muted-foreground';
  const num = Number(value);
  if (num >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (num >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
};

// Shared between PM-wise and Project-wise Utilization — `total_available_hours` reads 0 until
// Resource Budgets (PO Master) are entered for the selected period, a real upstream data gap
// rather than a loading bug. Showing "0%" in that case reads as "completely unutilized," which is
// actively misleading when hours were genuinely logged with nothing yet to divide them against.
// A tooltip explains why instead of silently hiding the row or showing a wrong number.
export const UtilizationCell = ({ utilizationPct, totalAvailableHours, totalLoggedHours }) => {
  const noBudgetYet = !totalAvailableHours && Number(totalLoggedHours) > 0;
  if (noBudgetYet) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted-foreground underline decoration-dotted underline-offset-2">—</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          Resource Budget hasn&apos;t been entered for this period yet, so utilization can&apos;t
          be calculated even though hours were logged.
        </TooltipContent>
      </Tooltip>
    );
  }
  if (utilizationPct == null || utilizationPct === '') return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('tabular-nums font-medium', utilizationColorClass(utilizationPct))}>
      {formatPercentage(utilizationPct, 1)}
    </span>
  );
};

export default UtilizationCell;
