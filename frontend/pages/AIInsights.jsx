import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ArrowLeft, RefreshCw, AlertCircle, AlertTriangle, Activity, DollarSign,
  Calendar, Clock, Briefcase, ListChecks, Lightbulb, Info, CheckCircle2, ArrowRight, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import { useAIInsights } from '@/hooks/useAIInsights';
import { ROUTES } from '@/constants/routes';
import { formatRelativeTime, formatDateTime } from '@/utils/formatters';
import { cn } from '@/utils/cn';

/* job_key → tab group, drives the category filter */
const CATEGORY_META = {
  quarter_end_review:      { group: 'digest',      icon: Calendar },
  weekly_resource_digest:  { group: 'digest',      icon: Calendar },
  monthly_cost_commentary: { group: 'cost',        icon: DollarSign },
  client_concentration:    { group: 'cost',        icon: DollarSign },
  sole_contributor_risk:   { group: 'risk',        icon: AlertCircle },
  bench_escalation:        { group: 'risk',        icon: AlertCircle },
  utilization_anomaly:     { group: 'utilization', icon: Activity },
  timesheet_compliance:    { group: 'compliance',  icon: Clock },
  po_ending_alerts:        { group: 'resourcing',  icon: Briefcase },
};

const CATEGORIES = [
  { value: 'all',         label: 'All',            icon: Sparkles },
  { value: 'digest',      label: 'Digest',         icon: Calendar },
  { value: 'risk',        label: 'Bench & Risk',   icon: AlertCircle },
  { value: 'utilization', label: 'Utilization',    icon: Activity },
  { value: 'cost',        label: 'Cost',           icon: DollarSign },
  { value: 'compliance',  label: 'Compliance',     icon: Clock },
  { value: 'resourcing',  label: 'Resourcing',     icon: Briefcase },
];

const SEVERITY_STYLES = {
  critical: { bar: 'bg-red-500',     icon: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',       title: 'text-red-800 dark:text-red-300',       badge: 'destructive', glow: 'rgba(239,68,68,' },
  warning:  { bar: 'bg-amber-500',   icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400', title: 'text-amber-800 dark:text-amber-300', badge: 'warning',     glow: 'rgba(245,158,11,' },
  info:     { bar: 'bg-sky-500',     icon: 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400',         title: 'text-sky-800 dark:text-sky-300',     badge: 'info',        glow: 'rgba(14,165,233,' },
  success:  { bar: 'bg-emerald-500', icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400', title: 'text-emerald-800 dark:text-emerald-300', badge: 'success', glow: 'rgba(16,185,129,' },
};
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, success: 3 };

const cardContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: 'easeOut' } },
};

/* pulsing "live" dot — signals freshly generated / unread content */
const LiveDot = ({ className }) => (
  <span className={cn('relative flex h-1.5 w-1.5', className)}>
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
  </span>
);

const FilterChip = ({ label, onClear, capitalize }) => (
  <button
    onClick={onClear}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
      capitalize && 'capitalize',
    )}
  >
    {label} <X className="h-3 w-3" />
  </button>
);

const TIMELINE_THEME = {
  findings: { dot: 'bg-slate-500', line: 'from-slate-400/50', chipActive: 'linear-gradient(135deg,#64748b,#334155)' },
  actions:  { dot: 'bg-primary',   line: 'from-primary/50',   chipActive: 'linear-gradient(135deg,#7c3aed,#2563eb)' },
};

const Timeline = ({ items, theme }) => (
  <div className="relative pl-1">
    <div className={cn('absolute left-[9px] top-2 bottom-2 w-px bg-gradient-to-b to-transparent', theme.line)} />
    <div className="space-y-3.5">
      {items.map((text, i) => (
        <div key={i} className="relative flex items-start gap-3 pl-6">
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 16, delay: i * 0.09 }}
            className={cn('absolute left-0 top-0.5 h-[9px] w-[9px] rounded-full ring-4 ring-current/15', theme.dot)}
          />
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24, delay: i * 0.09 + 0.03 }}
            className="text-xs text-foreground/80 leading-relaxed"
          >
            {text}
          </motion.span>
        </div>
      ))}
    </div>
  </div>
);

