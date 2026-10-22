import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Users, Calendar, Coffee, ShieldAlert, CheckCircle2, LayoutGrid, List, ChevronLeft, ChevronRight, BarChart2, ArrowDownWideNarrow } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatHours } from '@/utils/formatters';

/* ── colour palette (hex — safe in recharts) ── */
const C = {
  billable  : '#22c55e',
  nonBillable: '#6366f1',
  customerNonBillable: '#f97316',
};

/* ── group reasons by type (Leaves / On Bench / Others / ...) and sum hours ── */
const groupByType = (reasons = []) => {
  const m = {};
  reasons.forEach((r) => { m[r.service_type_name] = (m[r.service_type_name] || 0) + (r.hours || 0); });
  return Object.entries(m).filter(([, hrs]) => hrs > 0).sort((a, b) => b[1] - a[1]);
};

/* ── tier helper ── */
const getTier = (pct) => {
  if (pct >= 90) return { label: 'Healthy',  color: '#10b981', text: 'text-emerald-600 dark:text-emerald-400' };
  if (pct >= 75) return { label: 'Good',     color: '#6366f1', text: 'text-primary' };
  if (pct >= 60) return { label: 'At Risk',  color: '#f59e0b', text: 'text-amber-500' };
  return          { label: 'Critical', color: '#ef4444', text: 'text-red-500' };
};

const trunc = (str) => str;

/* ── custom tooltips ── */
const TypeBreakdownRows = ({ title, entries }) => {
  if (!entries.length) return null;
  return (
    <div className="pt-1.5 mt-1.5 border-t space-y-1">
      <p className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wide">{title}</p>
      {entries.map(([type, hrs]) => (
        <div key={type} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{type}</span>
          <span className="font-medium tabular-nums text-foreground">{formatHours(hrs)}</span>
        </div>
      ))}
    </div>
  );
};

const BarTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { fullName, billablePct, billableReasons, internalReasons, customerReasons } = payload[0].payload;
  const tier = getTier(billablePct);
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-lg text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-foreground leading-tight">{fullName}</p>
      <p className={cn('text-xs font-bold mb-1', tier.text)}>{billablePct?.toFixed(1)}% billable</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{formatHours(p.value)}</span>
        </div>
      ))}
      <TypeBreakdownRows title="Billable types" entries={groupByType(billableReasons)} />
      <TypeBreakdownRows title="Non-Billable types" entries={groupByType(internalReasons)} />
      <TypeBreakdownRows title="Customer non-billable types" entries={groupByType(customerReasons)} />
    </div>
  );
};

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const name    = entry.name;
  const value   = entry.value;
  const fill    = entry.payload?.fill;
  const percent = entry.percent ?? entry.payload?.percent;
  const pctStr  = percent != null ? (percent * 100).toFixed(1) : null;
  const breakdown = groupByType(entry.payload?.reasons ?? []);
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-lg text-xs min-w-[170px]">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: fill }} />
        {name}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {formatHours(value)}{pctStr ? ` · ${pctStr}%` : ''}
      </p>
      <TypeBreakdownRows title="By type" entries={breakdown} />
    </div>
  );
};

