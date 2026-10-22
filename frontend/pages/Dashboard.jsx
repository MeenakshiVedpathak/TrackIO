import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, DollarSign, TrendingUp, TrendingDown, Users, Building2, Briefcase,
  BarChart2, RefreshCw, X, ChevronLeft, ChevronRight, CalendarDays, AlertCircle,
  Activity, Zap, Award, Calendar, IndianRupee, Table2, CalendarOff, Sparkles, ShieldAlert,
  Landmark,
} from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { useDashboardAnalytics, useDashboardAnalytics2 } from '@/hooks/useDashboard';
import { useCanViewOriginalData, useHasForm } from '@/hooks/usePermissions';
import { FORM_NAMES } from '@/constants/rbacForms';
import { useAuth } from '@/hooks/useAuth';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import MonthlyHoursTrendChart from '@/components/charts/MonthlyHoursTrendChart';
import MonthlyUtilizationTrendChart from '@/components/charts/MonthlyUtilizationTrendChart';
import CostTrendChart from '@/components/charts/CostTrendChart';
import CostByTypeDonut from '@/components/charts/CostByTypeDonut';
import ClientCostChart from '@/components/charts/ClientCostChart';
import TopClientsByCostPanel from '@/components/charts/TopClientsByCostPanel';
import ClientCategoryCostMatrix from '@/components/charts/ClientCategoryCostMatrix';
import ClientWiseAnalyticsTable from '@/components/charts/ClientWiseAnalyticsTable';
import ProjectWiseAnalyticsTable from '@/components/charts/ProjectWiseAnalyticsTable';
import LeaveHoursTrendChart from '@/components/charts/LeaveHoursTrendChart';
import NoWorkTrendChart from '@/components/charts/NoWorkTrendChart';
import HoursByClientChart from '@/components/charts/HoursByClientChart';
import HoursByEmployeeChart from '@/components/charts/HoursByEmployeeChart';
import ClientPOMatrixChart from '@/components/charts/ClientPOMatrixChart';
import EmployeeBenchChart from '@/components/charts/EmployeeBenchChart';
import ResourceInsightPanel from '@/components/charts/ResourceInsightPanel';
import BillableAnalyticsPanel from '@/components/charts/BillableAnalyticsPanel';
import TopEmployeesByPOPanel from '@/components/charts/TopEmployeesByPOPanel';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import { Button } from '@/components/ui/button';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { FiscalYearPicker } from '@/components/ui/fiscal-year-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatCurrency, formatHours, formatDate } from '@/utils/formatters';

/* ─── constants ──────────────────────────────────────────────────────────── */
const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
const FY_OPTIONS = Array.from({ length: 5 }, (_, i) => currentFY - 2 + i).map((fy) => ({
  value: fy,
  label: `FY ${fy}–${String(fy + 1).slice(-2)}`,
}));

const QUARTERS = [
  { value: 1, label: 'Q1', sub: 'Apr–Jun' },
  { value: 2, label: 'Q2', sub: 'Jul–Sep' },
  { value: 3, label: 'Q3', sub: 'Oct–Dec' },
  { value: 4, label: 'Q4', sub: 'Jan–Mar' },
];
const QUARTER_MONTHS = { 1: [4, 5, 6], 2: [7, 8, 9], 3: [10, 11, 12], 4: [1, 2, 3] };
const MONTH_ABBR = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const QUARTER_STYLES = {
  active:   'bg-primary text-primary-foreground font-semibold shadow-sm',
  inactive: 'bg-background text-muted-foreground hover:text-foreground font-medium',
};

/* plain number with grouping: 1234 → "1,234" */
const cNum = (v) => {
  const n = Number(v) || 0;
  return (Math.round(n * 10) / 10).toLocaleString('en-IN');
};

/* flat-top hexagon clip path */
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';

const KPI_CONFIG = [
  {
    key: 'active_employees', title: 'Employees', icon: Users,
    hexOuter: '#c4b5fd', hexInner: '#7c3aed',
    bar: 'bg-violet-500', iconBg: 'bg-violet-50 dark:bg-violet-950/40', iconColor: 'text-violet-500',
    fmt: (v) => cNum(v),
  },
  {
    key: 'active_clients', title: 'Clients', icon: Building2,
    hexOuter: '#67e8f9', hexInner: '#0891b2',
    bar: 'bg-cyan-500', iconBg: 'bg-cyan-50 dark:bg-cyan-950/40', iconColor: 'text-cyan-500',
    fmt: (v) => cNum(v),
  },
  {
    key: 'active_service_pos', title: 'Service POs', icon: Briefcase,
    hexOuter: '#fde68a', hexInner: '#d97706',
    bar: 'bg-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-950/40', iconColor: 'text-amber-500',
    fmt: (v) => cNum(v),
  },
  {
    key: 'total_po_value_current_year', title: 'PO Value', icon: TrendingUp,
    hexOuter: '#bbf7d0', hexInner: '#16a34a',
    bar: 'bg-green-500', iconBg: 'bg-green-50 dark:bg-green-950/40', iconColor: 'text-green-600',
    fmt: (v) => formatCurrency(v, 'INR', 0),
    fmtFull: (v) => formatCurrency(v),
  },
  {
    key: 'total_hours', title: 'Total Hrs', icon: Clock,
    hexOuter: '#fed7aa', hexInner: '#ea580c',
    bar: 'bg-orange-500', iconBg: 'bg-orange-50 dark:bg-orange-950/40', iconColor: 'text-orange-500',
    fmt: (v) => `${cNum(v)} hrs`,
  },
  {
    key: 'total_cost', title: 'Total Cost', icon: DollarSign,
    hexOuter: '#6ee7b7', hexInner: '#059669',
    bar: 'bg-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-600',
    fmt: (v) => formatCurrency(v, 'INR', 0),
    fmtFull: (v) => formatCurrency(v),
  },
  {
    key: 'utilization_pct', title: 'Utilization', icon: Activity,
    hexOuter: '#93c5fd', hexInner: '#2563eb',
    bar: 'bg-blue-500', iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-500',
    fmt: (v) => `${Number(v).toFixed(1)}%`,
  },
  {
    key: 'avg_hours_per_employee', title: 'Avg Hrs/Emp', icon: BarChart2,
    hexOuter: '#a5b4fc', hexInner: '#4338ca',
    bar: 'bg-indigo-500', iconBg: 'bg-indigo-50 dark:bg-indigo-950/40', iconColor: 'text-indigo-500',
    fmt: (v) => `${cNum(v)} hrs`,
  },
];

/* ─── sub-components ─────────────────────────────────────────────────────── */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22 } },
};
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};

