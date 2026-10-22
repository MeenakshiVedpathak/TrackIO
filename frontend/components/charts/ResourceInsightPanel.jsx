import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/utils/cn';

/* ── bench severity tiers ── */
const SEVS = [
  { label: 'Crit', min: 75, text: 'text-red-500',    bg: 'bg-red-500/10',    bar: 'bg-red-500'    },
  { label: 'High', min: 50, text: 'text-amber-400',  bg: 'bg-amber-400/10',  bar: 'bg-amber-400'  },
  { label: 'Mid',  min: 25, text: 'text-yellow-400', bg: 'bg-yellow-400/10', bar: 'bg-yellow-400' },
  { label: 'Low',  min: 1,  text: 'text-blue-400',   bg: 'bg-blue-400/10',   bar: 'bg-blue-400'   },
];
const getSev = (pct) => SEVS.find((s) => pct >= s.min) ?? SEVS[3];

const MIX = { Billable: '#6366f1', Leave: '#ef4444', Idle: '#f97316' };

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-2 shadow text-xs">
      <p className="font-semibold">{payload[0].name}</p>
      <p className="text-muted-foreground">{payload[0].value.toLocaleString('en-IN')}h</p>
    </div>
  );
};

/* ══════════════════════════ Bench Watchlist ══════════════════════════ */
const BenchPanel = ({ data, periodLabel }) => {
  const active = useMemo(
    () => [...(data ?? [])].filter((e) => e.bench_pct > 0).sort((a, b) => b.bench_pct - a.bench_pct),
    [data],
  );
  const critCount = active.filter((e) => e.bench_pct >= 75).length;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">Bench Watchlist</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {active.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {active.length} on bench
            </span>
          )}
          {critCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
              {critCount} critical
            </span>
          )}
        </div>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-8">All employees productive</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_44px_80px_34px] gap-x-2 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1.5">
            <span>Employee</span><span className="text-right">Hrs</span><span>Bench</span><span className="text-right">%</span>
          </div>
          <div className="space-y-2.5 overflow-y-auto flex-1 pr-0.5">
            {active.map((e) => {
              const sev = getSev(e.bench_pct);
              return (
                <div key={e.employee_id} className="grid grid-cols-[1fr_44px_80px_34px] items-center gap-x-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug break-words" title={e.full_name}>{e.full_name}</p>
                    <span className={cn('text-[9px] font-bold px-1.5 py-px rounded leading-none inline-block mt-1', sev.bg, sev.text)}>
                      {sev.label}
                    </span>
                  </div>
                  <div className="text-right leading-none">
                    {/* <p className="text-[11px] tabular-nums font-semibold text-foreground">{e.bench_hours}h</p> */}
                    <p className="text-[9px] tabular-nums text-muted-foreground mt-0.5">{e.bench_hours}h</p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', sev.bar)}
                      style={{ width: `${Math.min(e.bench_pct, 100)}%` }}
                    />
                  </div>
                  <span className={cn('text-xs font-bold tabular-nums text-right', sev.text)}>
                    {e.bench_pct.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

/* ══════════════════════════ Billable Mix ═════════════════════════════ */
const BillableMixPanel = ({ billableRows, periodLabel }) => {
  const { totalB, totalL, totalI, totalH, tiers, pieData } = useMemo(() => {
    let totalB = 0, totalL = 0, totalI = 0, totalH = 0;
    let healthy = 0, watch = 0, risk = 0;

    (billableRows ?? []).filter((r) => r.total_hours > 0).forEach((r) => {
      totalB += r.billable_hours || 0;
      totalH += r.total_hours   || 0;
      (r.non_billable_reasons ?? []).forEach((nb) => {
        if (nb.service_type_name === 'Leaves') totalL += nb.hours;
        else totalI += nb.hours;
      });
      const pct = r.billable_pct || 0;
      if (pct >= 90) healthy++;
      else if (pct >= 75) watch++;
      else risk++;
    });

    const pieData = [
      { name: 'Billable', value: totalB, fill: MIX.Billable },
      { name: 'Leave',    value: totalL, fill: MIX.Leave    },
      { name: 'Idle',     value: totalI, fill: MIX.Idle     },
    ].filter((d) => d.value > 0);

    return { totalB, totalL, totalI, totalH, tiers: { healthy, watch, risk }, pieData };
  }, [billableRows]);

  const overallPct = totalH > 0 ? (totalB / totalH) * 100 : 0;

  return (
    <div className="flex flex-col h-full gap-3">
      <div>
        <p className="text-sm font-bold text-foreground leading-tight">Billable Mix</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{periodLabel} · {totalH.toLocaleString('en-IN')} total hrs</p>
      </div>

    
      <div className="relative mx-auto shrink-0" style={{ width: 148, height: 148 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={46} outerRadius={66} paddingAngle={2} dataKey="value">
              {pieData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
            </Pie>
            <Tooltip content={<PieTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-lg font-extrabold tabular-nums leading-none"
            style={{ color: overallPct >= 75 ? MIX.Billable : MIX.Leave }}
          >
            {overallPct.toFixed(1)}%
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">Billable</span>
        </div>
      </div>

      {/* Hour rows */}
      <div className="space-y-1.5">
        {[
          { label: 'Billable', value: totalB, color: MIX.Billable },
          { label: 'Leave',    value: totalL, color: MIX.Leave    },
          { label: 'Idle',     value: totalI, color: MIX.Idle     },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between text-xs rounded-md px-2.5 py-1.5 bg-muted/40">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-muted-foreground">{label}</span>
            </div>
            <span className="font-bold tabular-nums text-foreground">{value.toLocaleString('en-IN')}h</span>
          </div>
        ))}
      </div>

      {/* Tier breakdown */}
      <div className="border-t border-border/50 pt-2 space-y-1.5">
        {[
          { label: 'Healthy ≥ 90%', value: tiers.healthy, color: '#10b981', danger: false },
          { label: 'Watch 75–89%',  value: tiers.watch,   color: '#f59e0b', danger: false },
          { label: 'At risk < 75%', value: tiers.risk,    color: '#ef4444', danger: true  },
        ].map(({ label, value, color, danger }) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-muted-foreground">{label}</span>
            </div>
            <span className={cn('font-bold tabular-nums', danger && value > 0 ? 'text-red-500' : 'text-foreground')}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════ Sole-Contributor POs ════════════════════ */
const SOLE_SORT_OPTIONS = ['Billable', 'Non-Billable', 'Customer Non-Billable'];

const SOLE_CATEGORY_BADGE = {
  'Billable':                'bg-green-500/10 text-green-700 dark:text-green-400',
  'Non-Billable':            'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  'Customer Non-Billable':   'bg-orange-500/10 text-orange-700 dark:text-orange-400',
};
const SOLE_CATEGORY_ABBR = { 'Billable': 'B', 'Non-Billable': 'NB', 'Customer Non-Billable': 'CNB' };

const SoleContributorPanel = ({ employeesByPO }) => {
  const [sortBy, setSortBy] = useState('Billable');

  const solePOs = useMemo(() => {
    const list = (employeesByPO ?? [])
      .map((po) => {
        const active = (po.top_employees ?? []).filter((e) => e.hours > 0);
        const total  = active.reduce((s, e) => s + e.hours, 0);
        if (!total) return null;
        const top = active[0];
        const pct = (top.hours / total) * 100;
        if (pct < 50) return null;
        return { ...po, topEmp: top, pct, total };
      })
      .filter(Boolean);

    return list.sort((a, b) => {
      const aMatch = a.category_name === sortBy;
      const bMatch = b.category_name === sortBy;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return b.total - a.total;
    });
  }, [employeesByPO, sortBy]);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">Sole-Contributor POs</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Single-person dependency · risk</p>
        </div>
        {solePOs.length > 0 && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {solePOs.length} POs
          </span>
        )}
      </div>

      {solePOs.length > 0 && (
        <div className="flex items-center gap-1 -mt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground shrink-0">Sort:</span>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted flex-wrap">
            {SOLE_SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                className={cn(
                  'px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150 whitespace-nowrap',
                  sortBy === opt
                    ? 'bg-card shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {solePOs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-8">No sole-contributor POs found</p>
      ) : (
        <div className="space-y-3 overflow-y-auto flex-1">
          {solePOs.map((po) => (
            <div key={po.service_po_id} className="pb-3 border-b border-border/40 last:border-0 last:pb-0 space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs font-semibold text-foreground leading-tight flex-1 truncate">
                  {po.service_po_name}
                </p>
                <span className={cn(
                  'text-[9px] font-bold px-1.5 py-px rounded shrink-0 leading-none',
                  SOLE_CATEGORY_BADGE[po.category_name] ?? (po.is_billable
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'),
                )}>
                  {SOLE_CATEGORY_ABBR[po.category_name] ?? (po.is_billable ? 'B' : 'NB')}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{po.client_name} · {po.total}h</p>
              <p className="text-[11px]">
                <span className="text-muted-foreground">
                  {po.pct >= 99 ? 'only ' : `${po.pct.toFixed(0)}% `}
                </span>
                <span className="font-semibold text-primary">{po.topEmp.full_name}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {solePOs.length > 0 && (
        <div className="mt-auto rounded-lg bg-muted/40 border border-border/50 p-2.5">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            A PO where one person logs ≥50% of hours is a delivery risk if they leave or take leave. Cross-train or co-assign.
          </p>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════ Main export ══════════════════════════════ */
const ResourceInsightPanel = ({ benchData, billableRows, employeesByPO, isLoading, periodLabel }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl border bg-card p-4 flex flex-col min-h-[360px] max-h-[460px]">
        <BenchPanel data={benchData} periodLabel={periodLabel} />
      </div>
      {/* <div className="rounded-2xl border bg-card p-4 flex flex-col min-h-[360px] max-h-[460px]">
        <BillableMixPanel billableRows={billableRows} periodLabel={periodLabel} />
      </div> */}
      <div className="rounded-2xl border bg-card p-4 flex flex-col min-h-[360px] max-h-[460px]">
        <SoleContributorPanel employeesByPO={employeesByPO} />
      </div>
    </div>
  );
};

export default ResourceInsightPanel;
