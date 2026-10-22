import { useState } from 'react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import {
  Clock, CalendarCheck, TrendingUp, Target, Plus, BarChart3,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { useAuth } from '@/hooks/useAuth';
import { useEmployeeCalendar, useEmployeeMonthlySummary, useEmployeeEntries } from '@/hooks/useEmployeeWorkLog';
import { STANDARD_MONTHLY_HOURS } from '@/components/employee/MonthlyHoursCard';
import GreetingIllustration from '@/components/employee/dashboard/GreetingIllustration';
import HoursTrendCard from '@/components/employee/dashboard/HoursTrendCard';
import WorkLogStatusCard from '@/components/employee/dashboard/WorkLogStatusCard';
import MonthlyProgressCard from '@/components/employee/dashboard/MonthlyProgressCard';
import ServicePOBreakdownCard from '@/components/employee/dashboard/ServicePOBreakdownCard';
import QuickActionsPanel from '@/components/employee/dashboard/QuickActionsPanel';
import RecentActivityCard from '@/components/employee/dashboard/RecentActivityCard';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { formatHoursMinutes, formatHourMinuteValue } from '@/utils/formatters';
import { classifyWorkDay, isNonWorkingDay } from '@/utils/workDayStatus';

const WORK_LOG_STATUS_DAYS = 5;
const TREND_WEEK_BUCKETS = 4; // 4 x 7 = 28 days, always covered by current + previous month

const TIPS = [
  'Small consistent steps lead to big things.',
  'Consistency beats intensity — log a little every day.',
  'Great work starts with a great log.',
  'Stay on track with your work log.',
];

