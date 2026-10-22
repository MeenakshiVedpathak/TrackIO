import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Gauge } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-muted-foreground">
        Utilization: <span className="font-medium text-foreground">{payload[0].value}%</span>
      </p>
    </div>
  );
};

const MonthlyUtilizationTrendChart = ({ data = [], isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40 mb-1" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (data ?? []).map((d) => ({
    label: d.month,
    utilization: Number(d.utilization_percentage) || 0,
  }));

  const hasData = chartData.length > 0;
  const latest = chartData[chartData.length - 1];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Utilization Trend</CardTitle>
        <CardDescription>Overall utilization % by month</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {!hasData ? (
          <EmptyState
            icon={Gauge}
            title="No utilization data yet"
            description="Utilization % will appear here once timesheets are submitted."
            className="flex-1 justify-center py-12"
          />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
                <Line
                  type="monotone"
                  dataKey="utilization"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
            {latest && (
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Latest: <span className="font-semibold text-foreground">{latest.label}</span> · {latest.utilization}% utilization
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MonthlyUtilizationTrendChart;
