import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { usePmDashboardProjects } from '@/hooks/usePmDashboard';
import { formatHours } from '@/utils/formatters';
import EmptyState from '@/components/common/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

const TOP_N = 8;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 shadow-md text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-medium tabular-nums">{formatHours(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// Same modern bar-chart styling components/charts/MonthlyHoursTrendChart.jsx already establishes
// (dashed grid, muted-foreground axis ticks, no axis lines, rounded bar tops) — reused here rather
// than a third convention. Real data: reuses the exact same GET /pm-dashboard/projects endpoint
// every other section on this page already calls, just its own wide, unfiltered fetch sorted by
// logged hours descending, so no backend change was needed to add this. Capped at the top 8
// projects by logged hours — a PM's full portfolio charted at once would be unreadable as bars.
const ProjectHoursBarChart = ({ monthYear, buScope, className }) => {
  const { data, isPending } = usePmDashboardProjects({
    ...buScope,
    month: monthYear.month,
    year: monthYear.year,
    page: 1,
    limit: 50,
    sortBy: 'actual_hours',
    sortOrder: 'desc',
  });

  if (isPending) {
    return <Skeleton className={cn('h-[260px] w-full rounded-xl', className)} />;
  }

  const chartData = (data?.records ?? [])
    .filter((r) => (r.actual_hours ?? 0) > 0 || (r.planned_hours ?? 0) > 0)
    .slice(0, TOP_N)
    .map((r) => ({
      name: r.project_name?.length > 14 ? `${r.project_name.slice(0, 13)}…` : r.project_name,
      fullName: r.project_name,
      Logged: Number(r.actual_hours) || 0,
      Planned: Number(r.planned_hours) || 0,
    }));

  if (chartData.length === 0) {
    return (
      <div className={cn('flex min-h-[260px] flex-1 items-center justify-center', className)}>
        <EmptyState
          icon={BarChart3}
          title="No hours logged yet"
          description="Logged and planned hours will appear here once timesheets are submitted."
        />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={260} className={className}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={40}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
        />
        <Bar dataKey="Planned" name="Planned Hours" fill="#93c5fd" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Logged" name="Logged Hours" fill="#2563eb" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ProjectHoursBarChart;