const InsightCard = ({ id, job_key, title, severity, summary, findings, actions, audience_roles, generated_at, is_read }) => {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;
  const CategoryIcon = CATEGORY_META[job_key]?.icon ?? Sparkles;
  const hasFindings = findings?.length > 0;
  const hasActions = actions?.length > 0;
  const [panel, setPanel] = useState(hasFindings ? 'findings' : 'actions');

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -3 }}
      className="relative rounded-2xl border bg-card shadow-sm hover:shadow-lg transition-shadow duration-300 overflow-hidden group"
    >
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', s.bar)} />

      {/* soft breathing glow for critical items — draws the eye without being obnoxious */}
      {severity === 'critical' && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{
            boxShadow: [
              `0 0 0 0 ${s.glow}0.18)`,
              `0 0 0 5px ${s.glow}0)`,
              `0 0 0 0 ${s.glow}0)`,
            ],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-xl shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3', s.icon)}>
            <CategoryIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {!is_read && <LiveDot />}
              <p className={cn('text-sm font-bold leading-snug', s.title)}>{title}</p>
              <Badge variant={s.badge} className="text-[10px] shrink-0 capitalize">{severity}</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {(audience_roles ?? []).map((role) => (
                <span key={role} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {role}
                </span>
              ))}
              <span className="text-[10px] text-muted-foreground" title={formatDateTime(generated_at)}>
                {formatRelativeTime(generated_at)}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-foreground/80 leading-relaxed">{summary}</p>

        {(hasFindings || hasActions) && (
          <div>
            {/* segmented toggle — sliding gradient indicator jumps between the two tabs */}
            <div className="relative inline-flex items-center gap-1 rounded-full bg-muted p-1 mb-3">
              {[
                { key: 'findings', label: 'Findings', icon: ListChecks, count: findings?.length ?? 0, enabled: hasFindings },
                { key: 'actions',  label: 'Actions',   icon: Lightbulb,  count: actions?.length ?? 0,  enabled: hasActions },
              ].filter((t) => t.enabled).map((t) => {
                const isActive = panel === t.key;
                const theme = TIMELINE_THEME[t.key];
                return (
                  <button
                    key={t.key}
                    onClick={() => setPanel(t.key)}
                    className="relative px-3 py-1.5 rounded-full text-xs font-bold"
                  >
                    {isActive && (
                      <motion.span
                        layoutId={`panel-indicator-${id}`}
                        className="absolute inset-0 rounded-full"
                        style={{ background: theme.chipActive }}
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      />
                    )}
                    <span className={cn('relative flex items-center gap-1.5', isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground')}>
                      <t.icon className="h-3 w-3" /> {t.label}
                      <span className={cn('opacity-70', isActive ? 'text-white' : 'text-muted-foreground')}>({t.count})</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={panel}
                initial={{ opacity: 0, x: panel === 'actions' ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: panel === 'actions' ? -16 : 16 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className={cn(
                  'relative rounded-xl p-3.5 overflow-hidden',
                  panel === 'findings'
                    ? 'bg-gradient-to-br from-slate-500/[0.07] to-slate-500/[0.01] border border-border/60'
                    : 'bg-gradient-to-br from-primary/[0.08] to-primary/[0.01] border border-primary/20',
                )}
              >
                {panel === 'findings'
                  ? (hasFindings && <Timeline items={findings} theme={TIMELINE_THEME.findings} />)
                  : (hasActions && <Timeline items={actions} theme={TIMELINE_THEME.actions} />)
                }
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const SUMMARY_TILES = [
  { key: 'critical', label: 'Critical', icon: AlertCircle,   color: 'text-red-600 dark:text-red-400',     grad: 'from-red-500/15 to-red-500/[0.03]',     iconBg: 'bg-red-500 text-white',     ring: 'hover:ring-red-500/30',     activeRing: 'ring-red-500/60' },
  { key: 'warning',  label: 'Warnings', icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', grad: 'from-amber-500/15 to-amber-500/[0.03]', iconBg: 'bg-amber-500 text-white',   ring: 'hover:ring-amber-500/30',   activeRing: 'ring-amber-500/60' },
  { key: 'info',     label: 'Info',     icon: Info,          color: 'text-sky-600 dark:text-sky-400',     grad: 'from-sky-500/15 to-sky-500/[0.03]',     iconBg: 'bg-sky-500 text-white',     ring: 'hover:ring-sky-500/30',     activeRing: 'ring-sky-500/60' },
  { key: 'success',  label: 'Positive', icon: CheckCircle2,  color: 'text-emerald-600 dark:text-emerald-400', grad: 'from-emerald-500/15 to-emerald-500/[0.03]', iconBg: 'bg-emerald-500 text-white', ring: 'hover:ring-emerald-500/30', activeRing: 'ring-emerald-500/60' },
];

const AIInsights = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [audience, setAudience] = useState('all');
  const [severityFilter, setSeverityFilter] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listRef = useRef(null);
  const { data, isLoading, isFetching, refetch } = useAIInsights();

  const handleSummaryClick = (key) => {
    setSeverityFilter((prev) => (prev === key ? null : key));
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const allInsights = useMemo(
    () => [...(data?.data ?? [])].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)),
    [data?.data],
  );

  // available audiences derived from the data itself, so the list never drifts from what the API actually sends
  const audienceOptions = useMemo(() => {
    const set = new Set();
    allInsights.forEach((i) => (i.audience_roles ?? []).forEach((r) => set.add(r)));
    return [...set].sort();
  }, [allInsights]);

  // audience filter runs first — summary tiles and category counts reflect it too
  const audienceInsights = useMemo(
    () => allInsights.filter((i) => audience === 'all' || (i.audience_roles ?? []).includes(audience)),
    [allInsights, audience],
  );

  // severity runs next — category tab counts/visibility reflect audience + severity together
  const severityInsights = useMemo(
    () => audienceInsights.filter((i) => !severityFilter || i.severity === severityFilter),
    [audienceInsights, severityFilter],
  );

  const insights = useMemo(() => {
    return severityInsights.filter((i) => activeCategory === 'all' || CATEGORY_META[i.job_key]?.group === activeCategory);
  }, [severityInsights, activeCategory]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0, success: 0 };
    audienceInsights.forEach((i) => { c[i.severity] = (c[i.severity] ?? 0) + 1; });
    return c;
  }, [audienceInsights]);

  const categoryCounts = useMemo(() => {
    const c = { all: severityInsights.length };
    severityInsights.forEach((i) => {
      const group = CATEGORY_META[i.job_key]?.group;
      if (group) c[group] = (c[group] ?? 0) + 1;
    });
    return c;
  }, [severityInsights]);

  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => c.value === 'all' || categoryCounts[c.value] > 0),
    [categoryCounts],
  );

  // if the active category disappears (e.g. an audience/severity change zeroes it out), fall back to "all"
  useEffect(() => {
    if (activeCategory !== 'all' && !categoryCounts[activeCategory]) setActiveCategory('all');
  }, [activeCategory, categoryCounts]);

  const clearFilters = () => {
    setAudience('all');
  };

  const hasActiveFilters = audience !== 'all' || activeCategory !== 'all' || !!severityFilter;
  const clearAllFilters = () => {
    setAudience('all');
    setActiveCategory('all');
    setSeverityFilter(null);
  };

  return (
    <div className="pb-8">
      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-3xl border bg-card mb-5">
        {/* aurora glow — the "this is AI-powered" backdrop */}
        <motion.div
          className="absolute -top-24 -left-16 h-64 w-64 rounded-full blur-3xl opacity-25 dark:opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }}
          animate={{ x: [0, 30, 0], y: [0, 15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full blur-3xl opacity-25 dark:opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
          animate={{ x: [0, -25, 0], y: [0, -15, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6">
          <div>
            <Link
              to={ROUTES.DASHBOARD}
              className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" /> Back to Dashboard
            </Link>

            <div className="flex items-center gap-3">
              {/* spinning gradient ring + pulsing sparkle — signature "AI" mark */}
              <div className="relative h-11 w-11 shrink-0">
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: 'conic-gradient(from 0deg, #7c3aed 0deg, transparent 100deg, transparent 260deg, #2563eb 360deg)',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-[2px] rounded-[14px] bg-background flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles className="h-5 w-5 text-primary" />
                  </motion.div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1
                    className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent"
                    style={{ backgroundImage: 'linear-gradient(120deg, #7c3aed, #4f46e5 45%, #2563eb)' }}
                  >
                    AI Insights
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary">
                    <LiveDot />
                    AI Generated
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Reports and recommendations across utilization, cost, bench risk and compliance.
                </p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground/80 mt-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  AI can make mistakes. Please double-check important information.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <AnimatePresence>
              {isFetching && !isLoading && (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  className="text-xs text-muted-foreground italic"
                >
                  Analyzing latest data…
                </motion.span>
              )}
            </AnimatePresence>
            {audienceOptions.length > 0 && (
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={audience !== 'all' ? 1 : 0}
                className="h-9 rounded-xl"
              />
            )}
            <Button variant="outline" size="toolbar" onClick={() => refetch()} disabled={isFetching} className="rounded-xl bg-background">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {/* <span className="hidden sm:inline">Refresh</span> */}
            </Button>
          </div>
        </div>

        {audienceOptions.length > 0 && (
          <div className="relative px-5 sm:px-6 pb-5">
            <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[140px]" gridClassName="grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full" onClear={clearFilters} showClear={audience !== 'all'}>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Audience</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger className="w-full h-9 rounded-xl gap-1.5 bg-background">
                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Audiences</SelectItem>
                    {audienceOptions.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FilterPanel>
          </div>
        )}
      </div>

      {/* ── Summary strip ── */}
      <motion.div
        variants={cardContainerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
      >
        {SUMMARY_TILES.map((s) => (
          <motion.button
            key={s.key}
            variants={cardVariants}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSummaryClick(s.key)}
            className={cn(
              'rounded-2xl border p-3.5 flex items-center justify-between bg-gradient-to-br transition-all duration-300 hover:shadow-md hover:ring-2 text-left',
              s.grad, s.ring,
              severityFilter === s.key && `ring-2 shadow-md ${s.activeRing}`,
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className={cn('p-1.5 rounded-lg shadow-sm', s.iconBg)}>
                <s.icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
            </div>
            <span className={cn('text-xl font-extrabold tabular-nums', s.color)}>{counts[s.key]}</span>
          </motion.button>
        ))}
      </motion.div>

      <AnimatePresence>
        {hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Filters:</span>
              {audience !== 'all' && (
                <FilterChip label={audience} onClear={() => setAudience('all')} />
              )}
              {activeCategory !== 'all' && (
                <FilterChip label={CATEGORIES.find((c) => c.value === activeCategory)?.label ?? activeCategory} onClear={() => setActiveCategory('all')} />
              )}
              {severityFilter && (
                <FilterChip label={severityFilter} onClear={() => setSeverityFilter(null)} capitalize />
              )}
              <button
                onClick={clearAllFilters}
                className="text-xs font-semibold text-primary hover:underline ml-1"
              >
                Clear all
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Category tabs ── */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-5">
        <TabsList className="flex-wrap h-auto gap-1.5 bg-transparent p-0">
          {visibleCategories.map((c) => (
            <TabsTrigger
              key={c.value}
              value={c.value}
              className={cn(
                'gap-1.5 text-xs rounded-full border bg-card px-3 py-1.5 shadow-none',
                'data-[state=active]:border-transparent data-[state=active]:text-white data-[state=active]:shadow-md',
              )}
              style={activeCategory === c.value ? { background: 'linear-gradient(120deg, #7c3aed, #4f46e5 55%, #2563eb)' } : undefined}
            >
              <c.icon className="h-3.5 w-3.5" /> {c.label}
              {categoryCounts[c.value] > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1',
                  activeCategory === c.value ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
                )}>
                  {categoryCounts[c.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ── Insights list ── */}
      <div ref={listRef} className="scroll-mt-6">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative h-48 rounded-2xl border bg-card overflow-hidden">
                <div
                  className="absolute inset-0 animate-shimmer bg-[length:200%_100%]"
                  style={{
                    backgroundImage: 'linear-gradient(110deg, transparent 30%, hsl(var(--muted)) 45%, hsl(var(--muted)) 55%, transparent 70%)',
                  }}
                />
              </div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-16">No insights match the current filters.</p>
        ) : (
          <motion.div
            key={`${activeCategory}-${severityFilter}`}
            variants={cardContainerVariants}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {insights.map((ins) => <InsightCard key={ins.id} {...ins} />)}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AIInsights;
