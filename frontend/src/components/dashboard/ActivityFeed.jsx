import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import EmptyState from '@/components/common/EmptyState';
import { getInitials, formatDate, formatHours } from '@/utils/formatters';
import { Activity } from 'lucide-react';

const ActivityFeed = ({ entries = [], isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Timesheet Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No recent activity"
            description="Activity will appear when timesheets are submitted."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {getInitials(entry.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium truncate">{entry.full_name}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDate(entry.timesheet_date)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatHours(entry.hours_logged)} on {entry.service_po_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">{entry.designation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivityFeed;
