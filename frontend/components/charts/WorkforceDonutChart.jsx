import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = {
  active: 'hsl(var(--success))',
  inactive: 'hsl(var(--muted-foreground))',
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-elevated text-xs">
      <p className="font-medium">{payload[0].name}</p>
      <p className="text-primary">{payload[0].value} employees</p>
    </div>
  );
};

const WorkforceDonutChart = ({ workforce, isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const { total_employees = 0, active_employees = 0, inactive_employees = 0 } = workforce ?? {};

  const data = [
    { name: 'Active', value: active_employees },
    { name: 'Inactive', value: inactive_employees },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workforce Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="relative">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={52}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name.toLowerCase()] ?? 'hsl(var(--muted))'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold tabular-nums">{total_employees}</span>
              <span className="text-[10px] text-muted-foreground">total</span>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                Active
              </div>
              <span className="text-sm font-semibold tabular-nums">{active_employees}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                Inactive
              </div>
              <span className="text-sm font-semibold tabular-nums">{inactive_employees}</span>
            </div>
            {total_employees > 0 && (
              <div className="pt-1 border-t">
                <div className="text-xs text-muted-foreground">
                  {Math.round((active_employees / total_employees) * 100)}% active rate
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkforceDonutChart;
