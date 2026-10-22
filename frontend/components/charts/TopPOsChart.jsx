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
import { truncate } from '@/utils/formatters';
import { BarChart3 } from 'lucide-react';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(239 60% 70%)',
  'hsl(239 50% 75%)',
  'hsl(239 40% 80%)',
  'hsl(239 30% 85%)',
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-elevated text-xs max-w-48">
      <p className="font-medium text-foreground mb-1 leading-snug">{d.service_po_name}</p>
      <p className="text-muted-foreground mb-0.5">{d.client_name}</p>
      <p className="text-primary font-semibold">{Number(d.total_hours_logged).toLocaleString('en-IN')} hrs logged</p>
      {d.expected_man_hours && (
        <p className="text-muted-foreground">of {Number(d.expected_man_hours).toLocaleString('en-IN')} expected</p>
      )}
    </div>
  );
};

const TopPOsChart = ({ data = [], isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48 mb-1" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    total_hours_logged: parseFloat(d.total_hours_logged) || 0,
    label: truncate(d.service_po_name, 20),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 5 Service POs by Hours</CardTitle>
        <CardDescription>All-time hours logged per purchase order</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No PO data yet"
            description="Service PO hours will appear once timesheets are submitted."
            className="py-10"
          />
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
              <Bar dataKey="total_hours_logged" radius={[4, 4, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default TopPOsChart;
