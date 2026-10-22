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
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

const PAGE_SIZE = 10;
const CHART_HEIGHT = 320;

const COLORS = [
  '#22c55e',
  '#6366f1',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#0ea5e9',
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg text-xs space-y-0.5">
      <p className="font-medium text-foreground max-w-[200px] truncate">{label}</p>
      <p style={{ color: payload[0].fill }} className="font-semibold">
        {formatCurrency(payload[0].value)}
      </p>
      {row.total_hours != null && (
        <p className="text-muted-foreground">{Number(row.total_hours).toLocaleString('en-IN')} hrs</p>
      )}
    </div>
  );
};

const ClientCostChart = ({ data = [], isLoading, periodLabel }) => {
  const [page, setPage] = useState(1);

  const activeData = [...(data ?? [])]
    .filter((c) => (c.total_cost || 0) > 0)
    .sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));
  const totalPages = Math.ceil(activeData.length / PAGE_SIZE);
  const pageData = activeData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <Skeleton className="h-4 w-40 mb-1" />
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
            <CardTitle className="text-sm font-semibold">Client Cost Analytics</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Total cost per client · {periodLabel}</CardDescription>
          </div>
          {activeData.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {activeData.length} clients
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col">
        {activeData.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No client cost data"
            description="Cost will appear once timesheets are costed."
            className="py-10"
          />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart
                data={pageData}
                layout="vertical"
                margin={{ top: 4, right: 100, left: 8, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickCount={4}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <YAxis
                  type="category"
                  dataKey="client_name"
                  width={120}
                  tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v.length > 17 ? `${v.slice(0, 17)}…` : v}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar dataKey="total_cost" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))', formatter: (v) => formatCurrency(v) }}>
                  {pageData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
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

export default ClientCostChart;