const ScrollRow = ({ children }) => {
  const ref = useRef(null);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [update]);

  const scroll = (dir) => ref.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });

  return (
    <div className="relative">
      {canLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={ref}
        className="overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {children}
      </div>
      {canRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

const KpiCard = ({ cfg, value, isLoading }) => {
  if (isLoading) {
    return <div className="animate-pulse rounded-xl bg-muted h-[100px]" />;
  }

  // Long formatted values (e.g. full-precision PO Value) shrink to fit on one line
  // instead of wrapping mid-number; the exact figure is always available on hover.
  const formatted = String(cfg.fmt(value ?? 0));
  const valueSizeClass = formatted.length > 13 ? 'text-[12px]' : formatted.length > 9 ? 'text-[13.5px]' : 'text-[15px]';

  return (
    <motion.div variants={itemVariants} className="cursor-default group">
      <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-card pl-4 pr-3 py-3.5 shadow-sm overflow-hidden transition-all duration-200 group-hover:shadow-md group-hover:-translate-y-0.5">
        {/* left color bar */}
        <div className={`absolute left-0 top-0 h-full w-[3px] ${cfg.bar}`} />

        {/* icon — small */}
        <div className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${cfg.iconBg}`}>
          <cfg.icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
        </div>

        {/* value */}
        <Tooltip>
          <TooltipTrigger asChild>
            <p className={`${valueSizeClass} font-extrabold text-foreground leading-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis cursor-default`}>
              {formatted}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {(cfg.fmtFull ?? cfg.fmt)(value ?? 0)}
          </TooltipContent>
        </Tooltip>

        {/* title — full text, no truncation */}
        <p className="text-[11px] font-semibold text-muted-foreground leading-tight">
          {cfg.title}
        </p>
      </div>
    </motion.div>
  );
};

const InsightCard = ({ icon: Icon, label, sub, type, isLoading, onClick }) => {
  const styles = {
    success: { card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800', icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400', text: 'text-emerald-800 dark:text-emerald-300', sub: 'text-emerald-600/80 dark:text-emerald-400/70' },
    warning: { card: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800',   icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',   text: 'text-amber-800 dark:text-amber-300',   sub: 'text-amber-600/80 dark:text-amber-400/70' },
    danger:  { card: 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800',           icon: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',           text: 'text-red-800 dark:text-red-300',       sub: 'text-red-600/80 dark:text-red-400/70' },
    info:    { card: 'bg-sky-50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-800',           icon: 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400',           text: 'text-sky-800 dark:text-sky-300',       sub: 'text-sky-600/80 dark:text-sky-400/70' },
  };
  const s = styles[type] ?? styles.info;

  if (isLoading) return <Skeleton className="h-16 rounded-2xl flex-1" />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          variants={itemVariants}
          onClick={onClick}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 flex-1 min-w-[200px] ${onClick ? 'cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all duration-150' : 'cursor-default'} ${s.card}`}
        >
          <div className={`p-2 rounded-xl shrink-0 ${s.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-bold leading-tight truncate ${s.text}`}>{label}</p>
            <p className={`text-xs mt-0.5 leading-tight truncate ${s.sub}`}>{sub}</p>
          </div>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
        <p className="font-semibold">{label}</p>
        {sub && <p className="text-muted-foreground mt-0.5">{sub}</p>}
      </TooltipContent>
    </Tooltip>
  );
};

const SectionLabel = ({ icon: Icon, title, action }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="flex items-center gap-2 shrink-0">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      <h2 className="text-sm font-bold text-foreground tracking-tight">{title}</h2>
    </div>
    <div className="h-px flex-1 bg-border" />
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const { roleObjects, accessibleForms, accessibleFormsLoaded, isPlatformAdmin } = useAuth();
  const [fiscalYear, setFiscalYear]           = useState(currentFY);
  const [bottomMonthYear, setBottomMonthYear] = useState({ month: prevMonth.getMonth() + 1, year: prevMonth.getFullYear() });
  const [quarter, setQuarter]                 = useState(null);
  // Entity — pure client-side narrowing of the Business Unit dropdown right next to it (same
  // convention as components/common/EntityFilter/BusinessUnitFilter elsewhere); it never itself
  // rides into analyticsParams, only entityId's resulting BU choice does.
  const [entityId, setEntityId]               = useState('all');
  // Business Unit filter — '' means every BU this login can reach, matching how the Employee /
  // Client / Service PO filters below treat their own empty value. It rides into analyticsParams
  // as a pseudo-param and is turned into the request's BU scope by dashboard.api's withBuScope.
  const [buId, setBuId]                       = useState('');
  const [employeeId, setEmployeeId]           = useState('');
  const [clientId, setClientId]               = useState('');
  const [servicePOId, setServicePOId]         = useState('');
  const canViewOriginal = useCanViewOriginalData();
  const canViewAIInsights = useHasForm(FORM_NAMES.AI_INSIGHTS);
  const [hoursSource, setHoursSource]         = useState('M');

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);
  const [billablePage, setBillablePage]       = useState(1);
  const [billablePageQ, setBillablePageQ]     = useState(1); // quarterly view pagination
  const [billableSortBy, setBillableSortBy]   = useState('nonBillable');  // 'nonBillable' | 'billable'
  const [billableSortByQ, setBillableSortByQ] = useState('nonBillable'); // quarterly view sort
  const [topPOFilter, setTopPOFilter]         = useState('billable');
  const [filtersOpen, setFiltersOpen]         = useState(false);
  const [viewMode, setViewMode]               = useState('quarterly');

  const headerRef       = useRef(null);
  const outerRef        = useRef(null);
  const benchSectionRef = useRef(null);
  const kpiScrollRef    = useRef(null);

  const employeeChartRef = useRef(null);
  const clientChartRef   = useRef(null);

  const scrollTo = useCallback((ref) => {
    const el = ref.current;
    if (!el) return;
    const main = document.querySelector('main') ?? document.documentElement;
    const offset = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 80;
    main.scrollTo({ top: offset, behavior: 'smooth' });
  }, []);

  const scrollToBench         = useCallback(() => scrollTo(benchSectionRef),   [scrollTo]);
  const scrollToEmployeeChart = useCallback(() => scrollTo(employeeChartRef),  [scrollTo]);
  const scrollToClientChart   = useCallback(() => scrollTo(clientChartRef),    [scrollTo]);
  const [kpiScroll, setKpiScroll] = useState({ left: false, right: false });

  const kpiRefCallback = useCallback((el) => {
    // Cleanup previous listener
    if (kpiScrollRef.current?._kpiCheck) {
      kpiScrollRef.current.removeEventListener('scroll', kpiScrollRef.current._kpiCheck);
    }
    kpiScrollRef.current = el;
    if (!el) return;
    const check = () => setKpiScroll({
      left:  el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
    el._kpiCheck = check;
    check();
    el.addEventListener('scroll', check, { passive: true });
  }, []);

  useEffect(() => {
    // Use closest('main') — the definitive scroll container per MainLayout
    const scrollEl = outerRef.current?.closest('main') ?? document.documentElement;
    let lastY = scrollEl.scrollTop;
    let visible = true;
    let hovering = false;
    let autoHideTimer = null;

    // Driven directly through the ref (not React state) so hiding/showing the sticky
    // header never triggers a re-render of this whole (very large, chart-heavy) page —
    // routing it through setState was the actual cause of the multi-second lag: every
    // flip re-rendered ~12 unmemoized charts, so rapid scrolling queued up a pile of
    // full-page re-renders behind each other. A direct style mutation is instant
    // regardless of how expensive the rest of the tree is.
    const hide = () => {
      if (!visible) return;
      visible = false;
      if (headerRef.current) headerRef.current.style.transform = 'translateY(-110%)';
    };
    const show = () => {
      if (visible) return;
      visible = true;
      if (headerRef.current) headerRef.current.style.transform = 'translateY(0)';
    };

    // A scroll-up reveal is meant as a quick peek, not a permanent pin — unless the
    // user actually moves onto it, it drops back out of view once scrolling settles.
    // Skipped right at the true top (scrollTop <= 4), where the header is just sitting
    // in its normal in-flow spot rather than floating over content.
    const scheduleAutoHide = () => {
      clearTimeout(autoHideTimer);
      autoHideTimer = setTimeout(() => {
        if (!hovering && scrollEl.scrollTop > 4) hide();
      }, 1000);
    };

    const onScroll = () => {
      const y = scrollEl.scrollTop;
      const scrollingUp   = y < lastY;
      const scrollingDown = y > lastY && y > 4;
      lastY = y;

      if (scrollingDown) {
        clearTimeout(autoHideTimer);
        hide();
      } else if (scrollingUp) {
        show();
        scheduleAutoHide();
      }
    };

    const onMouseEnter = () => { hovering = true; clearTimeout(autoHideTimer); };
    const onMouseLeave = () => { hovering = false; scheduleAutoHide(); };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    headerRef.current?.addEventListener('mouseenter', onMouseEnter);
    headerRef.current?.addEventListener('mouseleave', onMouseLeave);
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      headerRef.current?.removeEventListener('mouseenter', onMouseEnter);
      headerRef.current?.removeEventListener('mouseleave', onMouseLeave);
      clearTimeout(autoHideTimer);
    };
  }, []);

  const month = String(bottomMonthYear.month);
  const year  = String(bottomMonthYear.year);

  const analyticsParams = {
    fiscalYear,
    hoursSource,
    roleId: roleObjects[0]?.id,
    ...(buId        && { buId }),
    ...(quarter     && { quarter }),
    ...(employeeId  && { employeeId }),
    ...(clientId    && { clientId }),
    ...(servicePOId && { poId: servicePOId }),
  };

  const { data: analyticsData, isPending: isAnalyticsPending, refetch, isFetching, dataUpdatedAt } =
    useDashboardAnalytics(analyticsParams, { enabled: viewMode === 'quarterly' });

  /* monthly analytics — same API, filtered by selected month */
  const monthFiscalYear = useMemo(
    () => (bottomMonthYear.month >= 4 ? bottomMonthYear.year : bottomMonthYear.year - 1),
    [bottomMonthYear],
  );
  const monthlyAnalyticsParams = {
    month: bottomMonthYear.month,
    year:  bottomMonthYear.year,
    hoursSource,
    roleId: roleObjects[0]?.id,
    ...(buId        && { buId }),
    ...(employeeId  && { employeeId }),
    ...(clientId    && { clientId }),
    ...(servicePOId && { poId: servicePOId }),
  };
  const { data: monthlyAnalyticsRaw, isPending: isMonthlyAnalyticsPending } =
    useDashboardAnalytics(monthlyAnalyticsParams, { enabled: viewMode === 'monthly' });

  /* dashboard/analytics2 — same filters as above (utilization trend + cost trend by type) */
  const { data: analytics2Data } =
    useDashboardAnalytics2(analyticsParams, { enabled: viewMode === 'quarterly' });
  const { data: monthlyAnalytics2Raw } =
    useDashboardAnalytics2(monthlyAnalyticsParams, { enabled: viewMode === 'monthly' });

  // Same source and availability rule as every other Entity filter in the app (see
  // hooks/useSelectableEntities) — narrows the BU dropdown right below, same as
  // components/common/EntityFilter does for every FilterPanel-based BU filter elsewhere.
  const { entities, canFilter: showEntityFilter } = useSelectableEntities();
  const entityOptions = useMemo(
    () => [
      { label: 'All Entities', value: 'all' },
      ...entities.map((e) => ({ label: e.name, value: String(e.id) })),
    ],
    [entities],
  );
  const handleEntityChange = (v) => {
    if (!v) return;
    setEntityId(v);
    setBuId('');
  };

  // Same source and availability rule as every other BU filter in the app (see
  // hooks/useSelectableBusinessUnits): the BU master for an Admin/Entity Admin, the login's own
  // mapped BUs for a BU Admin/BU Head, and nothing at all below two BUs.
  const { units: businessUnitOptionsSource, canFilter: showBuFilter } = useSelectableBusinessUnits(entityId);
  const buOptions = useMemo(
    () => [
      { label: 'All Business Units', value: '' },
      ...businessUnitOptionsSource.map((bu) => ({ label: bu.name, value: String(bu.id) })),
    ],
    [businessUnitOptionsSource],
  );

  const { data: employeesData } = useActiveEmployees();
  const { data: clientsData }   = useActiveClients();
  const { data: servicePOsData }= useActiveServicePOs();

  const tiles  = analyticsData?.tiles  ?? {};
  const charts = analyticsData?.charts ?? {};

  const monthlyAnalyticsTiles  = monthlyAnalyticsRaw?.tiles  ?? {};
  const monthlyAnalyticsCharts = monthlyAnalyticsRaw?.charts ?? {};

  const mergedTiles = useMemo(() => ({
    ...tiles,
    total_po_value_current_year: Number(analyticsData?.financials?.total_po_value_fiscal_year ?? 0),
  }), [tiles, analyticsData]);

  const mergedMonthlyTiles = useMemo(() => ({
    ...monthlyAnalyticsTiles,
    total_po_value_current_year: Number(monthlyAnalyticsRaw?.financials?.total_po_value_fiscal_year ?? 0),
  }), [monthlyAnalyticsTiles, monthlyAnalyticsRaw]);

  const trendData = useMemo(() => {
    const raw = charts.monthly_hours_trend ?? [];
    if (!quarter) return raw;
    return raw.filter((d) => (QUARTER_MONTHS[quarter] ?? []).includes(d.month));
  }, [charts.monthly_hours_trend, quarter]);

  /* cost_trend_by_type / leave_hours_trend / no_work_trend entries only carry a "Mon-YY" label
     (no numeric month) — parse it for quarter filtering */
  const filterByQuarterLabel = (raw, q) => {
    if (!q) return raw;
    return raw.filter((d) => (QUARTER_MONTHS[q] ?? []).includes(MONTH_ABBR[d.month?.split('-')[0]]));
  };

  const costTrendData = useMemo(
    () => filterByQuarterLabel(analytics2Data?.cost_trend_by_type ?? [], quarter),
    [analytics2Data?.cost_trend_by_type, quarter],
  );
  const costTrendLeaveData = useMemo(
    () => filterByQuarterLabel(analytics2Data?.leave_hours_trend ?? [], quarter),
    [analytics2Data?.leave_hours_trend, quarter],
  );
  const costTrendNoWorkData = useMemo(
    () => filterByQuarterLabel(analytics2Data?.no_work_trend ?? [], quarter),
    [analytics2Data?.no_work_trend, quarter],
  );

  const monthlyCostTrendData = monthlyAnalytics2Raw?.cost_trend_by_type ?? [];

  /* map hours_by_employee → BillableAnalyticsPanel format
     Cross-references employees_by_po (category_name) to split non-billable hours into
     internal Non-Billable vs Customer Non-Billable, and tags each reason with a "type"
     (Leaves / On Bench / Idle / service_type_name) for the hover breakdown. */
  const BILLABLE_PAGE_SIZE = 12;
  const RESERVED_PO_NAMES = ['Leaves', 'On Bench', 'Idle'];
  const toBillableRows = (employees, empsByPO) => {
    // Build per-employee reasons from non-billable POs in employees_by_po, split by category
    const nbByEmp = {};       // combined (internal + customer) — kept for back-compat consumers
    const customerByEmp = {}; // customer non-billable only
    const billableByEmp = {}; // billable POs only — for the "Billable types" hover breakdown

    (empsByPO ?? [])
      .filter((po) => !po.is_billable)
      .forEach((po) => {
        const isCustomer = po.category_name === 'Customer Non-Billable';
        const typeLabel = RESERVED_PO_NAMES.includes(po.service_po_name)
          ? po.service_po_name
          : (po.service_type_name || po.service_po_name);
        (po.top_employees ?? []).forEach((e) => {
          const entry = {
            service_po_id:     po.service_po_id,
            service_po_name:   po.service_po_name,
            service_type_name: typeLabel,
            category_name:     po.category_name,
            hours:             e.hours,
          };
          (nbByEmp[e.employee_id] ??= []).push(entry);
          if (isCustomer) (customerByEmp[e.employee_id] ??= []).push(entry);
        });
      });

    (empsByPO ?? [])
      .filter((po) => po.is_billable)
      .forEach((po) => {
        const typeLabel = po.service_type_name || po.service_po_name;
        (po.top_employees ?? []).forEach((e) => {
          (billableByEmp[e.employee_id] ??= []).push({
            service_po_id:     po.service_po_id,
            service_po_name:   po.service_po_name,
            service_type_name: typeLabel,
            category_name:     po.category_name,
            hours:             e.hours,
          });
        });
      });

    return (employees ?? []).map((e) => {
      const allReasons = nbByEmp[e.employee_id] ?? (
        e.non_billable_hours > 0
          ? [{ service_po_id: 0, service_po_name: 'Non-Billable', service_type_name: 'Non-Billable', category_name: 'Non-Billable', hours: e.non_billable_hours }]
          : []
      );
      const customerReasons = customerByEmp[e.employee_id] ?? [];
      const customerHours   = customerReasons.reduce((s, r) => s + (r.hours || 0), 0);
      const internalReasons = allReasons.filter((r) => r.category_name !== 'Customer Non-Billable');
      const internalHours   = Math.max((e.non_billable_hours || 0) - customerHours, 0);

      return {
        employee_id:         e.employee_id,
        employee_code:       e.employee_code,
        full_name:           e.full_name,
        designation:         '',
        total_hours:         e.hours,
        billable_hours:      e.billable_hours,
        billable_pct:        e.hours > 0 ? (e.billable_hours / e.hours) * 100 : 0,
        non_billable_hours:  e.non_billable_hours, // combined — back-compat (e.g. ResourceInsightPanel)
        internal_non_billable_hours:   internalHours,
        customer_non_billable_hours:   customerHours,
        non_billable_reasons: allReasons,           // combined — back-compat
        internal_non_billable_reasons: internalReasons,
        customer_non_billable_reasons: customerReasons,
        billable_reasons: billableByEmp[e.employee_id] ?? [],
      };
    });
  };

  const sortBillableRows = (rows, sortBy) =>
    [...rows].sort((a, b) => sortBy === 'billable'
      ? (b.billable_hours || 0) - (a.billable_hours || 0)
      : (b.non_billable_hours || 0) - (a.non_billable_hours || 0));

  const billableRowsQ = useMemo(
    () => toBillableRows(charts.hours_by_employee, charts.employees_by_po),
    [charts.hours_by_employee, charts.employees_by_po],
  );
  const billableRowsM = useMemo(
    () => toBillableRows(monthlyAnalyticsCharts.hours_by_employee, monthlyAnalyticsCharts.employees_by_po),
    [monthlyAnalyticsCharts.hours_by_employee, monthlyAnalyticsCharts.employees_by_po],
  );

  const sortedBillableRowsQ = useMemo(
    () => sortBillableRows(billableRowsQ, billableSortByQ),
    [billableRowsQ, billableSortByQ],
  );
  const sortedBillableRowsM = useMemo(
    () => sortBillableRows(billableRowsM, billableSortBy),
    [billableRowsM, billableSortBy],
  );

  const mkMeta = (rows, page) => ({
    limit: BILLABLE_PAGE_SIZE, total: rows.length, page,
    totalPages: Math.ceil(rows.length / BILLABLE_PAGE_SIZE),
    hasPrev: page > 1, hasNext: page < Math.ceil(rows.length / BILLABLE_PAGE_SIZE),
  });

  const employeeOptions  = (employeesData?.data  ?? employeesData  ?? []).map((e) => ({ value: String(e.employee_id ?? e.id),    label: e.full_name ?? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() }));
  const clientOptions    = (clientsData?.data    ?? clientsData    ?? []).map((c) => ({ value: String(c.client_id  ?? c.id),    label: c.client_name  ?? c.name }));
  const servicePOOptions = (servicePOsData?.data ?? servicePOsData ?? []).map((p) => ({ value: String(p.service_po_id ?? p.id), label: p.service_po_name ?? p.name }));

  // Business Unit is deliberately excluded from both: it lives in the page header, not the
  // Filters panel, so counting it would badge "Filters" for something that isn't in there.
  const hasFilters = !!(quarter || employeeId || clientId || servicePOId);
  const activeFilterCount = [quarter, employeeId, clientId, servicePOId].filter(Boolean).length;

  const clearFilters = () => { setQuarter(null); setEmployeeId(''); setClientId(''); setServicePOId(''); };

  /* ── insights ── */
  const insights = useMemo(() => {
    if (isAnalyticsPending) return [];
    const list = [];
    const util = Number(tiles.utilization_pct ?? 0);
    if (util > 0) {
      list.push(util >= 80
        ? { type: 'success', icon: Zap,          label: `${util.toFixed(1)}% Utilization`,      sub: 'On track · Above 80% target', onClick: scrollToClientChart }
        : util >= 60
          ? { type: 'warning', icon: TrendingDown, label: `${util.toFixed(1)}% Utilization`,    sub: 'Below 80% target · Improve allocation', onClick: scrollToClientChart }
          : { type: 'danger',  icon: TrendingDown, label: `${util.toFixed(1)}% Utilization`,    sub: 'Critical · Well below 80% target', onClick: scrollToClientChart }
      );
    }
    const benchData = charts.employee_bench_pct ?? [];
    const critical  = benchData.filter((e) => e.bench_pct >= 75).length;
    const onBench   = benchData.filter((e) => e.bench_pct >= 25).length;
    if (critical > 0) list.push({ type: 'danger',  icon: AlertCircle, label: `${critical} Critical Bench`,      sub: 'Bench ≥75% · Needs immediate action', onClick: scrollToBench });
    else if (onBench > 0) list.push({ type: 'warning', icon: Users,   label: `${onBench} Employee${onBench > 1 ? 's' : ''} on Bench`, sub: 'Bench >25% · Monitor allocation', onClick: scrollToBench });
    else if (benchData.length > 0) list.push({ type: 'success', icon: Award, label: 'Bench Below Threshold', sub: 'All employees under 25% bench', onClick: scrollToBench });
    const topClient = (charts.hours_by_client ?? [])[0];
    if (topClient) list.push({ type: 'info', icon: Building2, label: topClient.client_name, sub: `Top client · ${topClient.hours.toLocaleString('en-IN')} hrs logged`, onClick: scrollToClientChart });
    const sortedEmps = [...(charts.hours_by_employee ?? [])].sort((a, b) => (b.billable_hours ?? 0) - (a.billable_hours ?? 0));
    if (sortedEmps.length > 0) {
      const topHrs = sortedEmps[0].billable_hours ?? 0;
      const tied = sortedEmps.filter((e) => (e.billable_hours ?? 0) === topHrs);
      if (tied.length === 1) {
        list.push({ type: 'info', icon: Users, label: tied[0].full_name, sub: `Top contributor · ${topHrs.toLocaleString('en-IN')} billable hrs`, onClick: scrollToEmployeeChart });
      } else if (tied.length === 2) {
        list.push({ type: 'info', icon: Users, label: `${tied[0].full_name} & ${tied[1].full_name}`, sub: `Tied · ${topHrs.toLocaleString('en-IN')} billable hrs each`, onClick: scrollToEmployeeChart });
      } else {
        list.push({ type: 'info', icon: Users, label: `${tied.length} employees tied`, sub: `${topHrs.toLocaleString('en-IN')} billable hrs each`, onClick: scrollToEmployeeChart });
      }
    }
    return list.slice(0, 4);
  }, [isAnalyticsPending, tiles, charts, scrollToBench, scrollToEmployeeChart, scrollToClientChart]);

  const monthlyInsights = useMemo(() => {
    if (isMonthlyAnalyticsPending) return [];
    const list = [];
    const util = Number(monthlyAnalyticsTiles.utilization_pct ?? 0);
    if (util > 0) {
      list.push(util >= 80
        ? { type: 'success', icon: Zap,          label: `${util.toFixed(1)}% Utilization`,   sub: 'On track · Above 80% target', onClick: scrollToClientChart }
        : util >= 60
          ? { type: 'warning', icon: TrendingDown, label: `${util.toFixed(1)}% Utilization`, sub: 'Below 80% target · Improve allocation', onClick: scrollToClientChart }
          : { type: 'danger',  icon: TrendingDown, label: `${util.toFixed(1)}% Utilization`, sub: 'Critical · Well below 80% target', onClick: scrollToClientChart }
      );
    }
    const benchData = monthlyAnalyticsCharts.employee_bench_pct ?? [];
    const critical  = benchData.filter((e) => e.bench_pct >= 75).length;
    const onBench   = benchData.filter((e) => e.bench_pct >= 25).length;
    if (critical > 0) list.push({ type: 'danger',  icon: AlertCircle, label: `${critical} Critical Bench`,                             sub: 'Bench ≥75% · Needs immediate action',  onClick: scrollToBench });
    else if (onBench > 0) list.push({ type: 'warning', icon: Users,   label: `${onBench} Employee${onBench > 1 ? 's' : ''} on Bench`, sub: 'Bench >25% · Monitor allocation',      onClick: scrollToBench });
    else if (benchData.length > 0) list.push({ type: 'success', icon: Award, label: 'Bench Below Threshold',                             sub: 'All employees under 25% bench',        onClick: scrollToBench });
    const topClient = (monthlyAnalyticsCharts.hours_by_client ?? [])[0];
    if (topClient) list.push({ type: 'info', icon: Building2, label: topClient.client_name, sub: `Top client · ${topClient.hours.toLocaleString('en-IN')} hrs logged`, onClick: scrollToClientChart });
    const sortedEmps = [...(monthlyAnalyticsCharts.hours_by_employee ?? [])].sort((a, b) => (b.billable_hours ?? 0) - (a.billable_hours ?? 0));
    if (sortedEmps.length > 0) {
      const topHrs = sortedEmps[0].billable_hours ?? 0;
      const tied = sortedEmps.filter((e) => (e.billable_hours ?? 0) === topHrs);
      if (tied.length === 1) {
        list.push({ type: 'info', icon: Users, label: tied[0].full_name, sub: `Top contributor · ${topHrs.toLocaleString('en-IN')} billable hrs`, onClick: scrollToEmployeeChart });
      } else if (tied.length === 2) {
        list.push({ type: 'info', icon: Users, label: `${tied[0].full_name} & ${tied[1].full_name}`, sub: `Tied · ${topHrs.toLocaleString('en-IN')} billable hrs each`, onClick: scrollToEmployeeChart });
      } else {
        list.push({ type: 'info', icon: Users, label: `${tied.length} employees tied`, sub: `${topHrs.toLocaleString('en-IN')} billable hrs each`, onClick: scrollToEmployeeChart });
      }
    }
    return list.slice(0, 4);
  }, [isMonthlyAnalyticsPending, monthlyAnalyticsTiles, monthlyAnalyticsCharts, scrollToBench, scrollToEmployeeChart, scrollToClientChart]);

  const lastUpdated = dataUpdatedAt ? formatDate(new Date(dataUpdatedAt), 'DD MMM YYYY, hh:mm A') : null;
  const fyLabel = `FY ${fiscalYear}–${String(fiscalYear + 1).slice(-2)}`;

  // The Dashboard route has no formName gate (it's always the landing page for any
  // authenticated user — see routes/index.jsx), so a role with zero forms mapped would
  // otherwise land on an empty/broken analytics view instead of a clear explanation.
  const hasNoAccessibleForms = accessibleFormsLoaded
    && !isPlatformAdmin
    && Object.values(accessibleForms ?? {}).flat().length === 0;

  if (hasNoAccessibleForms) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">No modules assigned yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your role doesn't have any forms mapped to it, so there's nothing to show here.
            Please contact your administrator to get access.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="-mt-6 pb-8" ref={outerRef} id="dashboard-root">

      {/* ══ STICKY ZONE ══════════════════════════════════════════════════════ */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 -mx-6 px-6 bg-background/95 backdrop-blur-sm border-b shadow-sm"
        style={{
          transform: 'translateY(0)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >

      {/* ══ PAGE HEADER ══════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <BarChart2 className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Analytics Dashboard</h1>
          </div>
          {/* <p className="text-xs text-muted-foreground mt-1 ml-0.5">
            Resource utilization & workforce analytics ·{' '}
            <span className="font-semibold text-foreground">{fyLabel}</span>
            {lastUpdated && <span className="ml-2 text-xs">· Updated {lastUpdated}</span>}
          </p> */}
        </div>

        {/* justify-start, not justify-end: this only changes anything once the row actually
            wraps onto multiple lines (a single unwrapped line looks identical either way,
            since there's no leftover space to justify against) — justify-end was right-aligning
            each wrapped line independently, making the first control float alone with a large
            empty gap to its left on narrow screens. */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-start">
          {/* Entity — narrows the Business Unit select right beside it, same pairing as every
              FilterPanel-based BU filter elsewhere (components/common/EntityFilter). Rendered
              inline for the same reason as the BU control below: this row uses the header's own
              styling, not that component's stacked label+field cell. */}
          {showEntityFilter && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SearchableSelect
                options={entityOptions}
                value={entityId}
                onValueChange={handleEntityChange}
                placeholder="All Entities"
                searchPlaceholder="Search entity…"
                showSearch={entityOptions.length > 6}
                className="w-44 h-9 rounded-xl text-sm"
              />
            </div>
          )}

          {/* Business Unit — a page-level scope control, deliberately ahead of the date picker
              and OUTSIDE the Filters panel: it decides which BU's data the whole dashboard is
              about (tiles, KPIs, every chart), where everything in Filters narrows within that.
              Rendered inline rather than via components/common/BusinessUnitFilter because this
              row uses the header's own control styling, not that component's stacked
              label+field cell. Hidden below two selectable BUs, same rule as everywhere else. */}
          {showBuFilter && (
            <div className="flex items-center gap-1.5">
              <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SearchableSelect
                options={buOptions}
                value={buId}
                onValueChange={setBuId}
                placeholder="All Business Units"
                searchPlaceholder="Search business unit…"
                showSearch={buOptions.length > 6}
                className="w-48 h-9 rounded-xl text-sm"
              />
            </div>
          )}

          {/* Contextual date picker */}
          {viewMode === 'quarterly' ? (
            <FiscalYearPicker
              value={fiscalYear}
              onChange={setFiscalYear}
              className="w-36 rounded-xl"
            />
          ) : (
            <MonthYearPicker
              value={bottomMonthYear}
              onChange={(v) => { if (v) { setBottomMonthYear(v); setBillablePage(1); } }}
              clearable={false}
              className="w-44 h-9 rounded-xl text-sm"
            />
          )}
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border">
            {[
              { mode: 'quarterly', icon: BarChart2, label: 'Quarterly', active: 'bg-card shadow-sm text-blue-600 dark:text-blue-400' },
              { mode: 'monthly',   icon: Calendar,  label: 'Monthly',   active: 'bg-card shadow-sm text-purple-600 dark:text-purple-400' },
            ].map(({ mode, icon: Icon, label, active }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                  viewMode === mode ? active : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Hours source toggle */}
          {canViewOriginal && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border">
              {[
                { value: 'O', label: 'Original' },
                { value: 'M', label: 'Published' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setHoursSource(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                    hoursSource === value ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((p) => !p)}
            activeCount={hasFilters ? activeFilterCount : 0}
            className="h-9"
          />

          {canViewAIInsights && (
            <motion.button
              onClick={() => navigate(ROUTES.AI_INSIGHTS)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              animate={{
                boxShadow: [
                  '0 2px 10px 0 rgba(124,58,237,0.25)',
                  '0 4px 20px 2px rgba(37,99,235,0.35)',
                  '0 2px 10px 0 rgba(124,58,237,0.25)',
                ],
              }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="group h-9 pl-1.5 pr-1.5 hover:pr-3.5 rounded-xl inline-flex items-center gap-0 hover:gap-2 text-xs font-extrabold text-white border border-white/20 transition-all duration-300"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9 45%, #2563eb)' }}
            >
              {/* spinning gradient ring + pulsing sparkle — same mark as the AI Insights page */}
              <span className="relative h-6 w-6 shrink-0">
                <motion.span
                  className="absolute inset-0 rounded-lg"
                  style={{ background: 'conic-gradient(from 0deg, #fff 0deg, transparent 100deg, transparent 260deg, #fff 360deg)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />
                <span className="absolute inset-[1.5px] rounded-[7px] bg-white flex items-center justify-center">
                  <motion.span
                    className="inline-flex"
                    animate={{ scale: [1, 1.18, 1] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                  </motion.span>
                </span>
              </span>
              <span className="max-w-0 group-hover:max-w-[90px] overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-300">AI Insights</span>
            </motion.button>
          )}

          <Button variant="outline" size="toolbar" onClick={() => refetch()} disabled={isFetching} className="rounded-xl">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {/* <span className="hidden sm:inline">Refresh</span> */}
          </Button>
        </div>
      </div>{/* end page header */}

      {/* Filter panel — available in both quarterly and monthly views */}
      <div className="pb-2">
        <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[640px]" gridClassName="block rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-col gap-2.5">

            <div className="flex flex-wrap items-center gap-2">
              {/* Quarter toggle — quarterly view only */}
              {viewMode === 'quarterly' && (<>
                <div className="flex items-center gap-1.5 shrink-0">
                  <FilterIconBadge icon={CalendarDays} color="primary" />
                  <div className="flex items-center bg-background border border-primary/20 shadow-sm rounded-xl p-1 gap-0.5">
                    {QUARTERS.map((q) => (
                      <button
                        key={q.value}
                        onClick={() => setQuarter(quarter === q.value ? null : q.value)}
                        className={`px-3 py-1 rounded-lg text-xs transition-all duration-150 whitespace-nowrap ${
                          quarter === q.value ? QUARTER_STYLES.active : QUARTER_STYLES.inactive
                        }`}
                      >
                        {q.label}
                        <span className={`ml-1 text-[10px] ${quarter === q.value ? 'opacity-60' : 'opacity-50'}`}>{q.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-6 w-px bg-border hidden sm:block" />
              </>)}

              <div className="flex items-center gap-1.5 min-w-[150px] flex-1">
                <FilterIconBadge icon={Users} color="violet" />
                <SearchableSelect options={employeeOptions} value={employeeId} onValueChange={setEmployeeId} placeholder="Employee" searchPlaceholder="Search employee…" className={`h-8 text-sm ${FILTER_FIELD_STYLES.violet}`} />
              </div>
              <div className="flex items-center gap-1.5 min-w-[140px] flex-1">
                <FilterIconBadge icon={Building2} color="sky" />
                <SearchableSelect options={clientOptions} value={clientId} onValueChange={setClientId} placeholder="Client" searchPlaceholder="Search client…" className={`h-8 text-sm ${FILTER_FIELD_STYLES.sky}`} />
              </div>
              <div className="flex items-center gap-1.5 min-w-[150px] flex-1">
                <FilterIconBadge icon={Briefcase} color="amber" />
                <SearchableSelect options={servicePOOptions} value={servicePOId} onValueChange={setServicePOId} placeholder="Service PO" searchPlaceholder="Search PO…" className={`h-8 text-sm ${FILTER_FIELD_STYLES.amber}`} />
              </div>
            </div>

            <AnimatePresence>
              {hasFilters && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-1.5 flex-wrap pt-2 border-t">
                  {quarter && viewMode === 'quarterly' && <Chip color="primary" icon={CalendarDays} label={`${QUARTERS.find((q) => q.value === quarter)?.label} · ${QUARTERS.find((q) => q.value === quarter)?.sub}`} onRemove={() => setQuarter(null)} />}
                  {employeeId && <Chip color="violet" icon={Users} label={employeeOptions.find((e) => e.value === employeeId)?.label ?? 'Employee'} onRemove={() => setEmployeeId('')} />}
                  {clientId && <Chip color="sky" icon={Building2} label={clientOptions.find((c) => c.value === clientId)?.label ?? 'Client'} onRemove={() => setClientId('')} />}
                  {servicePOId && <Chip color="amber" icon={Briefcase} label={servicePOOptions.find((p) => p.value === servicePOId)?.label ?? 'Service PO'} onRemove={() => setServicePOId('')} />}
                  <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <X className="h-3 w-3" /> Clear
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Insights */}
          {(() => {
            const pending  = viewMode === 'quarterly' ? isAnalyticsPending        : isMonthlyAnalyticsPending;
            const list     = viewMode === 'quarterly' ? insights                  : monthlyInsights;
            if (!pending && list.length === 0) return null;
            return (
              <div className="mt-3 pt-3 border-t">
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-wrap gap-2">
                  {pending
                    ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[52px] rounded-2xl flex-1 min-w-[160px]" />)
                    : list.map((ins, i) => <InsightCard key={i} {...ins} />)
                  }
                </motion.div>
              </div>
            );
          })()}
        </FilterPanel>
      </div>

      </div>{/* end sticky zone */}

      {/* ══ SCROLLABLE CONTENT ═══════════════════════════════════════════════ */}
      <div className="space-y-5 pt-6">

      {/* ══ QUARTERLY VIEW ═══════════════════════════════════════════════════ */}
      {viewMode === 'quarterly' && (<>

      {/* ══ KPI TILES ════════════════════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={Activity} title="Key Performance Indicators" />
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2"
        >
          {KPI_CONFIG.map((cfg) => (
            <KpiCard key={cfg.key} cfg={cfg} value={mergedTiles[cfg.key]} isLoading={isAnalyticsPending} />
          ))}
        </motion.div>
      </section>

      {/* ══ MONTHLY TREND ════════════════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={TrendingUp} title="Monthly Hours Trend" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <MonthlyHoursTrendChart data={trendData} isLoading={isAnalyticsPending} fiscalYear={fiscalYear} quarter={quarter} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <MonthlyUtilizationTrendChart data={analytics2Data?.monthly_resource_utilization ?? []} isLoading={isAnalyticsPending} />
          </motion.div>
        </div>
      </section>

      {/* ══ COST TREND BY TYPE ══════════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={IndianRupee} title="Cost Trend by Type" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <CostTrendChart data={costTrendData} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <CostByTypeDonut data={costTrendData} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
          </motion.div>
        </div>
      </section>

      {/* ══ RESOURCE INSIGHT (quarterly) ════════════════════════════════════ */}
      <section ref={benchSectionRef}>
        <SectionLabel icon={Users} title="Resource Insights" />
        <ResourceInsightPanel
          benchData={charts.employee_bench_pct ?? []}
          billableRows={billableRowsQ}
          employeesByPO={charts.employees_by_po ?? []}
          isLoading={isAnalyticsPending}
          periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`}
        />
      </section>

      {/* ══ BILLABLE BREAKDOWN (quarterly) ═══════════════════════════════════ */}
      <section>
        <SectionLabel icon={Calendar} title="Billable Breakdown" />
        <BillableAnalyticsPanel
          data={sortedBillableRowsQ.slice((billablePageQ - 1) * BILLABLE_PAGE_SIZE, billablePageQ * BILLABLE_PAGE_SIZE)}
          allData={sortedBillableRowsQ}
          meta={mkMeta(sortedBillableRowsQ, billablePageQ)}
          isLoading={isAnalyticsPending}
          month={null}
          year={fiscalYear}
          page={billablePageQ}
          onPageChange={setBillablePageQ}
          sortBy={billableSortByQ}
          onSortByChange={(v) => { setBillableSortByQ(v); setBillablePageQ(1); }}
        />
      </section>

      {/* ══ LEAVE & NO-WORK TREND ════════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={CalendarOff} title="Leave & No-Work Trend" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <LeaveHoursTrendChart data={costTrendLeaveData} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <NoWorkTrendChart data={costTrendNoWorkData} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
          </motion.div>
        </div>
      </section>

      {/* ══ BENCH ════════════════════════════════════════════════════════════ */}
      {/* <section ref={benchSectionRef}>
        <SectionLabel icon={Users} title="Resource & Portfolio Analysis" />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <EmployeeBenchChart data={charts.employee_bench_pct ?? []} isLoading={isAnalyticsPending} fiscalYear={fiscalYear} />
        </motion.div>
      </section> */}

      {/* ══ HOURS BY CLIENT, EMPLOYEE & CLIENT×PO ═══════════════════════════ */}
      <section>
        <SectionLabel icon={BarChart2} title="Hours Breakdown" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <motion.div ref={clientChartRef} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <HoursByClientChart data={charts.hours_by_client ?? []} isLoading={isAnalyticsPending} fiscalYear={fiscalYear} />
          </motion.div>
          <motion.div ref={employeeChartRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <HoursByEmployeeChart data={charts.hours_by_employee ?? []} isLoading={isAnalyticsPending} fiscalYear={fiscalYear} />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            <ClientPOMatrixChart data={charts.client_x_service_po ?? []} isLoading={isAnalyticsPending} fiscalYear={fiscalYear} />
          </motion.div>
        </div>
      </section>

      {/* ══ CLIENT COST ANALYTICS ═══════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={Building2} title="Client Cost Analytics" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <ClientCostChart data={analytics2Data?.client_wise_cost_analytics ?? []} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <TopClientsByCostPanel data={analytics2Data?.top_clients_by_cost?.data ?? []} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
          </motion.div>
        </div>
      </section>

      {/* ══ CLIENT × CATEGORY COST MATRIX ════════════════════════════════════ */}
      <section>
        <SectionLabel icon={Table2} title="Client × Category Cost Matrix" />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <ClientCategoryCostMatrix data={analytics2Data?.client_category_cost_matrix ?? []} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
        </motion.div>
      </section>

      {/* ══ CLIENT-WISE ANALYTICS ════════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={Table2} title="Client-wise Analytics" />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <ClientWiseAnalyticsTable data={analytics2Data?.client_wise_analytics ?? []} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
        </motion.div>
      </section>

      {/* ══ PROJECT-WISE ANALYTICS ═══════════════════════════════════════════ */}
      <section>
        <SectionLabel icon={Briefcase} title="Project-wise Analytics" />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <ProjectWiseAnalyticsTable data={analytics2Data?.project_wise_analytics ?? []} isLoading={isAnalyticsPending} periodLabel={quarter ? `Q${quarter} · FY ${fiscalYear}` : `FY ${fiscalYear}`} />
        </motion.div>
      </section>

      {/* ══ TOP EMPLOYEES BY SERVICE PO (quarterly) ══════════════════════════ */}
      <section>
        <SectionLabel icon={Briefcase} title="Employees by Service PO" />
        <TopEmployeesByPOPanel
          data={charts.employees_by_po ?? []}
          isLoading={isAnalyticsPending}
          month={null}
          year={fiscalYear}
        />
      </section>

      {/* ══ TOP POs BY HOURS (quarterly) ═════════════════════════════════════ */}
      {(() => {
        const topPOsQ  = charts.top_pos_by_hours ?? {};
        const PO_FILTERS = [
          { key: 'billable',              label: 'Billable',              style: { active: 'bg-emerald-500 text-white', dot: 'bg-emerald-500', bar: 'bg-emerald-500' } },
          { key: 'non_billable',          label: 'Non-Billable',          style: { active: 'bg-orange-500 text-white',  dot: 'bg-orange-500',  bar: 'bg-orange-500'  } },
          { key: 'customer_non_billable', label: 'Customer Non-Billable', style: { active: 'bg-sky-500 text-white',     dot: 'bg-sky-500',     bar: 'bg-sky-500'     } },
        ].filter(f => (topPOsQ[f.key]?.length ?? 0) > 0 || f.key === 'billable');
        const activeFilter = PO_FILTERS.find(f => f.key === topPOFilter) ?? PO_FILTERS[0];
        const poList = topPOsQ[topPOFilter] ?? [];
        return (
          <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2 mb-2.5">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold">Top POs by Hours</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PO_FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setTopPOFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 border ${topPOFilter === f.key ? `${f.style.active} border-transparent shadow-sm` : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${topPOFilter === f.key ? 'bg-white/70' : f.style.dot}`} />
                    {f.label}
                    <span className={`text-[10px] tabular-nums ${topPOFilter === f.key ? 'opacity-70' : 'text-muted-foreground'}`}>{topPOsQ[f.key]?.length ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y">
              {isAnalyticsPending
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2 w-1/2" /></div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))
                : poList.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-8">No {activeFilter.label.toLowerCase()} PO data for this period</p>
                  : poList.map((po, i) => {
                      const logged   = Number(po.total_hours_logged ?? 0);
                      const expected = Number(po.expected_man_hours ?? 0);
                      const pct      = expected > 0 ? Math.min((logged / expected) * 100, 100) : null;
                      return (
                        <div key={po.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" title={po.service_po_name}>{po.service_po_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{po.client_name}</p>
                            {pct !== null && (
                              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${activeFilter.style.bar}`} style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold tabular-nums">{cNum(logged)} hrs</p>
                            {expected > 0 && <p className="text-[10px] text-muted-foreground">of {cNum(expected)}</p>}
                          </div>
                        </div>
                      );
                    })
              }
            </div>
          </section>
        );
      })()}

      </>)}

      {/* ══ MONTHLY VIEW ═════════════════════════════════════════════════════ */}
      {viewMode === 'monthly' && (
        <motion.div key="monthly-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">

          {/* ── KPI Tiles ────────────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Activity} title="Key Performance Indicators" />
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2"
            >
              {KPI_CONFIG.map((cfg) => (
                <KpiCard key={cfg.key} cfg={cfg} value={mergedMonthlyTiles[cfg.key]} isLoading={isMonthlyAnalyticsPending} />
              ))}
            </motion.div>
          </section>

          {/* ── Monthly Hours Trend ──────────────────────────────────────── */}
          <section>
            <SectionLabel icon={TrendingUp} title="Monthly Hours Trend" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <MonthlyHoursTrendChart data={monthlyAnalyticsCharts.monthly_hours_trend ?? []} isLoading={isMonthlyAnalyticsPending} fiscalYear={monthFiscalYear} quarter={null} />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                <MonthlyUtilizationTrendChart data={monthlyAnalytics2Raw?.monthly_resource_utilization ?? []} isLoading={isMonthlyAnalyticsPending} />
              </motion.div>
            </div>
          </section>

          {/* ── Cost Trend by Type ────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={IndianRupee} title="Cost Trend by Service Category" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <CostTrendChart data={monthlyCostTrendData} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                <CostByTypeDonut data={monthlyCostTrendData} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
              </motion.div>
            </div>
          </section>

          {/* ── Resource Insights (monthly) ──────────────────────────────── */}
          <section ref={benchSectionRef}>
            <SectionLabel icon={Users} title="Resource Insights" />
            <ResourceInsightPanel
              benchData={monthlyAnalyticsCharts.employee_bench_pct ?? []}
              billableRows={billableRowsM}
              employeesByPO={monthlyAnalyticsCharts.employees_by_po ?? []}
              isLoading={isMonthlyAnalyticsPending}
              periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
            />
          </section>

          {/* ── Billable Breakdown ───────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Calendar} title="Billable Breakdown" />
            <BillableAnalyticsPanel
              data={sortedBillableRowsM.slice((billablePage - 1) * BILLABLE_PAGE_SIZE, billablePage * BILLABLE_PAGE_SIZE)}
              allData={sortedBillableRowsM}
              meta={mkMeta(sortedBillableRowsM, billablePage)}
              isLoading={isMonthlyAnalyticsPending}
              month={Number(month)}
              year={Number(year)}
              page={billablePage}
              onPageChange={setBillablePage}
              sortBy={billableSortBy}
              onSortByChange={(v) => { setBillableSortBy(v); setBillablePage(1); }}
            />
          </section>

          {/* ── Leave & No-Work Trend ─────────────────────────────────────── */}
          <section>
            <SectionLabel icon={CalendarOff} title="Leave & No-Work Trend" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <LeaveHoursTrendChart data={monthlyAnalytics2Raw?.leave_hours_trend ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                <NoWorkTrendChart data={monthlyAnalytics2Raw?.no_work_trend ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
              </motion.div>
            </div>
          </section>

          {/* ── Resource & Portfolio Analysis ────────────────────────────── */}
          {/* <section ref={benchSectionRef}>
            <SectionLabel icon={Users} title="Resource & Portfolio Analysis" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <EmployeeBenchChart data={monthlyAnalyticsCharts.employee_bench_pct ?? []} isLoading={isMonthlyAnalyticsPending} fiscalYear={monthFiscalYear} />
            </motion.div>
          </section> */}

          {/* ── Hours Breakdown ──────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={BarChart2} title="Hours Breakdown" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <motion.div ref={clientChartRef} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <HoursByClientChart data={monthlyAnalyticsCharts.hours_by_client ?? []} isLoading={isMonthlyAnalyticsPending} fiscalYear={monthFiscalYear} />
              </motion.div>
              <motion.div ref={employeeChartRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                <HoursByEmployeeChart data={monthlyAnalyticsCharts.hours_by_employee ?? []} isLoading={isMonthlyAnalyticsPending} fiscalYear={monthFiscalYear} />
              </motion.div>
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                <ClientPOMatrixChart data={monthlyAnalyticsCharts.client_x_service_po ?? []} isLoading={isMonthlyAnalyticsPending} fiscalYear={monthFiscalYear} />
              </motion.div>
            </div>
          </section>

          {/* ── Client Cost Analytics ────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Building2} title="Client Cost Analytics" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <ClientCostChart data={monthlyAnalytics2Raw?.client_wise_cost_analytics ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                <TopClientsByCostPanel data={monthlyAnalytics2Raw?.top_clients_by_cost?.data ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
              </motion.div>
            </div>
          </section>

          {/* ── Client × Category Cost Matrix ─────────────────────────────── */}
          <section>
            <SectionLabel icon={Table2} title="Client × Category Cost Matrix" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <ClientCategoryCostMatrix data={monthlyAnalytics2Raw?.client_category_cost_matrix ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
            </motion.div>
          </section>

          {/* ── Client-wise Analytics ─────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Table2} title="Client-wise Analytics" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <ClientWiseAnalyticsTable data={monthlyAnalytics2Raw?.client_wise_analytics ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
            </motion.div>
          </section>

          {/* ── Project-wise Analytics ────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Briefcase} title="Project-wise Analytics" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <ProjectWiseAnalyticsTable data={monthlyAnalytics2Raw?.project_wise_analytics ?? []} isLoading={isMonthlyAnalyticsPending} periodLabel={new Date(bottomMonthYear.year, bottomMonthYear.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
            </motion.div>
          </section>

          {/* ── Top Employees by Service PO ──────────────────────────────── */}
          <section>
            <SectionLabel icon={Briefcase} title="Employees by Service PO" />
            <TopEmployeesByPOPanel
              data={monthlyAnalyticsCharts.employees_by_po ?? []}
              isLoading={isMonthlyAnalyticsPending}
              month={Number(month)}
              year={Number(year)}
            />
          </section>

          {/* ── Top POs by Hours ─────────────────────────────────────────── */}
          {(() => {
            const PO_FILTERS = [
              { key: 'billable',             label: 'Billable',              style: { active: 'bg-emerald-500 text-white', dot: 'bg-emerald-500', bar: 'bg-emerald-500' } },
              { key: 'non_billable',         label: 'Non-Billable',          style: { active: 'bg-orange-500 text-white',  dot: 'bg-orange-500',  bar: 'bg-orange-500'  } },
              { key: 'customer_non_billable',label: 'Customer Non-Billable', style: { active: 'bg-sky-500 text-white',     dot: 'bg-sky-500',     bar: 'bg-sky-500'     } },
            ].filter(f => ((monthlyAnalyticsCharts.top_pos_by_hours ?? {})[f.key]?.length ?? 0) > 0 || f.key === 'billable');
            const activeFilter = PO_FILTERS.find(f => f.key === topPOFilter) ?? PO_FILTERS[0];
            const topPOsM = monthlyAnalyticsCharts.top_pos_by_hours ?? {};
            const poList  = topPOsM[topPOFilter] ?? [];
            return (
              <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-bold">Top POs by Hours</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                      {new Date(Number(year), Number(month) - 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    {PO_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setTopPOFilter(f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 border ${
                          topPOFilter === f.key
                            ? `${f.style.active} border-transparent shadow-sm`
                            : 'bg-background text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${topPOFilter === f.key ? 'bg-white/70' : f.style.dot}`} />
                        {f.label}
                        <span className={`text-[10px] tabular-nums ${topPOFilter === f.key ? 'opacity-70' : 'text-muted-foreground'}`}>
                          {topPOsM[f.key]?.length ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y">
                  {isMonthlyAnalyticsPending
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                          <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2 w-1/2" /></div>
                          <Skeleton className="h-3 w-16" />
                        </div>
                      ))
                    : poList.length === 0
                      ? <p className="text-sm text-muted-foreground text-center py-8">No {activeFilter.label.toLowerCase()} PO data for this period</p>
                      : poList.map((po, i) => {
                          const logged   = Number(po.total_hours_logged ?? 0);
                          const expected = Number(po.expected_man_hours ?? 0);
                          const pct      = expected > 0 ? Math.min((logged / expected) * 100, 100) : null;
                          return (
                            <div key={po.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" title={po.service_po_name}>{po.service_po_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{po.client_name}</p>
                                {pct !== null && (
                                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${activeFilter.style.bar}`} style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold tabular-nums">{cNum(logged)} hrs</p>
                                {expected > 0 && <p className="text-[10px] text-muted-foreground">of {cNum(expected)}</p>}
                              </div>
                            </div>
                          );
                        })
                  }
                </div>
              </section>
            );
          })()}

        </motion.div>
      )}

      </div>{/* end scrollable content */}
    </div>
  );
};

/* ─── Chip helper ────────────────────────────────────────────────────────── */
const CHIP_STYLES = {
  primary: 'bg-primary/10 text-primary border-primary/25 hover:bg-primary/20',
  violet:  'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-700',
  sky:     'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-700',
  amber:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700',
};

const FILTER_ICON_STYLES = {
  primary: 'bg-primary shadow-primary/30',
  violet:  'bg-violet-500 shadow-violet-500/30',
  sky:     'bg-sky-500 shadow-sky-500/30',
  amber:   'bg-amber-500 shadow-amber-500/30',
  emerald: 'bg-emerald-500 shadow-emerald-500/30',
};

const FILTER_FIELD_STYLES = {
  violet:  'border-violet-200 bg-violet-50 hover:bg-violet-100/70 focus-visible:ring-violet-400 dark:border-violet-800 dark:bg-violet-950/20 dark:hover:bg-violet-950/30',
  sky:     'border-sky-200 bg-sky-50 hover:bg-sky-100/70 focus-visible:ring-sky-400 dark:border-sky-800 dark:bg-sky-950/20 dark:hover:bg-sky-950/30',
  amber:   'border-amber-200 bg-amber-50 hover:bg-amber-100/70 focus-visible:ring-amber-400 dark:border-amber-800 dark:bg-amber-950/20 dark:hover:bg-amber-950/30',
  emerald: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70 focus-visible:ring-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30',
};

const FilterIconBadge = ({ icon: Icon, color }) => (
  <span className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 text-white shadow-sm ${FILTER_ICON_STYLES[color] ?? FILTER_ICON_STYLES.primary}`}>
    <Icon className="h-3.5 w-3.5" />
  </span>
);
const Chip = ({ icon: Icon, label, onRemove, color }) => (
  <motion.span
    initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold max-w-[220px] ${CHIP_STYLES[color] ?? CHIP_STYLES.primary}`}
  >
    <Icon className="h-3 w-3 shrink-0" />
    <span className="truncate">{label}</span>
    <button onClick={onRemove} className="ml-0.5 shrink-0 rounded-full p-0.5 transition-colors">
      <X className="h-2.5 w-2.5" />
    </button>
  </motion.span>
);

export default Dashboard;