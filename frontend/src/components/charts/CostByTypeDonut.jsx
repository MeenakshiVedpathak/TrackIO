import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { IndianRupee } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

const COLORS = {
  Billable: '#22c55e',
  'Non-Billable': '#6366f1',
  'Customer Non-Billable': '#f97316',
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const pct = entry.payload?.pct;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-0.5">{entry.name}</p>
      <p style={{ color: entry.payload?.fill }}>
        {formatCurrency(entry.value)}{pct != null ? ` (${pct}%)` : ''}
      </p>
    </div>
  );
};

const CostByTypeDonut = ({ data = [], isLoading, periodLabel }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40 mb-1" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const totals = {};
  (data ?? []).forEach((m) => {
    (m.categories ?? []).forEach((c) => {
      totals[c.category_name] = (totals[c.category_name] || 0) + (Number(c.cost) || 0);
    });
  });

  const totalCost = Object.values(totals).reduce((s, v) => s + v, 0);
  const chartData = Object.entries(totals)
    .map(([name, value]) => ({
      name,
      value,
      fill: COLORS[name] ?? '#94a3b8',
      pct: totalCost > 0 ? ((value / totalCost) * 100).toFixed(1) : '0.0',
    }))
    .filter((d) => d.value > 0);

  const hasData = chartData.length > 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Cost by Service Category</CardTitle>
        <CardDescription>Total cost breakdown · {periodLabel}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex items-center">
        {!hasData ? (
          <EmptyState
            icon={IndianRupee}
            title="No cost data yet"
            description="Cost breakdown will appear here once timesheets are costed."
            className="py-10 w-full"
          />
        ) : (
          <div className="flex items-center gap-4 w-full">
            <div className="relative shrink-0" style={{ width: 170, height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none px-2">
                <span className="text-[11px] font-bold tabular-nums text-foreground text-center leading-tight break-words max-w-[80px]">{formatCurrency(totalCost)}</span>
                <span className="text-[9px] text-muted-foreground mt-0.5">Total</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 flex-1 min-w-0">
              {chartData.map((d) => (
                <div key={d.name} className="flex flex-col gap-0.5 text-xs min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: d.fill }} />
                    <span className="text-muted-foreground truncate">{d.name}</span>
                  </span>
                  <span className="font-medium tabular-nums pl-3.5">
                    {formatCurrency(d.value)}
                    <span className="text-muted-foreground ml-1">({d.pct}%)</span>
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

export default CostByTypeDonut;
