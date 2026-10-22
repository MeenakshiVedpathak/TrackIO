import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Sparkles, Users } from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import { useAIQuery } from '@/hooks/useAIQuery';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useResourceProjectUtilization } from '@/hooks/useReports';
import { useMonthlyCosts } from '@/hooks/useMonthlyCosts';
import { useAuth } from '@/hooks/useAuth';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate, formatPercentage } from '@/utils/formatters';

const now = new Date();
// Timesheets/costs are only uploaded at month-end, so the CURRENT calendar month never has
// real data yet — every lookup here (AI utilization query, the usage report, monthly costs)
// targets the last COMPLETED month instead.
const lastCompletedMonth = dayjs().subtract(1, 'month');
const REPORT_MONTH = lastCompletedMonth.month() + 1;
const REPORT_YEAR = lastCompletedMonth.year();
const REPORT_MONTH_LABEL = lastCompletedMonth.format('MMMM');
const UNDERUTILIZED_THRESHOLD = 60;

// "recommendation" is a recognized-but-unsupported AI intent today (see /api/v1/ai/query
// docs), so this page composes the ranking itself from three real, already-available
// sources instead of asking the AI for it: (1) who's underutilized last month (the AI's
// own supported "utilization" intent, which returns real per-employee numbers), (2) who
// has already worked on the selected Service Type last month (resource-project-utilization
// report), and (3) their monthly cost record. No fabricated skill-match percentage or
// hourly rate — "Experience Match" and "Monthly Cost" are both real, traceable figures.
const ResourceRecommendations = () => {
  const { roleObjects } = useAuth();
  const [serviceTypeId, setServiceTypeId] = useState('');
  const { data: serviceTypes = [] } = useActiveServiceTypes();
  const utilQuery = useAIQuery();

  const { data: typeUsageRes, isPending: typeUsageLoading } = useResourceProjectUtilization({
    month: REPORT_MONTH, year: REPORT_YEAR, roleId: roleObjects[0]?.id, hoursSource: 'M',
    page: 1, limit: 200, ...(serviceTypeId && { serviceTypeIds: serviceTypeId }),
  });
  const { data: costsRes } = useMonthlyCosts({ month: REPORT_MONTH, year: REPORT_YEAR, limit: 200 });

  useEffect(() => {
    utilQuery.ask(`Who was underutilized in ${REPORT_MONTH_LABEL}?`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const experiencedNames = useMemo(() => {
    const rows = Array.isArray(typeUsageRes?.data) ? typeUsageRes.data : [];
    return new Set(rows.map((r) => r.employeeName?.toLowerCase()).filter(Boolean));
  }, [typeUsageRes]);

  const costByName = useMemo(() => {
    const rows = Array.isArray(costsRes?.data) ? costsRes.data : [];
    const map = new Map();
    rows.forEach((r) => {
      const name = (r.employee_name ?? r.employee?.full_name ?? '').toLowerCase();
      if (name) map.set(name, r.total_cost);
    });
    return map;
  }, [costsRes]);

  const recommendations = useMemo(() => {
    const employees = utilQuery.raw?.data?.utilization?.employees ?? [];
    return employees
      .filter((e) => (e.total_utilization_excl_leaves_pct ?? 0) < UNDERUTILIZED_THRESHOLD)
      .map((e) => {
        const nameKey = (e.full_name ?? '').toLowerCase();
        const hasExperience = serviceTypeId ? experiencedNames.has(nameKey) : null;
        return {
          ...e,
          hasExperience,
          monthlyCost: costByName.get(nameKey),
          availability: 100 - (e.total_utilization_excl_leaves_pct ?? 0),
        };
      })
      .sort((a, b) => {
        if (serviceTypeId && a.hasExperience !== b.hasExperience) return a.hasExperience ? -1 : 1;
        return b.availability - a.availability;
      })
      .slice(0, 8);
  }, [utilQuery.raw, serviceTypeId, experiencedNames, costByName]);

  const selectedTypeName = serviceTypes.find((t) => String(t.id) === serviceTypeId)?.name;

  return (
    <div className="pb-8">
      <AIPageHeader
        title="Resource Recommendations"
        description={`Underutilized resources in ${REPORT_MONTH_LABEL} (the latest month with uploaded data), ranked by availability and prior experience with the selected Service Type.`}
      />

      <div className="max-w-md mb-6">
        <SearchableSelect
          options={serviceTypes.map((t) => ({ value: t.id, label: t.name }))}
          value={serviceTypeId}
          onValueChange={setServiceTypeId}
          placeholder="Filter by Service Type (optional)..."
          searchPlaceholder="Search Service Types..."
        />
      </div>

      {(utilQuery.loading || typeUsageLoading) ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : utilQuery.error ? (
        <Card className="border-destructive/30"><CardContent className="p-5 text-sm text-destructive">{utilQuery.error}</CardContent></Card>
      ) : recommendations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Users className="h-6 w-6 mx-auto mb-2 opacity-50" />
          No underutilized resources found in {REPORT_MONTH_LABEL}.
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((r) => (
            <Card key={r.employee_id}>
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.hasExperience === true && `Has prior experience with ${selectedTypeName} in ${REPORT_MONTH_LABEL}`}
                    {r.hasExperience === false && `No logged hours on ${selectedTypeName} in ${REPORT_MONTH_LABEL}`}
                    {r.hasExperience === null && 'Select a Service Type to check experience match'}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-sm">
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Availability</p>
                    <p className="font-semibold tabular-nums">{formatPercentage(r.availability)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Monthly Cost</p>
                    <p className="font-semibold tabular-nums">{r.monthlyCost != null ? formatCurrency(r.monthlyCost) : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Start Date</p>
                    <p className="font-semibold">{formatDate(now)}</p>
                  </div>
                  {r.hasExperience && <Badge variant="success" className="gap-1"><Sparkles className="h-3 w-3" /> Match</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResourceRecommendations;
