import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { ROUTES } from '@/constants/routes';
import { formatHoursMinutes, formatPercentage } from '@/utils/formatters';

// `rows` is `[{id, name, hours, pct}]`, already sorted by hours desc — sourced from
// GET /employee-timesheets/monthly-summary?viewType=month (see useEmployeeMonthlySummary),
// which rolls up hours per Service PO for the whole month server-side.
const ServicePOBreakdownCard = ({ rows = [], monthLabel, isLoading }) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader><Skeleton className="h-5 w-44" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Hours by Service PO
        </CardTitle>
        <span className="text-xs text-muted-foreground">{monthLabel}</span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No hours logged yet"
            description="Hours by Service PO will appear once you log work this month."
            className="flex-1 justify-center py-8"
          />
        ) : (
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-[1fr_auto_3.5rem] gap-x-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Service PO</span>
              <span className="text-right">Hours</span>
              <span className="text-right">% of Total</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="space-y-1">
                <div className="grid grid-cols-[1fr_auto_3.5rem] items-center gap-x-4 text-sm">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="tabular-nums text-right text-muted-foreground">{formatHoursMinutes(r.hours)}</span>
                  <span className="tabular-nums text-right text-muted-foreground">{formatPercentage(r.pct, 0)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <Link
          to={ROUTES.EMPLOYEE_MONTHLY_SUMMARY}
          className="mt-4 flex items-center justify-center gap-1 border-t pt-3 text-xs font-semibold text-primary hover:underline"
        >
          View Full Summary <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
};

export default ServicePOBreakdownCard;
