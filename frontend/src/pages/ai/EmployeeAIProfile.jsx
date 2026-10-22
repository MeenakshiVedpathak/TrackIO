import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Briefcase, Clock, TrendingUp, Lightbulb, CalendarDays, GraduationCap } from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import PriorityBadge from '@/components/ai/PriorityBadge';
import { useAIQuery } from '@/hooks/useAIQuery';
import { useEmployee } from '@/hooks/useEmployees';
import { useResourceProjectUtilization } from '@/hooks/useReports';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatHours, formatMonthYear, getInitials } from '@/utils/formatters';
import { ROUTES, buildPath } from '@/constants/routes';

const now = new Date();
// Last 3 COMPLETED calendar months, oldest first — timesheets are only uploaded at
// month-end, so the current calendar month (offset 0) always has zero real data and would
// show as a fake "drop" at the end of the trend. Offsets start at 3, not 0.
const TREND_MONTHS = [3, 2, 1].map((offset) => {
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
});
const LAST_MONTH_LABEL = formatMonthYear(TREND_MONTHS[2].month, TREND_MONTHS[2].year);

const useEmployeeMonth = (employeeId, month, year) => {
  const { roleObjects } = useAuth();
  const { data, isPending } = useResourceProjectUtilization({
    month, year, employeeIds: employeeId ? String(employeeId) : undefined,
    roleId: roleObjects[0]?.id, hoursSource: 'M', page: 1, limit: 5,
  });
  const rows = Array.isArray(data?.data) ? data.data : [];
  const row = rows.find((r) => String(r.employeeId ?? r.employee_id) === String(employeeId)) ?? rows[0];
  return { row, isPending };
};

const EmployeeAIProfile = () => {
  const { id } = useParams();
  const { data: employee, isPending: employeeLoading } = useEmployee(id);
  const perf = useAIQuery();

  // Unrolled (not .map) — TREND_MONTHS has a fixed length of 3, but calling a hook from
  // inside an array callback trips eslint's rules-of-hooks static check even though the
  // call order is stable every render.
  const month0 = useEmployeeMonth(id, TREND_MONTHS[0].month, TREND_MONTHS[0].year);
  const month1 = useEmployeeMonth(id, TREND_MONTHS[1].month, TREND_MONTHS[1].year);
  const month2 = useEmployeeMonth(id, TREND_MONTHS[2].month, TREND_MONTHS[2].year);
  const months = [month0, month1, month2];
  const latest = months[months.length - 1];

  useEffect(() => {
    if (employee?.full_name) {
      perf.ask(`How did ${employee.full_name} perform in ${LAST_MONTH_LABEL} and what would you recommend for them?`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.full_name]);

  const trendData = months.map((m, i) => ({ ...TREND_MONTHS[i], totalHours: Number(m.row?.totalHours ?? 0) }));
  const maxTrend = Math.max(1, ...trendData.map((t) => t.totalHours));

  const projects = latest.row?.projects ?? [];

  return (
    <div className="pb-8">
      <AIPageHeader
        title={employeeLoading ? 'Employee AI Profile' : (employee?.full_name ?? 'Employee AI Profile')}
        description={employee?.designation ?? 'Employee AI Profile'}
        backTo={ROUTES.EMPLOYEES}
        backLabel="Back to Employees"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-primary" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {employeeLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-medium">{employee?.employee_code ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={employee?.status === 'active' ? 'success' : 'muted'} className="capitalize">{employee?.status ?? '—'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Experience</span>
                  <span className="font-medium">{employee?.total_experience != null ? `${employee.total_experience} yrs` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">With Company</span>
                  <span className="font-medium">{employee?.company_experience != null ? `${employee.company_experience} yrs` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Joined</span>
                  <span className="font-medium">{formatDate(employee?.date_of_joining)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground italic pt-1 border-t">
                  Skills tracked via designation/experience — Employee Master has no dedicated skills field yet.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary" /> Performance Trend — Total Hours (last 3 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 h-32">
              {trendData.map((t) => (
                <div key={`${t.month}-${t.year}`} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-xs font-semibold tabular-nums">{formatHours(t.totalHours)}</span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-violet-600 to-blue-500 min-h-[4px]"
                    style={{ height: `${Math.max(4, (t.totalHours / maxTrend) * 100)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{formatMonthYear(t.month, t.year)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-primary" /> Projects ({LAST_MONTH_LABEL})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {latest.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : projects.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No project hours logged in {LAST_MONTH_LABEL}.</p>
            ) : projects.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{p.projectName ?? '—'}</span>
                <span className="font-semibold tabular-nums shrink-0">{formatHours(p.projectHours)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" /> Last Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Hours</span>
              <span className="font-semibold">{formatHours(latest.row?.totalHours)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Period</span>
              <span className="font-medium">{formatMonthYear(TREND_MONTHS[2].month, TREND_MONTHS[2].year)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-primary" /> AI Recommendations</CardTitle>
          <PriorityBadge priority={perf.answer?.priority} />
        </CardHeader>
        <CardContent className="space-y-2">
          {perf.loading ? (
            <Skeleton className="h-16 w-full" />
          ) : perf.error ? (
            <p className="text-sm text-destructive">{perf.error}</p>
          ) : (
            <>
              <p className="text-sm text-foreground/85 leading-relaxed">{perf.answer?.summary}</p>
              {perf.answer?.actions?.map((a, i) => (
                <p key={i} className="text-sm text-foreground/85">• {a}</p>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeAIProfile;
