import { useState } from 'react';
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
import { Users, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 10;
const CHART_HEIGHT = 320;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-foreground mb-1 max-w-[220px]">{label}</p>
      <p className="text-primary">{Number(payload[0].value).toLocaleString('en-IN')} billable hrs</p>
    </div>
  );
};

const HoursByEmployeeChart = ({ data = [], isLoading, fiscalYear }) => {
  const [page, setPage] = useState(1);

  const activeData = data.filter((e) => (e.billable_hours ?? 0) > 0)
    .sort((a, b) => (b.billable_hours ?? 0) - (a.billable_hours ?? 0));
  const totalPages = Math.ceil(activeData.length / PAGE_SIZE);
  const pageData = activeData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const maxHours = activeData[0]?.billable_hours || 1;

  const fyLabel = fiscalYear ? `FY ${fiscalYear}–${String(fiscalYear + 1).slice(-2)}` : '';

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <Skeleton className="h-4 w-44 mb-1" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">Hours by Employee (Billable)</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Top contributors · {fyLabel}</CardDescription>
          </div>
          {activeData.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {activeData.length} employees
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col">
        {activeData.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employee data"
            description="Hours will appear once timesheets are submitted."
            className="py-10"
          />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart
                data={pageData}
                layout="vertical"
                margin={{ top: 4, right: 48, left: 8, bottom: 0 }}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                />
                <YAxis
                  type="category"
                  dataKey="full_name"
                  width={140}
                  tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v.length > 18 ? `${v.slice(0, 18)}…` : v}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar
                  dataKey="billable_hours"
                  radius={[0, 3, 3, 0]}
                  label={{ position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))', formatter: (v) => v }}
                >
                  {pageData.map((row, i) => {
                    const pct = (row.billable_hours ?? 0) / maxHours;
                    const opacity = Math.round((0.45 + pct * 0.55) * 100) / 100;
                    return (
                      <Cell
                        key={i}
                        fill={`hsl(var(--primary))`}
                        fillOpacity={opacity}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, activeData.length)} of {activeData.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page <= 1}
                    className="flex items-center gap-1 rounded border px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="tabular-nums">{page}/{totalPages}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 rounded border px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default HoursByEmployeeChart;
