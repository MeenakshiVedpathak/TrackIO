import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Activity, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { formatDate, formatDateTime, formatHourMinuteValue } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const STATUS_META = {
  rejected: { icon: XCircle, dot: 'bg-destructive' },
  pending: { icon: Clock3, dot: 'bg-amber-500' },
  approved: { icon: CheckCircle2, dot: 'bg-emerald-500' },
  synced: { icon: CheckCircle2, dot: 'bg-emerald-500' },
};

const RECENT_ACTIVITY_LIMIT = 6;

// `entries` is the raw GET /employee-timesheets/entries `data` array (real EmployeeWorkLog rows,
// each carrying a genuine `created_at`/`updated_at` timestamp and a nested `servicePO` object —
// see EmployeeDashboard.jsx). No login/page-view events here by design (nothing tracks those
// server-side today) — only real "logged"/"rejected" work-log events, newest first.
const RecentActivityCard = ({ entries = [], isLoading }) => {
  const activity = useMemo(() => entries
    .map((e) => {
      const isRejected = e.status === 'rejected';
      const timestamp = isRejected ? (e.rejected_at ?? e.updated_at ?? e.created_at) : (e.created_at ?? e.updated_at);
      const poName = e.servicePO?.service_po_name ?? 'work log';
      const text = isRejected
        ? `Entry rejected · ${poName}`
        : `Logged ${formatHourMinuteValue(e.hours)}h on ${poName}`;
      // The date the hours were LOGGED FOR, not when the row was created/edited — shown
      // alongside the "when" timestamp below since the two commonly differ (a backdated entry
      // filled today for last week) and this card previously gave no way to tell which calendar
      // date a given activity row actually belongs to.
      const workDate = e.timesheet_date ?? e.work_date ?? null;
      return {
        id: e.id, timestamp, text, status: e.status, workDate,
      };
    })
    .filter((a) => !!a.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, RECENT_ACTIVITY_LIMIT), [entries]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No recent activity"
            description="Your logged work log entries will show up here."
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            {activity.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META.pending;
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', meta.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.timestamp)}
                      {a.workDate && <span> · for {formatDate(a.workDate)}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivityCard;
