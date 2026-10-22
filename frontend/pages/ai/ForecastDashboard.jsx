import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { TrendingUp, Activity, Users, UserPlus, TriangleAlert, Sparkles } from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import { useAIQuery } from '@/hooks/useAIQuery';
import { useDashboardAnalytics } from '@/hooks/useDashboard';
import { aiCopilotApi } from '@/api/aiCopilot.api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

const now = new Date();
const DEFAULT_FY = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;

// Forecasting is a recognized-but-unsupported AI intent today (see /api/v1/ai/query docs),
// so every projection here is a real trend computed from actual historical data — never
// asked of the AI as a single "predict the future" call. Revenue uses 3 real monthly AI
// answers (the "revenue" intent IS supported, just not multi-month in one call); utilization
// uses the real monthly_hours_trend chart already used by the Dashboard.
//
// Timesheets/costs are only uploaded at month-end, so the CURRENT calendar month always
// has zero real data — trending off it would corrupt the fit with a fake "sudden drop".
// Revenue explicitly walks the last 3 COMPLETED months (offsets 3,2,1 — skipping 0, this
// month). Utilization doesn't need the same offset: the current month's 0 logged hours
// already fails the `total > 0` check below and gets filtered out naturally.
const lastMonth = dayjs().subtract(1, 'month').format('MMMM');

// Simple least-squares linear fit over equally-spaced points; projectAhead(k) extrapolates
// k steps past the last known point.
const linearFit = (points) => {
  const n = points.length;
  if (n === 0) return { projectAhead: () => 0 };
  if (n === 1) return { projectAhead: () => points[0] };
  const xs = points.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = points.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((acc, x, i) => acc + (x - xMean) * (points[i] - yMean), 0);
  const den = xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0) || 1;
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  return { projectAhead: (k) => intercept + slope * (n - 1 + k) };
};

const ForecastCard = ({ icon: Icon, title, loading, children }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm flex items-center gap-1.5"><Icon className="h-4 w-4 text-primary" /> {title}</CardTitle>
    </CardHeader>
    <CardContent>{loading ? <Skeleton className="h-20 w-full" /> : children}</CardContent>
  </Card>
);

const HORIZONS = [30, 60, 90];

const ForecastDashboard = () => {
  const { roleObjects } = useAuth();
  const [revenuePoints, setRevenuePoints] = useState(null);
  const bench = useAIQuery();
  const risk = useAIQuery();
  const { data: analytics, isLoading: analyticsLoading } = useDashboardAnalytics({ fiscalYear: DEFAULT_FY });

  useEffect(() => {
    bench.ask(`How many resources were on the bench in ${lastMonth}?`);
    risk.ask('Which projects are at risk of going over budget or timeline in the coming months?');

    const months = [3, 2, 1].map((offset) => dayjs().subtract(offset, 'month'));
    Promise.all(
      months.map((m) =>
        aiCopilotApi
          .query({ question: `What was our revenue in ${m.format('MMMM YYYY')}?`, roleId: roleObjects[0]?.id, hoursSource: 'M' })
          .then((res) => ({ label: m.format('MMM YY'), value: Number(res?.data?.data?.revenue?.total_po_value ?? 0) }))
          .catch(() => ({ label: m.format('MMM YY'), value: null })),
      ),
    ).then((results) => setRevenuePoints(results));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const utilizationHistory = useMemo(() => {
    const rows = analytics?.charts?.monthly_hours_trend ?? [];
    return rows
      .map((r) => {
        const total = (r.Billable ?? 0) + (r['Non-Billable'] ?? 0) + (r['Customer Non-Billable'] ?? 0) + (r.Other ?? 0);
        return { label: r.label, pct: total > 0 ? ((r.Billable ?? 0) / total) * 100 : null };
      })
      .filter((r) => r.pct != null);
  }, [analytics]);

  const utilFit = linearFit(utilizationHistory.map((r) => r.pct));
  const utilForecast = HORIZONS.map((days) => ({ days, value: Math.max(0, Math.min(100, utilFit.projectAhead(days / 30))) }));

  const knownRevenuePoints = revenuePoints?.filter((p) => p.value != null) ?? [];
  const revenueFit = knownRevenuePoints.length > 0 ? linearFit(knownRevenuePoints.map((p) => p.value)) : null;
  const revenueForecast = revenueFit ? HORIZONS.map((days) => ({ days, value: Math.max(0, revenueFit.projectAhead(days / 30)) })) : null;

  const projectedUtil90 = utilForecast[2]?.value ?? 0;
  const suggestedHires = projectedUtil90 > 85 ? Math.ceil((projectedUtil90 - 85) / 10) : 0;

  return (
    <div className="pb-8">
      <AIPageHeader
        title="Forecast Dashboard"
        description="30/60/90-day trend-based projections computed from real historical data."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ForecastCard icon={TrendingUp} title="Revenue Forecast" loading={!revenuePoints}>
          {revenueForecast ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {revenueForecast.map((f) => (
                <div key={f.days} className="text-center">
                  <p className="text-[11px] text-muted-foreground">{f.days} days</p>
                  <p className="text-sm font-bold tabular-nums mt-0.5">{formatCurrency(f.value)}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground italic">Not enough historical data yet.</p>}
          <p className="text-[11px] text-muted-foreground mt-3">Based on the last 3 completed months' real revenue.</p>
        </ForecastCard>

        <ForecastCard icon={Activity} title="Utilization Forecast" loading={analyticsLoading}>
          {utilizationHistory.length >= 2 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {utilForecast.map((f) => (
                <div key={f.days} className="text-center">
                  <p className="text-[11px] text-muted-foreground">{f.days} days</p>
                  <p className="text-sm font-bold tabular-nums mt-0.5">{formatPercentage(f.value)}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground italic">Not enough historical data yet this fiscal year.</p>}
          <p className="text-[11px] text-muted-foreground mt-3">Billable-hours share of total logged hours, projected from this fiscal year's monthly trend.</p>
        </ForecastCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ForecastCard icon={Users} title="Bench Forecast" loading={bench.loading}>
          <p className="text-sm text-foreground/85 leading-relaxed">{bench.answer?.summary ?? bench.error ?? '—'}</p>
        </ForecastCard>

        <ForecastCard icon={UserPlus} title="Hiring Forecast" loading={analyticsLoading}>
          <p className="text-2xl font-extrabold tabular-nums">{suggestedHires}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {suggestedHires > 0
              ? `Suggested additional hires — projected 90-day utilization (${formatPercentage(projectedUtil90)}) exceeds an 85% healthy-capacity threshold.`
              : 'No additional hires suggested — projected 90-day utilization stays within a healthy range.'}
          </p>
        </ForecastCard>
      </div>

      <ForecastCard icon={TriangleAlert} title="Project Risk Forecast" loading={risk.loading}>
        <div className="space-y-2">
          <p className="text-sm text-foreground/85 leading-relaxed">{risk.answer?.summary ?? risk.error ?? '—'}</p>
          {risk.answer?.actions?.map((a, i) => (
            <p key={i} className="text-sm text-foreground/85 flex items-start gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /> {a}</p>
          ))}
        </div>
      </ForecastCard>
    </div>
  );
};

export default ForecastDashboard;
