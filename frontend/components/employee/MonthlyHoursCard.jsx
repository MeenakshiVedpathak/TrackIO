import { useMemo } from 'react';
import { formatHoursMinutes } from '@/utils/formatters';

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Fixed standard monthly hours target (22 working days x 8 hrs) — not derived from the actual
// number of weekdays in the given month, since the backend has no monthly-target concept.
// Exported so other employee-facing views (e.g. the dashboard) share this one target instead of
// redefining the same magic number.
export const STANDARD_MONTHLY_HOURS = 176;

// Sums the same per-day `totalHours` the calendar heatmap reads (GET /employee-timesheets/
// calendar) against the fixed standard monthly target above.
const MonthlyHoursCard = ({ calendarDays }) => {
  const workedHours = useMemo(
    () => calendarDays.reduce((sum, d) => sum + Number(d.totalHours || 0), 0),
    [calendarDays]
  );

  const targetHours = STANDARD_MONTHLY_HOURS;

  const pct = targetHours ? Math.min(100, Math.round((workedHours / targetHours) * 100)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">This Month</p>
        <p className="text-lg font-bold leading-tight">
          {formatHoursMinutes(workedHours)} / {formatHoursMinutes(targetHours)}
        </p>
        <p className="text-xs text-muted-foreground">Logged</p>
      </div>

      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
          <circle cx="28" cy="28" r={RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="28" cy="28" r={RADIUS} fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="stroke-primary transition-all"
          />
        </svg>
        <span className="absolute text-xs font-semibold">{pct}%</span>
      </div>
    </div>
  );
};

export default MonthlyHoursCard;
