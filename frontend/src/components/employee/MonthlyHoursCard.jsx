import { useMemo } from 'react';
import { formatHoursMinutes, sumHours } from '@/utils/formatters';
import { useEmployeeMonthlyCap } from '@/hooks/useSystemSettings';

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Sums the same per-day `totalHours` the calendar heatmap reads (GET /employee-timesheets/
// calendar) against the cap THIS employee's own synced timesheet used for that month — GET
// /system-settings/monthly-cap?month=&year= → `cap_for_employee_month` (falls back to the latest
// Admin-set cap if nothing has synced for them yet for that month).
const MonthlyHoursCard = ({ month, year, calendarDays }) => {
  const workedHours = useMemo(
    () => sumHours(calendarDays.map((d) => d.totalHours)),
    [calendarDays]
  );

  const targetHours = useEmployeeMonthlyCap(month && year ? { month, year } : undefined);

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