const getGreeting = (hour) => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// Everything below is derived from the same calendar aggregate the Work Log page already relies
// on (GET /employee-timesheets/calendar), the existing per-PO monthly rollup (GET
// /employee-timesheets/monthly-summary?viewType=month), and the existing flat entries list (GET
// /employee-timesheets/entries) — no new backend endpoints.
//
// Two independent time anchors are in play:
//  - "today" — always the real current date. Drives Today's Hours and the Hours Trend chart
//    (Daily/Weekly), which are "recent activity" concepts, not tied to whichever month is being
//    browsed.
//  - `selectedMonthYear` — the month picker in the header. Drives This Month / Monthly Target /
//    Days Logged / Monthly Progress / Work Log Status / Hours by Service PO / Recent Activity, so
//    picking a past month shows that month's own snapshot for those widgets.
// The previous-month calendar call (relative to "today") is unconditional (not just near month
// boundaries) because the Hours Trend "Weekly" view always needs up to 28 days of look-back, which
// can reach into the previous month on any day of the current one; it also doubles as the
// look-back source for Work Log Status when the CURRENT month is selected and today is early in
// the month (see findSelectedDay).
const EmployeeDashboard = () => {
  const { employee } = useAuth();
  const today = dayjs();
  const todayKey = today.format('YYYY-MM-DD');
  const prevMonthDate = today.subtract(1, 'month');

  const [selectedMonthYear, setSelectedMonthYear] = useState(() => ({
    month: today.month() + 1,
    year: today.year(),
  }));
  const { month: selectedMonth, year: selectedYear } = selectedMonthYear;
  const isCurrentMonthSelected = selectedMonth === today.month() + 1 && selectedYear === today.year();
  const selectedMonthStart = dayjs(new Date(selectedYear, selectedMonth - 1, 1));

  const {
    data: currentMonthDays = [], isLoading, isError,
  } = useEmployeeCalendar(today.month() + 1, today.year());
  const {
    data: prevMonthDays = [], isLoading: isPrevMonthLoading,
  } = useEmployeeCalendar(prevMonthDate.month() + 1, prevMonthDate.year());
  const isTrendLoading = isLoading || isPrevMonthLoading;

  // Same query as `currentMonthDays` above (and cache-shared with it) whenever the current month
  // is selected — React Query dedupes identical query keys, so this only fires a genuinely new
  // request when the user actually picks a different month.
  const {
    data: selectedMonthDays = [], isLoading: isSelectedMonthLoading, isError: isSelectedMonthError,
  } = useEmployeeCalendar(selectedMonth, selectedYear);

  const { data: monthlySummary, isLoading: isMonthlySummaryLoading } =
    useEmployeeMonthlySummary(selectedMonth, selectedYear, 'month');

  const entriesStartDate = selectedMonthStart.format('YYYY-MM-DD');
  const entriesEndDate = selectedMonthStart.endOf('month').format('YYYY-MM-DD');
  const { data: entriesResponse, isLoading: isEntriesLoading } = useEmployeeEntries({
    startDate: entriesStartDate,
    endDate: entriesEndDate,
    limit: 50,
  });

  // Real-time lookup (today/yesterday, Hours Trend) — always anchored to the actual current month.
  const findDay = (key) => currentMonthDays.find((d) => d.date === key) ?? prevMonthDays.find((d) => d.date === key);
  // Month-filtered lookup (Work Log Status). The `prevMonthDays` fallback only ever matters when
  // the current month is selected and the status list's 5-day window reaches into the previous
  // month near the 1st — for a past month, the window always ends on that month's last day, which
  // never needs to look back past its own first day (see workLogStatusDays below).
  const findSelectedDay = (key) => selectedMonthDays.find((d) => d.date === key) ?? prevMonthDays.find((d) => d.date === key);

  const todayHours = Number(findDay(todayKey)?.totalHours ?? 0);
  const yesterdayKey = today.subtract(1, 'day').format('YYYY-MM-DD');
  const yesterdayHours = Number(findDay(yesterdayKey)?.totalHours ?? 0);
  const todayDelta = todayHours - yesterdayHours;

  const dailyTrend = Array.from({ length: 7 }, (_, i) => {
    const date = today.subtract(6 - i, 'day');
    const key = date.format('YYYY-MM-DD');
    const classification = classifyWorkDay(date, findDay(key));
    return {
      key,
      label: `${date.format('ddd')} ${date.date()}`,
      hours: classification.loggedHours,
      isCurrent: key === todayKey,
      workingDays: isNonWorkingDay(classification.status) ? 0 : 1,
      ...classification,
    };
  });

  // Each weekly bucket still sums raw logged hours the same way it always has (a logged
  // Saturday/Sunday was already included in that sum before this change) — the only addition is
  // `workingDays`, a per-bucket count of that week's actual working days (weekday, or a
  // weekend/holiday that got logged), so the card's avg-per-working-day math stays correct across
  // both views without hardcoding "5 working days a week".
  const weeklyTrend = Array.from({ length: TREND_WEEK_BUCKETS }, (_, i) => {
    const bucketEnd = today.subtract((TREND_WEEK_BUCKETS - 1 - i) * 7, 'day');
    const bucketStart = bucketEnd.subtract(6, 'day');
    let sum = 0;
    let workingDays = 0;
    for (let d = 0; d < 7; d += 1) {
      const date = bucketStart.add(d, 'day');
      const classification = classifyWorkDay(date, findDay(date.format('YYYY-MM-DD')));
      sum += classification.loggedHours;
      if (!isNonWorkingDay(classification.status)) workingDays += 1;
    }
    return {
      key: bucketEnd.format('YYYY-MM-DD'),
      label: bucketStart.format('D MMM'),
      hours: sum,
      workingDays,
      isCurrent: i === TREND_WEEK_BUCKETS - 1,
    };
  });

  // For a past month this is always the full month (it's already over); for the current month
  // it's "so far", same as before.
  const monthHours = selectedMonthDays.reduce((sum, d) => sum + Number(d.totalHours || 0), 0);
  const daysElapsedInSelectedMonth = isCurrentMonthSelected ? today.date() : selectedMonthStart.daysInMonth();
  const daysLogged = selectedMonthDays
    .filter((d) => (!isCurrentMonthSelected || d.date <= todayKey) && d.hasEntries).length;
  const monthPct = Math.min(100, Math.round((monthHours / STANDARD_MONTHLY_HOURS) * 100));
  const remainingHours = Math.max(STANDARD_MONTHLY_HOURS - monthHours, 0);
  const dayProgressPct = daysElapsedInSelectedMonth ? Math.round((daysLogged / daysElapsedInSelectedMonth) * 100) : 0;

  // Current month: Today, Yesterday, then weekday names, counting back from today. Past month:
  // the month's own last 5 days, counting back from its last day (weekday names only).
  const statusAnchor = isCurrentMonthSelected ? today : selectedMonthStart.endOf('month');
  const workLogStatusDays = Array.from({ length: WORK_LOG_STATUS_DAYS }, (_, i) => {
    const date = statusAnchor.subtract(i, 'day');
    const key = date.format('YYYY-MM-DD');
    const weekdayLabel = isCurrentMonthSelected && i === 0
      ? 'Today'
      : isCurrentMonthSelected && i === 1
        ? 'Yesterday'
        : date.format('dddd');
    return {
      key,
      weekdayLabel,
      dateLabel: date.format('DD MMM YYYY'),
      ...classifyWorkDay(date, findSelectedDay(key)),
    };
  });

  const servicePORows = (monthlySummary?.service_pos ?? [])
    .map((po) => ({
      id: po.service_po_id,
      name: po.service_po_name,
      hours: Number(po.hours || 0),
      pct: monthlySummary?.total_hours ? (Number(po.hours || 0) / monthlySummary.total_hours) * 100 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const recentEntries = entriesResponse?.data ?? [];

  const displayName = employee?.full_name ?? employee?.email ?? 'there';
  const firstName = displayName.split(' ')[0];
  const greeting = getGreeting(today.hour());
  const tip = TIPS[today.date() % TIPS.length];
  const monthLabelShort = selectedMonthStart.format('MMM YYYY').toUpperCase();
  const monthLabelFull = selectedMonthStart.format('MMMM YYYY');

  const statCards = [
    {
      key: 'today', title: "Today's Hours", icon: Clock,
      bar: 'bg-orange-500', iconBg: 'bg-orange-50 dark:bg-orange-950/40', iconColor: 'text-orange-500',
      badge: 'IN PROGRESS',
      value: formatHoursMinutes(todayHours),
      loading: isLoading,
      extra: (
        <>
          {todayDelta !== 0 && (
            <p className={cn('mt-2 text-xs font-medium', todayDelta > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
              {todayDelta > 0 ? '+' : '-'}{formatHourMinuteValue(Math.abs(todayDelta))}h from yesterday
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Target: 8h</p>
        </>
      ),
    },
    {
      key: 'month', title: 'This Month', icon: TrendingUp,
      bar: 'bg-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-600',
      badge: monthLabelShort,
      value: formatHoursMinutes(monthHours),
      loading: isSelectedMonthLoading,
      extra: (
        <>
          <Progress value={monthPct} className="mt-3 h-1.5" />
          <p className="mt-2 text-xs text-muted-foreground">{monthPct}% of {STANDARD_MONTHLY_HOURS}h target</p>
        </>
      ),
    },
    {
      key: 'target', title: 'Monthly Target', icon: Target,
      bar: 'bg-violet-500', iconBg: 'bg-violet-50 dark:bg-violet-950/40', iconColor: 'text-violet-500',
      value: formatHoursMinutes(STANDARD_MONTHLY_HOURS),
      loading: isSelectedMonthLoading,
      extra: <p className="mt-2 text-xs text-muted-foreground">{formatHoursMinutes(remainingHours)} remaining</p>,
    },
    {
      key: 'logged', title: 'Days Logged', icon: CalendarCheck,
      bar: 'bg-blue-500', iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-500',
      badge: 'THIS MONTH',
      value: `${daysLogged} / ${daysElapsedInSelectedMonth}`,
      loading: isSelectedMonthLoading,
      extra: (
        <>
          <Progress value={dayProgressPct} className="mt-3 h-1.5" />
          <p className="mt-2 text-xs text-muted-foreground">{dayProgressPct}% of days this month</p>
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{greeting}, {firstName} 👋</h1>
          <p className="text-sm text-muted-foreground">Let's keep your work log up to date.</p>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <p className="max-w-[160px] text-right text-xs italic text-muted-foreground">&ldquo;{tip}&rdquo;</p>
          <GreetingIllustration className="h-16 w-28 shrink-0" />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <MonthYearPicker
            value={selectedMonthYear}
            onChange={(v) => v && setSelectedMonthYear(v)}
            clearable={false}
            className="h-9 w-36 rounded-lg text-xs"
          />
          <Link to={ROUTES.EMPLOYEE_TIMESHEET} className={cn(buttonVariants({ size: 'sm' }))}>
            <Plus className="h-4 w-4" /> Log Today's Work
          </Link>
          <Link to={ROUTES.EMPLOYEE_MONTHLY_SUMMARY} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
            <BarChart3 className="h-4 w-4" /> View Monthly Summary
          </Link>
        </div>
      </div>

      {(isError || isSelectedMonthError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load your work log summary. Please try again.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.key} className="relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className={cn('absolute inset-x-0 top-0 h-[3px]', c.bar)} />
            <div className="px-4 pb-4 pt-5">
              <div className="mb-2.5 flex items-start justify-between gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {c.badge && (
                    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      {c.badge}
                    </span>
                  )}
                  <div className={cn('shrink-0 rounded-lg p-1.5', c.iconBg)}>
                    <c.icon className={cn('h-4 w-4', c.iconColor)} />
                  </div>
                </div>
              </div>
              {c.loading ? (
                <>
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold leading-none tracking-tight">{c.value}</p>
                  {c.extra}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HoursTrendCard dailyData={dailyTrend} weeklyData={weeklyTrend} isLoading={isTrendLoading} />
        <WorkLogStatusCard days={workLogStatusDays} monthLabel={monthLabelFull} isLoading={isSelectedMonthLoading} />
        <MonthlyProgressCard
          pct={monthPct}
          monthHours={monthHours}
          remainingHours={remainingHours}
          targetHours={STANDARD_MONTHLY_HOURS}
          isLoading={isSelectedMonthLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <ServicePOBreakdownCard rows={servicePORows} monthLabel={monthLabelFull} isLoading={isMonthlySummaryLoading} />
        </div>
        <QuickActionsPanel />
        <RecentActivityCard entries={recentEntries} isLoading={isEntriesLoading} />
      </div>
    </div>
  );
};

export default EmployeeDashboard;
