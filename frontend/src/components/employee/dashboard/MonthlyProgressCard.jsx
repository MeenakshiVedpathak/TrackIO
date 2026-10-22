import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart } from 'lucide-react';
import { formatHoursMinutes } from '@/utils/formatters';

// Same SVG-ring technique as components/employee/MonthlyHoursCard.jsx (radius/circumference +
// stroke-dashoffset), just bigger and with a legend instead of MonthlyHoursCard's inline value.
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const MonthlyProgressCard = ({ pct = 0, monthHours = 0, remainingHours = 0, targetHours = 0, isLoading }) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  const legend = [
    { label: 'Logged Hours', value: monthHours, dot: 'bg-emerald-500' },
    { label: 'Remaining', value: remainingHours, dot: 'bg-muted-foreground/40' },
    { label: 'Target', value: targetHours, dot: 'bg-primary' },
  ];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PieChart className="h-4 w-4 text-muted-foreground" />
          Monthly Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
            <circle
              cx="56" cy="56" r={RADIUS} fill="none" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="stroke-primary transition-all duration-500"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-xl font-bold leading-none">{pct}%</span>
            <span className="mt-1 text-[10px] text-muted-foreground">Complete</span>
          </div>
        </div>

        <div className="w-full space-y-1.5">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${l.dot}`} />
                {l.label}
              </span>
              <span className="font-semibold">{formatHoursMinutes(l.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthlyProgressCard;
