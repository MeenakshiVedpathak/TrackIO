import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Inbox } from 'lucide-react';
import EmptyState from '@/components/common/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

// Same donut-with-center-total-and-legend-list pattern as components/charts/CostByTypeDonut.jsx —
// this is the one place on the app that already builds this shape, so reused verbatim rather than
// inventing a second chart layout convention. Real data, not a placeholder: every count here is
// exactly what ActionRequiredFeed's own row counts sum to (same `data` prop PmDashboard.jsx passes
// there), just visualized as a composition breakdown instead of a scrollable list of rows.
const SLICES = [
  { key: 'missing_work_logs', name: 'Missing Work Logs', color: '#ef4444' },
  { key: 'pending_approvals', name: 'Pending Approvals', color: '#f59e0b' },
  { key: 'at_risk_projects', name: 'At-Risk Projects', color: '#f97316' },
  { key: 'overallocated_employees', name: 'Overallocated', color: '#dc2626' },
  { key: 'bench_employees', name: 'Bench', color: '#eab308' },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-0.5">{entry.name}</p>
      <p style={{ color: entry.payload?.fill }}>
        {entry.value} item{entry.value !== 1 ? 's' : ''} ({entry.payload?.pct}%)
      </p>
    </div>
  );
};

const ActionRequiredCompositionChart = ({ data, isPending }) => {
  if (isPending) {
    return <Skeleton className="h-[220px] w-full rounded-xl" />;
  }

  // `data.counts` holds the TRUE totals; the row arrays are capped (20) for the feed lists, so
  // counting their length would under-report anything over 20 (e.g. 28 bench shown as 20).
  const countOf = (key) => data?.counts?.[key] ?? data?.[key]?.length ?? 0;
  const total = SLICES.reduce((sum, s) => sum + countOf(s.key), 0);
  const chartData = SLICES
    .map((s) => {
      const value = countOf(s.key);
      return { name: s.name, value, fill: s.color, pct: total > 0 ? ((value / total) * 100).toFixed(0) : '0' };
    })
    .filter((d) => d.value > 0);

  if (chartData.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing needs your attention"
        description="No missing work logs, pending approvals, at-risk projects, or capacity issues this period."
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={46}
              outerRadius={74}
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
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-extrabold tabular-nums text-foreground">{total}</span>
          <span className="text-[10px] text-muted-foreground">Total</span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: d.fill }} />
              <span className="truncate text-muted-foreground">{d.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {d.value} <span className="text-muted-foreground">({d.pct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActionRequiredCompositionChart;
