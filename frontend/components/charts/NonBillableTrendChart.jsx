import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { TrendingDown } from 'lucide-react';

const BILLABLE_COLOR     = 'hsl(var(--primary))';
const NON_BILLABLE_COLOR = '#f97316';
const PCT_LINE_COLOR     = '#10b981';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const billable    = payload.find((p) => p.dataKey === 'billable_hours');
  const nonBillable = payload.find((p) => p.dataKey === 'non_billable_hours');
  const pctEntry    = payload.find((p) => p.dataKey === 'billable_pct');
  const total       = (Number(billable?.value) || 0) + (Number(nonBillable?.value) || 0);
  const nbPct       = total > 0 ? ((Number(nonBillable?.value) || 0) / total * 100).toFixed(1) : '0.0';
  const bPct        = pctEntry ? Number(pctEntry.value).toFixed(1) : null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 shadow-elevated text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>

      {billable && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: BILLABLE_COLOR }} />
            <span className="text-muted-foreground">Billable</span>
          </span>
          <span className="font-medium tabular-nums">{Number(billable.value).toLocaleString('en-IN')} hrs</span>
        </div>
      )}

      {nonBillable && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: NON_BILLABLE_COLOR }} />
            <span className="text-muted-foreground">Non-Billable</span>
          </span>
          <span className="font-medium tabular-nums">{Number(nonBillable.value).toLocaleString('en-IN')} hrs</span>
        </div>
      )}

      <div className="border-t pt-1.5 mt-1 space-y-1">
        {bPct && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: PCT_LINE_COLOR }} />
              <span className="text-muted-foreground">Billable %</span>
            </span>
            <span className="font-bold tabular-nums" style={{ color: PCT_LINE_COLOR }}>{bPct}%</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Non-Billable %</span>
          <span className="font-semibold tabular-nums text-orange-500">{nbPct}%</span>
        </div>
      </div>
    </div>
  );
};

const NonBillableTrendChart = ({ data = [], isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56 mb-1" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  /* compute billable_pct per month for the line */
  const chartData = data.map((d) => {
    const b  = Number(d.billable_hours)     || 0;
    const nb = Number(d.non_billable_hours) || 0;
    const total = b + nb;
    return {
      ...d,
      billable_pct: total > 0 ? parseFloat(((b / total) * 100).toFixed(1)) : 0,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billable vs Non-Billable Trend</CardTitle>
        <CardDescription>Monthly hours split with billable % line — last 6 months</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyState
            icon={TrendingDown}
            title="No data yet"
            description="Hours will appear here once timesheets are submitted."
            className="py-10"
          />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 36, left: -16, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />

              {/* Left Y — hours */}
              <YAxis
                yAxisId="hours"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />

              {/* Right Y — billable % */}
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: PCT_LINE_COLOR }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={38}
              />

              {/* 75% reference line — target threshold */}
              <ReferenceLine
                yAxisId="pct"
                y={75}
                stroke={PCT_LINE_COLOR}
                strokeDasharray="4 3"
                strokeOpacity={0.4}
                label={{ value: '75%', position: 'insideTopRight', fontSize: 10, fill: PCT_LINE_COLOR, opacity: 0.7 }}
              />

              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />

              <Legend
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => {
                  const map = {
                    billable_hours    : 'Billable',
                    non_billable_hours: 'Non-Billable',
                    billable_pct      : 'Billable %',
                  };
                  return <span style={{ color: 'hsl(var(--muted-foreground))' }}>{map[value] ?? value}</span>;
                }}
              />

              <Bar yAxisId="hours" dataKey="billable_hours"     stackId="h" fill={BILLABLE_COLOR}     radius={[0, 0, 0, 0]} />
              <Bar yAxisId="hours" dataKey="non_billable_hours" stackId="h" fill={NON_BILLABLE_COLOR} radius={[3, 3, 0, 0]} />

              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="billable_pct"
                stroke={PCT_LINE_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: PCT_LINE_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: PCT_LINE_COLOR, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default NonBillableTrendChart;
