import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { HeartPulse, Wallet, CalendarClock, Activity, Users, Sparkles } from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import { useAIQuery } from '@/hooks/useAIQuery';
import { useActiveServicePOs, useServicePO, useServicePOUtilisation } from '@/hooks/useServicePOs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatHours, formatPercentage } from '@/utils/formatters';

// Project Health is a "recognized-but-unsupported" AI intent today (see /api/v1/ai/query
// docs — project_health is on the unsupported list), so the health score here is computed
// deterministically from real Service PO data rather than asked of the AI. The AI Notes
// section below still asks a real, supported "project" question for qualitative commentary.
const LAST_MONTH_LABEL = dayjs().subtract(1, 'month').format('MMMM YYYY');

const computeHealth = (po, utilisation) => {
  const expectedHours = Number(po?.expected_man_hours ?? 0);
  const loggedHours = Number(utilisation?.total_hours_logged ?? utilisation?.hours_logged ?? 0);
  const hoursBudgetPct = expectedHours > 0 ? (loggedHours / expectedHours) * 100 : null;

  const start = po?.start_date ? new Date(po.start_date) : null;
  const end = po?.end_date ? new Date(po.end_date) : null;
  const today = new Date();
  const timelinePct = start && end && end > start
    ? Math.min(100, Math.max(0, ((today - start) / (end - start)) * 100))
    : null;

  const teamSize = (po?.employees ?? po?.allocated_employees ?? []).length;
  const resourceRisk = teamSize === 0 ? 'High — unstaffed' : teamSize === 1 ? 'High — sole contributor' : teamSize === 2 ? 'Medium — thin bench' : 'Low';

  // Score: penalize hours-budget overrun and a big gap between pace (hours consumed)
  // and timeline elapsed, plus a resource-risk penalty. Purely arithmetic, not AI-derived.
  let score = 100;
  if (hoursBudgetPct != null) {
    if (hoursBudgetPct > 100) score -= Math.min(40, (hoursBudgetPct - 100) * 1.5);
  }
  if (hoursBudgetPct != null && timelinePct != null) {
    const gap = Math.abs(hoursBudgetPct - timelinePct);
    score -= Math.min(30, gap * 0.5);
  }
  if (teamSize <= 1) score -= 15;
  else if (teamSize === 2) score -= 5;
  score = Math.max(0, Math.round(score));

  const status = score >= 75 ? 'Healthy' : score >= 50 ? 'At Risk' : 'Critical';
  const statusVariant = score >= 75 ? 'success' : score >= 50 ? 'warning' : 'destructive';

  return { hoursBudgetPct, timelinePct, teamSize, resourceRisk, score, status, statusVariant, expectedHours, loggedHours };
};

const ProjectHealthCard = () => {
  const [poId, setPoId] = useState('');
  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: po, isPending: poLoading } = useServicePO(poId);
  const { data: utilisation } = useServicePOUtilisation(poId);
  const notes = useAIQuery();

  const options = useMemo(
    () => activePOs.map((p) => ({ value: p.id, label: `${p.service_po_name} (${p.service_po_code ?? p.client_name ?? ''})` })),
    [activePOs],
  );

  const health = useMemo(() => (po ? computeHealth(po, utilisation) : null), [po, utilisation]);

  useEffect(() => {
    if (po?.service_po_name) {
      notes.ask(`How did the project "${po.service_po_name}" perform in ${LAST_MONTH_LABEL}?`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.service_po_name]);

  return (
    <div className="pb-8">
      <AIPageHeader
        title="Project Health Card"
        description="Health score computed from real budget, timeline, and staffing data for a Service PO."
      />

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
          <HeartPulse className="h-6 w-6 mx-auto mb-2 opacity-50" />
          Pick a Service PO above to see its health card.
        </div>
      )}

      {poId && (poLoading || !health) && (
        <Card><CardContent className="p-5"><Skeleton className="h-40 w-full" /></CardContent></Card>
      )}

      {poId && health && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5 55%, #2563eb)' }} />
            <CardContent className="p-5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Overall Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-extrabold tabular-nums">{health.score}</span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                  <Badge variant={health.statusVariant}>{health.status}</Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{po.service_po_name}</p>
                <p className="text-xs text-muted-foreground">{po.client_name}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Budget (Hours)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-lg font-bold tabular-nums">{health.hoursBudgetPct != null ? formatPercentage(health.hoursBudgetPct) : '—'}</p>
                <Progress value={Math.min(100, health.hoursBudgetPct ?? 0)} className="h-1.5 mt-2" />
                <p className="text-[11px] text-muted-foreground mt-1">{formatHours(health.loggedHours)} of {formatHours(health.expectedHours)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Timeline</CardTitle></CardHeader>
              <CardContent>
                <p className="text-lg font-bold tabular-nums">{health.timelinePct != null ? formatPercentage(health.timelinePct) : '—'}</p>
                <Progress value={health.timelinePct ?? 0} className="h-1.5 mt-2" />
                <p className="text-[11px] text-muted-foreground mt-1">{formatDate(po.start_date)} → {formatDate(po.end_date)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground"><Activity className="h-3.5 w-3.5" /> Pace vs Timeline</CardTitle></CardHeader>
              <CardContent>
                <p className="text-lg font-bold tabular-nums">
                  {health.hoursBudgetPct != null && health.timelinePct != null ? `${(health.hoursBudgetPct - health.timelinePct).toFixed(0)} pts` : '—'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Hours consumed minus time elapsed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Resource Risk</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-semibold">{health.resourceRisk}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{health.teamSize} allocated resource{health.teamSize === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> AI Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.loading ? <Skeleton className="h-12 w-full" /> : (
                <p className="text-sm text-foreground/85 leading-relaxed">{notes.answer?.summary ?? notes.error ?? '—'}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProjectHealthCard;