/* ── sub-components ── */
const Stat = ({ label, value, icon: Icon, cardBg, borderColor, iconBg, iconColor, valueColor, subtext }) => (
  <div className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2', cardBg, borderColor)}>
    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', iconBg)}>
      <Icon className={cn('h-4 w-4', iconColor)} />
    </div>
    <div className="min-w-0">
      <p className={cn('text-base font-extrabold tabular-nums leading-none', valueColor)}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1 leading-none">{label}</p>
      {subtext && <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-none">{subtext}</p>}
    </div>
  </div>
);

const TierRow = ({ label, count, color }) => (
  <div className="flex items-center justify-between py-2 text-xs">
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
    <span className="font-bold tabular-nums text-foreground">{count}</span>
  </div>
);

const NBBadge = ({ name, hours, type, category }) => (
  <span className={cn(
    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
    category === 'Customer Non-Billable'
      ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
      : type === 'Leaves'
        ? 'bg-red-500/10 text-red-700 dark:text-red-400'
        : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'
  )}>
    {name}: {formatHours(hours)}
  </span>
);

/* ── main component ── */
const BillableAnalyticsPanel = ({
  data = [], allData, meta = {}, isLoading, month, year, page = 1, onPageChange,
  sortBy = 'nonBillable', onSortByChange,
}) => {
  const [view, setView] = useState('charts');

  const monthLabel = month && year
    ? new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    : 'This Month';

  const records = data.filter((r) => r.total_hours > 0);
  /* aggregates (totals/donut/tiers) must reflect ALL employees, not just the current page */
  const allRecords = (allData ?? data).filter((r) => r.total_hours > 0);

  /* ── totals ── */
  const totalBillable    = allRecords.reduce((s, r) => s + (r.billable_hours     || 0), 0);
  const totalHours       = allRecords.reduce((s, r) => s + (r.total_hours        || 0), 0);
  const overallPct       = totalHours > 0 ? (totalBillable / totalHours) * 100 : 0;

  const totalNonBillable         = allRecords.reduce((s, r) => s + (r.internal_non_billable_hours ?? r.non_billable_hours ?? 0), 0);
  const totalCustomerNonBillable = allRecords.reduce((s, r) => s + (r.customer_non_billable_hours ?? 0), 0);

  const allInternalReasons = allRecords.flatMap((r) => r.internal_non_billable_reasons ?? r.non_billable_reasons ?? []);
  const allCustomerReasons = allRecords.flatMap((r) => r.customer_non_billable_reasons ?? []);

  /* ── tier counts ── */
  const tiers = { Healthy: 0, Good: 0, 'At Risk': 0, Critical: 0 };
  allRecords.forEach((r) => { tiers[getTier(r.billable_pct || 0).label]++; });
  const atRiskCount = tiers['At Risk'] + tiers['Critical'];

  /* ── bar chart data ── */
  const sortedRecords = [...records].sort((a, b) => {
    if (sortBy === 'billable') return (b.billable_hours || 0) - (a.billable_hours || 0);
    if (sortBy === 'customerNonBillable') return (b.customer_non_billable_hours || 0) - (a.customer_non_billable_hours || 0);
    return (b.non_billable_hours || 0) - (a.non_billable_hours || 0);
  });

  const barData = sortedRecords.map((r) => ({
    name       : trunc(r.full_name),
    fullName   : r.full_name,
    Billable                : r.billable_hours || 0,
    'Non-Billable'           : r.internal_non_billable_hours ?? r.non_billable_hours ?? 0,
    'Customer Non-Billable'  : r.customer_non_billable_hours || 0,
    billablePct   : r.billable_pct || 0,
    billableReasons: r.billable_reasons ?? [],
    internalReasons: r.internal_non_billable_reasons ?? r.non_billable_reasons ?? [],
    customerReasons: r.customer_non_billable_reasons ?? [],
  }));

  /* ── donut data ── */
  const pieData = [
    { name: 'Billable',                value: totalBillable,           fill: C.billable,            reasons: [] },
    { name: 'Non-Billable',            value: totalNonBillable,        fill: C.nonBillable,          reasons: allInternalReasons },
    { name: 'Customer Non-Billable',   value: totalCustomerNonBillable, fill: C.customerNonBillable, reasons: allCustomerReasons },
  ].filter((d) => d.value > 0);

  const barChartHeight = Math.max(280, barData.length * 38);

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap';
  const td = 'px-3 py-2.5 text-xs align-middle';

  const effTier = getTier(overallPct);

  return (
    <Card className="overflow-hidden">
      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-3 border-b bg-gradient-to-r from-primary/[0.04] via-primary/[0.02] to-transparent">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <BarChart2 className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-none">Billable Analytics</p>
              <p className="text-xs text-muted-foreground mt-1 leading-none">Billable vs non-billable vs customer non-billable per employee · {monthLabel}</p>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border overflow-hidden text-xs shrink-0 bg-background">
            <button
              onClick={() => setView('charts')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
                view === 'charts' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50 text-muted-foreground'
              )}
            >
              <LayoutGrid className="h-3 w-3" /> Charts
            </button>
            <button
              onClick={() => setView('table')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 border-l transition-colors',
                view === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50 text-muted-foreground'
              )}
            >
              <List className="h-3 w-3" /> Table
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        {!isLoading && allRecords.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="Billable Efficiency"
              value={`${overallPct.toFixed(1)}%`}
              icon={CheckCircle2}
              cardBg={overallPct >= 75 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}
              borderColor={overallPct >= 75 ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}
              iconBg={overallPct >= 75 ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-red-100 dark:bg-red-900/50'}
              iconColor={overallPct >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}
              valueColor={effTier.text}
              subtext={`${formatHours(totalBillable)} of ${formatHours(totalHours)}`}
            />
            <Stat
              label="Non-Billable Hours"
              value={formatHours(totalNonBillable)}
              icon={Coffee}
              cardBg="bg-indigo-50 dark:bg-indigo-950/30"
              borderColor="border-indigo-200 dark:border-indigo-800"
              iconBg="bg-indigo-100 dark:bg-indigo-900/50"
              iconColor="text-indigo-500 dark:text-indigo-400"
              valueColor="text-indigo-600 dark:text-indigo-400"
              subtext={totalHours > 0 ? `${((totalNonBillable / totalHours) * 100).toFixed(1)}% of total` : undefined}
            />
            <Stat
              label="Customer Non-Billable"
              value={formatHours(totalCustomerNonBillable)}
              icon={Calendar}
              cardBg="bg-orange-50 dark:bg-orange-950/30"
              borderColor="border-orange-200 dark:border-orange-800"
              iconBg="bg-orange-100 dark:bg-orange-900/50"
              iconColor="text-orange-500 dark:text-orange-400"
              valueColor="text-orange-600 dark:text-orange-400"
              subtext={totalHours > 0 ? `${((totalCustomerNonBillable / totalHours) * 100).toFixed(1)}% of total` : undefined}
            />
            <Stat
              label="At-Risk Employees"
              value={atRiskCount}
              icon={ShieldAlert}
              cardBg={atRiskCount > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}
              borderColor={atRiskCount > 0 ? 'border-red-200 dark:border-red-800' : 'border-emerald-200 dark:border-emerald-800'}
              iconBg={atRiskCount > 0 ? 'bg-red-100 dark:bg-red-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'}
              iconColor={atRiskCount > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}
              valueColor={atRiskCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'}
              subtext="below 75% billable"
            />
          </div>
        )}
      </div>

      <CardContent className="pt-4">
        {/* ── Loading ── */}
        {isLoading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
            <Skeleton className="h-72 rounded-lg" />
          </div>
        )}

        {/* ── Empty ── */}
        {!isLoading && allRecords.length === 0 && (
          <EmptyState
            icon={Users}
            title="No data for this period"
            description="Employee breakdown will appear once timesheets are submitted."
          />
        )}

        {!isLoading && allRecords.length > 0 && (
          <>

            {/* ── CHARTS VIEW ── */}
            {view === 'charts' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Horizontal stacked bar chart */}
                <div className="lg:col-span-2">
                  <div className="flex items-center flex-wrap gap-3 mb-3">
                    <p className="text-xs font-semibold text-foreground">Hours by Employee</p>
                    <label className="flex items-center gap-1.5 shrink-0 text-[11px] text-muted-foreground">
                      <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                      Sort by
                      <select
                        value={sortBy}
                        onChange={(e) => onSortByChange?.(e.target.value)}
                        className="h-7 rounded-lg border bg-background px-2 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="billable">Billable</option>
                        <option value="nonBillable">Non-Billable</option>
                        <option value="customerNonBillable">Customer Non-Billable</option>
                      </select>
                    </label>
                  </div>
                  <ResponsiveContainer width="100%" height={barChartHeight}>
                    <BarChart
                      data={barData}
                      layout="vertical"
                      margin={{ top: 0, right: 12, left: 0, bottom: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}h`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={180}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<BarTip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      />
                      <Bar dataKey="Billable" stackId="a" fill={C.billable} radius={[0, 0, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="Non-Billable" stackId="a" fill={C.nonBillable} radius={[0, 0, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="Customer Non-Billable" stackId="a" fill={C.customerNonBillable} radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Right column: donut + tier table */}
                <div className="flex flex-col gap-5">
                  {/* Donut */}
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Hours Breakdown</p>
                    <div className="relative" style={{ height: 190 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {pieData.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTip />} wrapperStyle={{ zIndex: 50 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center label */}
                      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className={cn('text-xl font-bold tabular-nums', getTier(overallPct).text)}>
                          {overallPct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">Billable</span>
                      </div>
                    </div>
                    {/* Donut legend */}
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                      {pieData.map((d) => (
                        <div key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: d.fill }} />
                          {d.name}: {formatHours(d.value)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tier breakdown */}
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Employee Health Tiers</p>
                    <div className="rounded-md border px-3 divide-y divide-border">
                      <TierRow label="Healthy (≥ 90%)"   count={tiers['Healthy']}  color="#10b981" />
                      <TierRow label="Good (75 – 89%)"   count={tiers['Good']}     color="#6366f1" />
                      <TierRow label="At Risk (60 – 74%)" count={tiers['At Risk']} color="#f59e0b" />
                      <TierRow label="Critical (< 60%)"  count={tiers['Critical']} color="#ef4444" />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Showing {((page - 1) * (meta.limit ?? 10)) + 1}–{Math.min(page * (meta.limit ?? 10), meta.total ?? records.length)} of {meta.total ?? records.length} employees
                    </p>
                    {meta.totalPages > 1 && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          onClick={() => onPageChange?.(page - 1)}
                          disabled={!meta.hasPrev}
                          className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                        >
                          <ChevronLeft className="h-2.5 w-2.5" /> Prev
                        </button>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {page} / {meta.totalPages}
                        </span>
                        <button
                          onClick={() => onPageChange?.(page + 1)}
                          disabled={!meta.hasNext}
                          className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                        >
                          Next <ChevronRight className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── TABLE VIEW ── */}
            {view === 'table' && (
              <>
                <div className="rounded-md border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className={cn(th, 'w-8 text-center')}>#</th>
                          <th className={cn(th, 'min-w-[160px]')}>Employee</th>
                          <th className={cn(th, 'min-w-[140px]')}>Billable %</th>
                          <th className={cn(th, 'min-w-[170px]')}>Top Billable Projects</th>
                          <th className={cn(th, 'min-w-[160px]')}>Non-Billable Reasons</th>
                          <th className={cn(th, 'text-right')}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedRecords.map((row, idx) => {
                          const pct    = row.billable_pct || 0;
                          const tier   = getTier(pct);
                          const topB   = (row.billable_reasons ?? []).filter((r) => r.hours > 0).slice(0, 2);
                          const nbR    = (row.non_billable_reasons ?? []).filter((r) => r.hours > 0);
                          const offset = ((meta.page ?? 1) - 1) * (meta.limit ?? 10);

                          return (
                            <tr key={row.employee_id} className="hover:bg-muted/30 transition-colors">
                              <td className={cn(td, 'text-center text-muted-foreground w-8')}>{offset + idx + 1}</td>
                              <td className={td}>
                                <p className="font-medium text-foreground leading-tight">{row.full_name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {row.employee_code} · {row.designation}
                                </p>
                              </td>
                              <td className={td}>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${Math.min(pct, 100)}%`, background: tier.color }}
                                    />
                                  </div>
                                  <span className={cn('tabular-nums font-semibold text-xs w-[42px] text-right', tier.text)}>
                                    {pct.toFixed(1)}%
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                  {formatHours(row.billable_hours)} / {formatHours(row.total_hours)}
                                </p>
                              </td>
                              <td className={td}>
                                {topB.length > 0 ? (
                                  <div className="flex flex-col gap-0.5">
                                    {topB.map((r) => (
                                      <span key={r.service_po_id} className="inline-flex items-center gap-1 text-[10px] text-foreground">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: C.billable }} />
                                        <span className="truncate max-w-[130px]" title={r.service_po_name}>{r.service_po_name}</span>
                                        <span className="text-muted-foreground shrink-0">{formatHours(r.hours)}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className={td}>
                                {nbR.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {nbR.map((r) => (
                                      <NBBadge key={r.service_po_id} name={r.service_po_name} hours={r.hours} type={r.service_type_name} category={r.category_name} />
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-medium">Fully billable</span>
                                )}
                              </td>
                              <td className={cn(td, 'text-right tabular-nums font-medium')}>{formatHours(row.total_hours)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {((page - 1) * (meta.limit ?? 10)) + 1}–{Math.min(page * (meta.limit ?? 10), meta.total ?? records.length)} of {meta.total ?? records.length} employees
                  </p>
                  {meta.totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onPageChange?.(page - 1)}
                        disabled={!meta.hasPrev}
                        className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                      >
                        <ChevronLeft className="h-3 w-3" /> Prev
                      </button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {page} / {meta.totalPages}
                      </span>
                      <button
                        onClick={() => onPageChange?.(page + 1)}
                        disabled={!meta.hasNext}
                        className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                      >
                        Next <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BillableAnalyticsPanel;
