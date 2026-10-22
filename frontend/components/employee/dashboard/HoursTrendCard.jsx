import { useState, useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Customized,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Calculator, CalendarOff } from 'lucide-react';
import { formatHourMinuteValue } from '@/utils/formatters';
import { isNonWorkingDay } from '@/utils/workDayStatus';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (point && isNonWorkingDay(point.status)) {
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg text-xs">
        <p className="mb-0.5 font-semibold text-foreground">{label}</p>
        <p className="text-muted-foreground">{point.status === 'holiday' ? 'Holiday' : 'Weekend'} — no log required</p>
      </div>
    );
  }
  const hours = Number(payload[0]?.value) || 0;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg text-xs">
      <p className="mb-0.5 font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground">{formatHourMinuteValue(hours)}h logged</p>
    </div>
  );
};

// Value label drawn above each logged bar. Skipped for weekend/holiday (those get the hatched
// overlay instead) and for a 0h weekday (nothing logged, no hour worth labeling).
const HourLabel = ({ x, y, width, value, index, data }) => {
  const d = data[index];
  if (!d || isNonWorkingDay(d.status) || !value) return null;
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">
      {formatHourMinuteValue(value)}h
    </text>
  );
};

// Drawn via the chart's public <Customized> hook (not Bar's internal `background` prop, whose
// per-item props aren't part of Recharts' stable API) so a weekend/holiday column renders as a
// full-height hatched placeholder — same column width and baseline as a real bar, just no bar and
// no fake 0h value — instead of an empty gap. Only fires for daily-view items (weekly buckets
// carry no `status`), so the Weekly toggle is unaffected.
const WeekendOverlay = ({ xAxisMap, yAxisMap, data }) => {
  const xAxis = xAxisMap && Object.values(xAxisMap)[0];
  const yAxis = yAxisMap && Object.values(yAxisMap)[0];
  if (!xAxis?.scale || !yAxis) return null;
  const top = Math.min(yAxis.y, yAxis.y + yAxis.height);
  const height = Math.abs(yAxis.height);
  const fullBandwidth = xAxis.scale.bandwidth ? xAxis.scale.bandwidth() : 0;
  if (!fullBandwidth) return null;
  // Mirrors the chart's own barCategoryGap="30%" so a weekend column lines up with, and is
  // exactly as wide as, a real bar in the neighboring columns — not a full-bleed block that
  // merges into the next weekend column.
  const bandwidth = fullBandwidth * 0.7;
  const offset = (fullBandwidth - bandwidth) / 2;

  return (
    <g>
      {data.filter((d) => isNonWorkingDay(d.status)).map((d) => {
        const bandX = xAxis.scale(d.label);
        if (bandX == null) return null;
        const x = bandX + offset;
        return (
          <g key={d.key}>
            <rect x={x} y={top} width={bandwidth} height={height} rx={6} fill="url(#weekend-hatch)" stroke="hsl(var(--border))" strokeWidth={1} />
            <foreignObject x={x} y={top} width={bandwidth} height={height}>
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <CalendarOff className="h-4 w-4 opacity-70" />
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
};

// `dailyData`/`weeklyData` are each `[{key, label, hours, isCurrent, workingDays, status?, ...}]`
// — daily = last 7 real calendar days (status comes from classifyWorkDay, shared with
// WorkLogStatusCard so the two widgets never disagree), weekly = last 4 rolling 7-day buckets (see
// EmployeeDashboard.jsx for why 4 weeks, not more; weekly buckets don't carry a `status` since
// they span 7 days, not one).
const HoursTrendCard = ({ dailyData = [], weeklyData = [], isLoading }) => {
  const [view, setView] = useState('daily');
  const data = view === 'daily' ? dailyData : weeklyData;

  // Working days (not sheer day count) is the divisor for "Avg / Working Day" — a weekend/holiday
  // with no log isn't a missed working day, so it must not drag the average down, while a logged
  // weekend already counts (its `workingDays` is 1, set alongside `status: 'logged'`).
  const { total, avg } = useMemo(() => {
    const sum = data.reduce((s, d) => s + (Number(d.hours) || 0), 0);
    const workingDays = data.reduce((s, d) => s + (Number(d.workingDays) || 0), 0);
    return { total: sum, avg: workingDays ? sum / workingDays : 0 };
  }, [data]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Hours Trend {view === 'daily' ? '(Last 7 Days)' : '(Last 4 Weeks)'}
        </CardTitle>
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="h-8 p-0.5">
            <TabsTrigger value="daily" className="px-2.5 py-1 text-xs">Daily</TabsTrigger>
            <TabsTrigger value="weekly" className="px-2.5 py-1 text-xs">Weekly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col overflow-hidden">
        <div className="w-full overflow-x-auto">
          <ResponsiveContainer width="100%" height={180} minWidth={280}>
            <BarChart data={data} margin={{ top: 20, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
              <defs>
                <pattern id="weekend-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="hsl(var(--muted))" fillOpacity="0.5" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.3" strokeWidth="2" />
                </pattern>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}h`}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} />
              {view === 'daily' && <Customized component={(props) => <WeekendOverlay {...props} data={data} />} />}
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.key} fill={isNonWorkingDay(d.status) ? 'transparent' : (d.isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.35)')} />
                ))}
                <LabelList dataKey="hours" content={(props) => <HourLabel {...props} data={data} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
              <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] leading-tight text-muted-foreground">Total (Working Days)</p>
                <p className="text-sm font-semibold leading-tight text-foreground">{formatHourMinuteValue(total)}h</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
              <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] leading-tight text-muted-foreground">Avg / Working Day</p>
                <p className="text-sm font-semibold leading-tight text-foreground">{formatHourMinuteValue(avg)}h</p>
              </div>
            </div>
          </div>
          {view === 'daily' && (
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> Logged Hours
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm border border-muted-foreground/40"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.35) 0px, hsl(var(--muted-foreground) / 0.35) 1px, transparent 1px, transparent 3px)' }}
                />
                Weekend (No log required)
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default HoursTrendCard;
