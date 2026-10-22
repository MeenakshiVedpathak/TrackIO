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
import { DollarSign } from 'lucide-react';

const COLORS = [
  'hsl(var(--primary))',
  '#6366f1',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-elevated text-xs">
      <p className="font-medium text-foreground mb-1 max-w-[180px] truncate">{label}</p>
      <p style={{ color: COLORS[0] }}>
        {Number(payload[0].value).toLocaleString('en-IN')} billable hrs
      </p>
    </div>
  );
};

const BillableByClientChart = ({ data = [], isLoading, month, year }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-52 mb-1" />
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
        <CardTitle>Top Clients — Billable Hours</CardTitle>
        <CardDescription>Highest billable hours by client · {monthLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No billable hours yet"
            description="Billable timesheet entries will appear here once submitted."
            className="py-10"
          />
        ) : (
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
              <Bar dataKey="billable_hours" radius={[0, 3, 3, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default BillableByClientChart;
