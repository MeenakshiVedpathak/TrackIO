import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight, CalendarCheck, CalendarOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';

// `days` is `[{key, weekdayLabel, dateLabel, status, loggedHours, isWeekend, isHoliday,
// hasWorkLog}]`, most recent first (Today, Yesterday, then weekday names) — `status` comes from
// the same classifyWorkDay() call the Hours Trend chart uses (see EmployeeDashboard.jsx), so a
// weekend/holiday only ever shows as such when nothing was actually logged that day; a logged
// Saturday/Sunday shows exactly like any other logged day.
const WorkLogStatusCard = ({ days = [], monthLabel, isLoading }) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          Work Log Status
        </CardTitle>
        <span className="text-xs text-muted-foreground">{monthLabel}</span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex-1 space-y-1">
          {days.map((d) => (
            <div key={d.key} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <div>
                <p className="text-sm font-medium leading-tight">{d.weekdayLabel}</p>
                <p className="text-[11px] text-muted-foreground">{d.dateLabel}</p>
              </div>
              {d.status === 'logged' && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Logged
                </Badge>
              )}
              {(d.status === 'weekend' || d.status === 'holiday') && (
                <Badge variant="muted" className="gap-1">
                  <CalendarOff className="h-3 w-3" /> {d.status === 'holiday' ? 'Holiday' : 'Weekend'}
                </Badge>
              )}
              {d.status === 'no-work-log' && (
                <Badge variant="muted" className="gap-1">
                  <XCircle className="h-3 w-3" /> No work log
                </Badge>
              )}
            </div>
          ))}
        </div>
        <Link
          to={ROUTES.EMPLOYEE_TIMESHEET}
          className="mt-3 flex items-center justify-center gap-1 border-t pt-3 text-xs font-semibold text-primary hover:underline"
        >
          View My Work Log <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
};

export default WorkLogStatusCard;
