import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Sliders, CalendarClock, Wallet, Users, Activity } from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import { useActiveServicePOs, useServicePO, useServicePOUtilisation } from '@/hooks/useServicePOs';
import { useMonthlyCosts } from '@/hooks/useMonthlyCosts';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate, formatPercentage } from '@/utils/formatters';

const now = new Date();
// Monthly costs are only uploaded at month-end, so the current calendar month never has a
// real cost record yet — use the last COMPLETED month as the real-cost baseline instead.
const lastCompletedMonth = dayjs().subtract(1, 'month');
const REPORT_MONTH = lastCompletedMonth.month() + 1;
const REPORT_YEAR = lastCompletedMonth.year();

const Slider = ({ label, value, onChange, min, max, step = 1, format }) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1.5">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground">{format ? format(value) : value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-primary"
    />
  </div>
);

const ImpactTile = ({ icon: Icon, label, value, note }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className="text-lg font-bold tabular-nums mt-1">{value}</p>
      {note && <p className="text-[11px] text-muted-foreground mt-1">{note}</p>}
    </CardContent>
  </Card>
);

// what_if is a recognized-but-unsupported AI intent today (see /api/v1/ai/query docs), so
// this is a deterministic calculator over a real Service PO's baseline (team size, expected
// hours, hours logged, dates, PO value, and the team's real current monthly cost) rather
// than an AI call — every formula below is plain arithmetic on real numbers, documented inline.
const WhatIfSimulator = () => {
  const [poId, setPoId] = useState('');
  const [developersDelta, setDevelopersDelta] = useState(0);
  const [delayDays, setDelayDays] = useState(0);
  const [budgetDeltaPct, setBudgetDeltaPct] = useState(0);

  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: po } = useServicePO(poId);
  const { data: utilisation } = useServicePOUtilisation(poId);
  const { data: costsRes } = useMonthlyCosts({ month: REPORT_MONTH, year: REPORT_YEAR, limit: 200 });

  const options = useMemo(
    () => activePOs.map((p) => ({ value: p.id, label: `${p.service_po_name} (${p.service_po_code ?? p.client_name ?? ''})` })),
    [activePOs],
  );

  const baseline = useMemo(() => {
    if (!po) return null;
    const allocated = po.employees ?? po.allocated_employees ?? [];
    const teamSize = Math.max(1, allocated.length);
    const expectedHours = Number(po.expected_man_hours ?? 0);
    const loggedHours = Number(utilisation?.total_hours_logged ?? utilisation?.hours_logged ?? 0);
    const remainingHours = Math.max(0, expectedHours - loggedHours);

    const allocatedNames = new Set(allocated.map((e) => (e.full_name ?? e.name ?? '').toLowerCase()).filter(Boolean));
    const costRows = Array.isArray(costsRes?.data) ? costsRes.data : [];
    const teamMonthlyCost = costRows
      .filter((r) => allocatedNames.has((r.employee_name ?? r.employee?.full_name ?? '').toLowerCase()))
      .reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);

    const end = po.end_date ? new Date(po.end_date) : null;
    const start = po.start_date ? new Date(po.start_date) : null;
    const totalDays = start && end ? Math.max(1, Math.round((end - start) / 86400000)) : null;
    const remainingDays = end ? Math.max(0, Math.round((end - now) / 86400000)) : null;

    return { teamSize, expectedHours, loggedHours, remainingHours, teamMonthlyCost, end, remainingDays, totalDays, poValue: Number(po.po_value ?? 0) };
  }, [po, utilisation, costsRes]);

  const scenario = useMemo(() => {
    if (!baseline) return null;
    const newTeamSize = Math.max(1, baseline.teamSize + developersDelta);
    const teamRatio = newTeamSize / baseline.teamSize;

    // Remaining work shrinks/grows roughly proportionally to team size, then the manual delay is added on top.
    const newRemainingDays = baseline.remainingDays != null
      ? Math.max(0, Math.round(baseline.remainingDays / teamRatio) + delayDays)
      : null;
    const newEndDate = baseline.end
      ? new Date(baseline.end.getTime() + ((newRemainingDays ?? baseline.remainingDays ?? 0) - (baseline.remainingDays ?? 0)) * 86400000)
      : null;

    const perPersonMonthlyCost = baseline.teamMonthlyCost / baseline.teamSize;
    const staffingCostDelta = perPersonMonthlyCost * developersDelta;
    const budgetDelta = baseline.poValue * (budgetDeltaPct / 100);

    // Rough utilization estimate: same remaining work spread over the new team size and timeline.
    const workingDaysRemaining = Math.max(1, (newRemainingDays ?? 30));
    const newUtilization = Math.min(150, ((baseline.remainingHours / newTeamSize) / (workingDaysRemaining * 8)) * 100);
    const baseUtilization = Math.min(150, ((baseline.remainingHours / baseline.teamSize) / (Math.max(1, baseline.remainingDays ?? 30) * 8)) * 100);

    return {
      newTeamSize,
      newEndDate,
      timelineDeltaDays: (newRemainingDays ?? 0) - (baseline.remainingDays ?? 0),
      staffingCostDelta,
      budgetDelta,
      benchDelta: -developersDelta,
      utilizationDelta: newUtilization - baseUtilization,
      newUtilization,
    };
  }, [baseline, developersDelta, delayDays, budgetDeltaPct]);

  return (
    <div className="pb-8">
      <AIPageHeader title="What-If Simulator" description="Model staffing, timeline, and budget changes against a real Service PO baseline." />

      <div className="max-w-md mb-6">
        <SearchableSelect
          options={options}
          value={poId}
          onValueChange={setPoId}
          placeholder="Select a Service PO..."
          searchPlaceholder="Search Service POs..."
        />
      </div>

      {!poId && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Sliders className="h-6 w-6 mx-auto mb-2 opacity-50" />
          Pick a Service PO above to start simulating.
        </div>
      )}

      {poId && baseline && scenario && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1 h-fit">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Levers</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <Slider
                label="Add / Reduce Developers"
                value={developersDelta}
                onChange={setDevelopersDelta}
                min={-Math.min(5, baseline.teamSize - 1)}
                max={5}
                format={(v) => (v > 0 ? `+${v}` : v)}
              />
              <Slider
                label="Delay Project (days)"
                value={delayDays}
                onChange={setDelayDays}
                min={0}
                max={90}
                format={(v) => `${v}d`}
              />
              <Slider
                label="Increase / Decrease Budget"
                value={budgetDeltaPct}
                onChange={setBudgetDeltaPct}
                min={-30}
                max={50}
                format={(v) => `${v > 0 ? '+' : ''}${v}%`}
              />
              <div className="text-[11px] text-muted-foreground pt-2 border-t space-y-0.5">
                <p>Baseline team: {baseline.teamSize}</p>
                <p>Baseline end date: {formatDate(baseline.end)}</p>
                <p>Remaining hours: {baseline.remainingHours.toFixed(0)}</p>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ImpactTile
              icon={CalendarClock}
              label="Timeline Impact"
              value={scenario.newEndDate ? formatDate(scenario.newEndDate) : '—'}
              note={`${scenario.timelineDeltaDays >= 0 ? '+' : ''}${scenario.timelineDeltaDays} days vs baseline`}
            />
            <ImpactTile
              icon={Wallet}
              label="Cost Impact"
              value={formatCurrency(scenario.staffingCostDelta + scenario.budgetDelta)}
              note="Staffing change + budget adjustment"
            />
            <ImpactTile
              icon={Users}
              label="Bench Impact"
              value={`${scenario.benchDelta >= 0 ? '+' : ''}${scenario.benchDelta}`}
              note={scenario.benchDelta > 0 ? 'Resources freed up to bench' : scenario.benchDelta < 0 ? 'Resources pulled from bench' : 'No change'}
            />
            <ImpactTile
              icon={Activity}
              label="Utilization Impact"
              value={formatPercentage(scenario.newUtilization)}
              note={`${scenario.utilizationDelta >= 0 ? '+' : ''}${scenario.utilizationDelta.toFixed(1)} pts vs baseline`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatIfSimulator;
