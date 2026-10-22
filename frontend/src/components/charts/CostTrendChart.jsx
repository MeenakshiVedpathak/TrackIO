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
import { IndianRupee } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

const SERIES = [
  { key: 'Billable',              color: '#22c55e' },
  { key: 'Non-Billable',          color: '#6366f1' },
  { key: 'Customer Non-Billable', color: '#f97316' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 shadow-lg text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => p.value > 0 && (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-medium tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
      {total > 0 && (
        <div className="border-t pt-1 mt-1 flex justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums text-foreground">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
};

const CostTrendChart = ({ data = [], isLoading, periodLabel }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40 mb-1" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (data ?? []).map((m) => {
    const row = { label: m.month };
    (m.categories ?? []).forEach((c) => { row[c.category_name] = Number(c.cost) || 0; });
    return row;
  });

  const hasData = chartData.some((d) => SERIES.some((s) => (d[s.key] || 0) > 0));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Cost Trend by Service Category</CardTitle>
        <CardDescription>Billable · Non-Billable · Customer Non-Billable · {periodLabel}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {!hasData ? (
          <EmptyState
            icon={IndianRupee}
            title="No cost data yet"
            description="Cost breakdown will appear here once timesheets are costed."
            className="py-12"
          />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={90}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrency(v)}
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
                  stackId="cost"
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

export default CostTrendChart;
