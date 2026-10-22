import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

const CATEGORIES = [
  { key: 'leaves_hours',           label: 'Leaves / Holiday',    color: '#3b82f6' },
  { key: 'team_management_hours',  label: 'Team Management',      color: '#8b5cf6' },
  { key: 'lnd_hours',              label: 'Learning & Development', color: '#10b981' },
  { key: 'internal_support_hours', label: 'Internal Support',     color: '#f59e0b' },
  { key: 'others_hours',           label: 'Others',               color: '#6b7280' },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-elevated text-xs">
      <p className="font-medium text-foreground mb-0.5">{item.name}</p>
      <p style={{ color: item.payload.color }}>
        {Number(item.value).toLocaleString('en-IN')} hrs ({item.payload.pct}%)
      </p>
    </div>
  );
};

const NonBillableBreakdownChart = ({ breakdown = {}, isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56 mb-1" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = parseFloat(breakdown.total_non_billable) || 0;

  const chartData = CATEGORIES
    .map((cat) => ({
      name: cat.label,
      value: parseFloat(breakdown[cat.key]) || 0,
      color: cat.color,
      pct: total > 0
        ? ((parseFloat(breakdown[cat.key]) || 0) / total * 100).toFixed(1)
        : '0.0',
    }))
    .filter((d) => d.value > 0);

  const hasData = chartData.length > 0 && total > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Non-Billable Hours Breakdown</CardTitle>
        <CardDescription>Current month — hours by reason category</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No non-billable hours this month</p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Donut */}
            <div className="shrink-0" style={{ width: 130, height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend + values */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {/* Total */}
              <div className="mb-1">
                <p className="text-xs text-muted-foreground">Total non-billable</p>
                <p className="text-lg font-bold text-orange-500">
                  {total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} hrs
                </p>
              </div>

              {chartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2 text-xs min-w-0">
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ background: item.color }}
                    />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {item.value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} hrs
                    <span className="text-muted-foreground ml-1">({item.pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NonBillableBreakdownChart;
