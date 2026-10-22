import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { AlertTriangle } from 'lucide-react';

const COLORS = [
  '#f97316',
  '#ef4444',
  '#f59e0b',
  '#ec4899',
  '#a855f7',
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-elevated text-xs">
      <p className="font-medium text-foreground mb-1 max-w-[180px] truncate">{label}</p>
      <p className="text-orange-500">
        {Number(payload[0].value).toLocaleString('en-IN')} non-billable hrs
      </p>
    </div>
  );
};

const CustomerNonBillableChart = ({ data = [], isLoading, month, year }) => {
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

  const monthLabel = month && year
    ? new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    : 'This Month';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Non-Billable Hours</CardTitle>
        <CardDescription>Non-billable effort per client · {monthLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No customer non-billable hours"
            description="Non-billable hours logged against client POs will appear here."
            className="py-10"
          />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
                barCategoryGap="25%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <YAxis
                  type="category"
                  dataKey="client_name"
                  width={100}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 14)}…` : v)}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar dataKey="non_billable_hours" radius={[0, 3, 3, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Warning note if a single client dominates */}
            {data.length > 0 && (() => {
              const total = data.reduce((s, d) => s + Number(d.non_billable_hours), 0);
              const top = Number(data[0].non_billable_hours);
              const pct = total > 0 ? ((top / total) * 100).toFixed(0) : 0;
              if (pct >= 50) {
                return (
                  <p className="mt-3 text-xs text-orange-500 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>{data[0].client_name}</strong> accounts for {pct}% of all customer non-billable hours this month.
                    </span>
                  </p>
                );
              }
              return null;
            })()}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomerNonBillableChart;
