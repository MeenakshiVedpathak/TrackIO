import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { Briefcase, Users, AlertTriangle, ChevronLeft, ChevronRight, Clock, Filter, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';

const PAGE_SIZE = 9;

const EMP_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const cNum = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString('en-IN');

/* ── Stat card ── */
const StatItem = ({ label, value, icon: Icon, cardBg, borderColor, iconBg, iconColor, valueColor, subtext }) => (
  <div className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg border w-full', cardBg, borderColor)}>
    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', iconBg)}>
      <Icon className={cn('h-4 w-4', iconColor)} />
    </div>
    <div>
      <p className={cn('text-base font-extrabold tabular-nums leading-none', valueColor)}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1 leading-none">{label}</p>
      {subtext && <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-none">{subtext}</p>}
    </div>
  </div>
);

/* ── PO card ── */
const POCard = ({ po, rank }) => {
  const active = (po.top_employees ?? []).filter((e) => e.hours > 0);
  const totalH = active.reduce((s, e) => s + e.hours, 0);

  return (
    <div className="rounded-xl border bg-card flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b bg-muted/20">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[11px] font-bold text-primary">{rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug text-foreground line-clamp-2">
            {po.service_po_name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {po.client_name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={cn(
            'text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none',
            po.is_billable
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
          )}>
            {po.is_billable ? 'Billable' : 'Non-Billable'}
          </span>
          {totalH > 0 && (
            <span className="text-xs font-bold tabular-nums text-foreground">{totalH}h</span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex-1">
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">No hours logged this month</p>
        ) : (
          <div className="space-y-3">
            {active.map((e, i) => {
              const pct   = totalH > 0 ? (e.hours / totalH) * 100 : 0;
              const color = EMP_COLORS[i % EMP_COLORS.length];
              const isTop = i === 0;
              return (
                <div key={e.employee_id}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isTop && (
                        <span className="text-[9px] font-bold px-1 py-px rounded bg-primary/10 text-primary leading-none shrink-0">
                          #1
                        </span>
                      )}
                      <span className={cn(
                        'text-xs leading-tight truncate',
                        isTop ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      )}>
                        {e.full_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{e.hours}h</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {active.length > 0 && (
        <div className="px-4 py-2.5 border-t bg-muted/10 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {active.length} contributor{active.length !== 1 ? 's' : ''}
            {active.length === 1 && (
              <span className="ml-1.5 text-amber-500 font-medium">· sole contributor</span>
            )}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{po.service_po_code}</span>
        </div>
      )}
    </div>
  );
};

/* ── Skeleton grid ── */
const SkeletonGrid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
    {Array.from({ length: PAGE_SIZE }).map((_, i) => (
      <div key={i} className="rounded-xl border overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b bg-muted/20 flex gap-3">
          <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
        <div className="px-4 py-3 space-y-4">
          {[...Array(3)].map((__, j) => (
            <div key={j} className="space-y-1.5">
              <div className="flex justify-between gap-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/* ── Main component ── */
const TopEmployeesByPOPanel = ({ data = [], isLoading, month, year }) => {
  const [categoryId, setCategoryId] = useState('all');
  const [poFilterId, setPoFilterId] = useState('all');
  const [clientPage, setClientPage] = useState(1);

  /* ── Dropdown data ── */
  const { data: activePOOptions = [] }         = useActiveServicePOs();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const { data: activeServiceTypes = [] }      = useActiveServiceTypes();

  /* ── Category → Service PO, same cascade used in the other reports ── */
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    activeServiceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [activeServiceTypes]);

  const filteredPOOptions = useMemo(() => {
    if (categoryId === 'all') return activePOOptions;
    return activePOOptions.filter((po) => {
      const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
      return poTypeId != null && typeCategoryMap.get(poTypeId) === categoryId;
    });
  }, [activePOOptions, categoryId, typeCategoryMap]);

  const selectedCategoryName = useMemo(
    () => activeServiceCategories.find((c) => String(c.id) === categoryId)?.name,
    [activeServiceCategories, categoryId]
  );

  const handleCategoryChange = (v) => {
    setCategoryId(v);
    setPoFilterId('all');
  };

  /* ── Client-side filtering using fields already present in the response ── */
  const filteredData = useMemo(() => {
    let result = data;

    if (poFilterId !== 'all') {
      result = result.filter((po) => String(po.service_po_id) === poFilterId);
    }

    if (categoryId !== 'all') {
      result = result.filter((po) => po.category_name === selectedCategoryName);
    }

    return result;
  }, [data, poFilterId, categoryId, selectedCategoryName]);

  /* ── Reset page when filters change ── */
  useEffect(() => { setClientPage(1); }, [poFilterId, categoryId]);

  /* ── Client-side pagination ── */
  const totalPages   = Math.ceil(filteredData.length / PAGE_SIZE);
  const paginatedData = filteredData.slice((clientPage - 1) * PAGE_SIZE, clientPage * PAGE_SIZE);

  const monthLabel = month && year
    ? new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    : 'This Month';

  /* ── Summary stats (from filtered data) ── */
  const activePOs = filteredData.filter((po) =>
    (po.top_employees ?? []).some((e) => e.hours > 0)
  );
  const singleContributorCount = activePOs.filter(
    (po) => (po.top_employees ?? []).filter((e) => e.hours > 0).length === 1
  ).length;
  const totalHours = filteredData.reduce(
    (s, po) => s + (po.top_employees ?? []).reduce((ps, e) => ps + (e.hours || 0), 0),
    0
  );
  const billableHours = filteredData
    .filter((po) => po.is_billable)
    .reduce((s, po) => s + (po.top_employees ?? []).reduce((ps, e) => ps + (e.hours || 0), 0), 0);
  const nonBillableHours = filteredData
    .filter((po) => !po.is_billable)
    .reduce((s, po) => s + (po.top_employees ?? []).reduce((ps, e) => ps + (e.hours || 0), 0), 0);
  const billablePct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  const isFiltered = categoryId !== 'all' || poFilterId !== 'all';

  return (
    <Card className="overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 border-b bg-gradient-to-r from-primary/[0.04] via-primary/[0.02] to-transparent">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Briefcase className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-none">Employees by Service PO</p>
              <p className="text-xs text-muted-foreground mt-1 leading-none">Contributor hours per project · {monthLabel}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SearchableSelect
              options={[
                { label: 'All Categories', value: 'all' },
                ...activeServiceCategories.map((c) => ({ label: c.name, value: String(c.id) })),
              ]}
              value={categoryId}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              className="h-8 w-36 text-xs"
            />
            <SearchableSelect
              options={[
                { label: 'All POs', value: 'all' },
                ...filteredPOOptions.map((po) => ({
                  label: po.service_po_name || po.service_po_code || String(po.id),
                  value: String(po.id),
                })),
              ]}
              value={poFilterId}
              onValueChange={setPoFilterId}
              placeholder="All POs"
              className="h-8 w-48 text-xs"
            />
          </div>
        </div>

        {/* ── Stat cards ── */}
        {!isLoading && filteredData.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatItem
              label="Active POs"
              value={activePOs.length}
              icon={Briefcase}
              cardBg="bg-blue-50 dark:bg-blue-950/30"
              borderColor="border-blue-200 dark:border-blue-800"
              iconBg="bg-blue-100 dark:bg-blue-900/50"
              iconColor="text-blue-600 dark:text-blue-400"
              valueColor="text-blue-700 dark:text-blue-300"
            />
            <StatItem
              label="Total Hours"
              value={`${cNum(totalHours)} hrs`}
              icon={Clock}
              cardBg="bg-emerald-50 dark:bg-emerald-950/30"
              borderColor="border-emerald-200 dark:border-emerald-800"
              iconBg="bg-emerald-100 dark:bg-emerald-900/50"
              iconColor="text-emerald-600 dark:text-emerald-400"
              valueColor="text-emerald-700 dark:text-emerald-300"
              subtext="top contributors only"
            />
            <StatItem
              label="Billable Hours"
              value={`${cNum(billableHours)} hrs`}
              icon={TrendingUp}
              cardBg="bg-indigo-50 dark:bg-indigo-950/30"
              borderColor="border-indigo-200 dark:border-indigo-800"
              iconBg="bg-indigo-100 dark:bg-indigo-900/50"
              iconColor="text-indigo-600 dark:text-indigo-400"
              valueColor="text-indigo-700 dark:text-indigo-300"
              subtext={`${billablePct}% of total`}
            />
            <StatItem
              label="Non-Billable"
              value={`${cNum(nonBillableHours)} hrs`}
              icon={TrendingDown}
              cardBg="bg-orange-50 dark:bg-orange-950/30"
              borderColor="border-orange-200 dark:border-orange-800"
              iconBg="bg-orange-100 dark:bg-orange-900/50"
              iconColor="text-orange-600 dark:text-orange-400"
              valueColor="text-orange-700 dark:text-orange-300"
              subtext={`${100 - billablePct}% of total`}
            />
            <StatItem
              label="Sole Contributor"
              value={singleContributorCount}
              icon={AlertTriangle}
              cardBg="bg-amber-50 dark:bg-amber-950/30"
              borderColor="border-amber-200 dark:border-amber-800"
              iconBg="bg-amber-100 dark:bg-amber-900/50"
              iconColor="text-amber-600 dark:text-amber-400"
              valueColor="text-amber-700 dark:text-amber-300"
              subtext="POs with single person"
            />
          </div>
        )}
      </div>

      <CardContent className="pt-4">
        {isLoading && <SkeletonGrid />}

        {!isLoading && filteredData.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title={isFiltered ? 'No results for this filter' : 'No PO data for this period'}
            description={
              isFiltered
                ? 'Try changing or clearing the filters above.'
                : 'Data will appear once timesheets are submitted against Service POs.'
            }
          />
        )}

        {!isLoading && filteredData.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedData.map((po, idx) => (
                <POCard
                  key={po.service_po_id}
                  po={po}
                  rank={(clientPage - 1) * PAGE_SIZE + idx + 1}
                />
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min((clientPage - 1) * PAGE_SIZE + 1, filteredData.length)}–{Math.min(clientPage * PAGE_SIZE, filteredData.length)} of {filteredData.length} service POs
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setClientPage((p) => p - 1)}
                    disabled={clientPage <= 1}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {clientPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setClientPage((p) => p + 1)}
                    disabled={clientPage >= totalPages}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TopEmployeesByPOPanel;
