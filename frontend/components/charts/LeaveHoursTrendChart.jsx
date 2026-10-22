import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { CalendarOff } from 'lucide-react';

const COLOR = '#ef4444';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      <p style={{ color: COLOR }}>
        {Number(payload[0].value).toLocaleString('en-IN')} hrs on leave
      </p>
    </div>
  );
};

const LeaveHoursTrendChart = ({ data = [], isLoading, periodLabel }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44 mb-1" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (data ?? []).map((d) => ({
    label: d.month,
    hours: Number(d.leave_hours) || 0,
  }));

  const hasData = chartData.some((d) => d.hours > 0);
  const totalLeave = chartData.reduce((s, d) => s + d.hours, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave Hours Trend</CardTitle>
        <CardDescription>Monthly leave hours · {periodLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            icon={CalendarOff}
            title="No leave hours yet"
            description="Leave hours will appear here once timesheets are submitted."
            className="py-12"
          />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke={COLOR}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLOR }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Total: <span className="font-semibold text-foreground">{totalLeave.toLocaleString('en-IN')} hrs</span> on leave this period
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LeaveHoursTrendChart;
