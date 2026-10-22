import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { TrendingUp } from 'lucide-react';

const SERIES = [
  { key: 'Billable',              color: '#22c55e', label: 'Billable' },
  { key: 'Non-Billable',          color: '#6366f1', label: 'Non-Billable' },
  { key: 'Customer Non-Billable', color: '#f97316', label: 'Customer Non-Billable' },
  { key: 'Other',                 color: '#94a3b8', label: 'Other' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 shadow-md text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => p.value > 0 && (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-medium tabular-nums">{Number(p.value).toLocaleString('en-IN')} hrs</span>
        </div>
      ))}
      {total > 0 && (
        <div className="border-t pt-1 mt-1 flex justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString('en-IN')} hrs</span>
        </div>
      )}
    </div>
  );
};

const MonthlyHoursTrendChart = ({ data = [], isLoading, fiscalYear, quarter }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56 mb-1" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const fyLabel = fiscalYear
    ? `Apr ${fiscalYear} → Mar ${fiscalYear + 1}`
    : 'Fiscal Year';

  const hasData = data.some((d) =>
    (d.Billable || 0) + (d['Non-Billable'] || 0) + (d['Customer Non-Billable'] || 0) + (d.Other || 0) > 0
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Monthly Hours Trend</CardTitle>
        <CardDescription>
          Billable · Non-Billable · Customer Non-Billable ·{' '}
          {quarter ? `Q${quarter} of ` : ''}{fyLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {!hasData ? (
          <EmptyState
            icon={TrendingUp}
            title="No timesheet data yet"
            description="Hours will appear here once timesheets are submitted."
            className="flex-1 justify-center py-12"
          />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
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
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} />
              <Legend
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                formatter={(value) => (
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>
                )}
              />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="hrs"
                  fill={s.color}
                  radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default MonthlyHoursTrendChart;
