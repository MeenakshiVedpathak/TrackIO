import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download, ChevronRight, Clock, IndianRupee, TrendingUp, FileX, Users, ArrowUpDown } from 'lucide-react';
import { useResourceProjectUtilization } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { useDebounce } from '@/hooks/useDebounce';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { formatHours, formatCurrency, formatMonthYear, getInitials } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import MobilePagination from '@/components/common/MobilePagination';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';

const CATEGORY_COLORS = {
  billable: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'non-billable': 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  'customer non-billable': 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
};

const PROJECT_TYPE_COLORS = {
  project: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  others: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
  leaves: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const CategoryBadge = ({ value }) => (
  <span className={cn(
    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
    CATEGORY_COLORS[value?.toLowerCase()] ?? 'bg-muted text-muted-foreground'
  )}>
    {value || '—'}
  </span>
);

const ProjectTypeBadge = ({ value }) => (
  <span className={cn(
    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
    PROJECT_TYPE_COLORS[value?.toLowerCase()] ?? 'bg-muted text-muted-foreground'
  )}>
    {value || '—'}
  </span>
);

const CrossBuBadge = () => (
  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap bg-teal-500/10 text-teal-700 dark:text-teal-400">
    Cross BU
  </span>
);

const AVATAR_COLORS = [
  'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
];

const avatarColorFor = (name = '') => {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const EmployeeAvatar = ({ name }) => (
  <span className={cn(
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
    avatarColorFor(name)
  )}>
    {getInitials(name)}
  </span>
);

const sumBy = (projects, predicate) =>
  projects.reduce((acc, p) => (predicate(p) ? acc + (Number(p.projectHours) || 0) : acc), 0);

const isBillable = (p) => p.category?.toLowerCase() === 'billable';
const isCustomerNonBillable = (p) => p.category?.toLowerCase() === 'customer non-billable';
const isNonBillable = (p) => !isBillable(p) && !isCustomerNonBillable(p);

const exportToExcel = (rows, monthLabel) => {
  const hasOriginalTotalHours = rows.some((r) => r.originalTotalHours != null);
  const hasOriginalProjectHours = rows.some((r) => r.projects?.some((p) => p.originalProjectHours != null));

  const header = [
    'Employee',
    'Total Hours',
    ...(hasOriginalTotalHours ? ['Original Total Hours'] : []),
    'Billable Hours',
    'Non-Billable Hours',
    'Customer Non-Billable Hours',
    'Billable Amount',
    'Client',
    'Project',
    'Project Type',
    'Category',
    'Project Hours',
    ...(hasOriginalProjectHours ? ['Original Project Hours'] : []),
    'Project Billable Amount',
  ];

  const dataRows = [];
  rows.forEach((r) => {
    const projects = r.projects ?? [];
    const billableHours = sumBy(projects, isBillable);
    const nonBillableHours = sumBy(projects, isNonBillable);
    const customerNonBillableHours = sumBy(projects, isCustomerNonBillable);
    const billableAmount = projects.reduce((acc, p) => acc + (Number(p.billableAmount) || 0), 0);

    if (projects.length === 0) {
      dataRows.push([
        r.employeeName ?? '',
        r.totalHours ?? '',
        ...(hasOriginalTotalHours ? [r.originalTotalHours ?? ''] : []),
        billableHours,
        nonBillableHours,
        customerNonBillableHours,
        billableAmount,
        '',
        '',
        '',
        '',
        '',
        ...(hasOriginalProjectHours ? [''] : []),
        '',
      ]);
      return;
    }

    projects.forEach((p, i) => {
      dataRows.push([
        i === 0 ? (r.employeeName ?? '') : '',
        i === 0 ? (r.totalHours ?? '') : '',
        ...(hasOriginalTotalHours ? [i === 0 ? (r.originalTotalHours ?? '') : ''] : []),
        i === 0 ? billableHours : '',
        i === 0 ? nonBillableHours : '',
        i === 0 ? customerNonBillableHours : '',
        i === 0 ? billableAmount : '',
        p.client ?? '',
        p.projectName ?? '',
        p.projectType ?? '',
        p.category ?? '',
        p.projectHours ?? '',
        ...(hasOriginalProjectHours ? [p.originalProjectHours ?? ''] : []),
        p.billableAmount ?? '',
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resource Project Utilization');
  XLSX.writeFile(wb, `Resource_Project_Utilization_${monthLabel.replace(' ', '_')}.xlsx`);
};

const STAT_CARDS = [
  { key: 'totalHours',            label: 'Total Hours',            icon: Clock,        color: 'blue'    },
  { key: 'billableAmount',        label: 'Billable Amount',        icon: IndianRupee,  color: 'green'   },
  { key: 'billableHours',         label: 'Billable Hours',         icon: TrendingUp,   color: 'emerald' },
  { key: 'nonBillableHours',      label: 'Non-Billable Hours',     icon: FileX,        color: 'orange'  },
  { key: 'customerNonBillableHours', label: 'Customer Non-Billable', icon: Users,      color: 'sky'     },
];

const STAT_COLORS = {
  blue:    { bg: 'bg-blue-500/10',    icon: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',    val: 'text-blue-700 dark:text-blue-400'    },
  green:   { bg: 'bg-green-500/10',   icon: 'bg-green-500/20 text-green-600 dark:text-green-400',  val: 'text-green-700 dark:text-green-400'   },
  emerald: { bg: 'bg-emerald-500/10', icon: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', val: 'text-emerald-700 dark:text-emerald-400' },
  orange:  { bg: 'bg-orange-500/10',  icon: 'bg-orange-500/20 text-orange-600 dark:text-orange-400', val: 'text-orange-700 dark:text-orange-400'  },
  sky:     { bg: 'bg-sky-500/10',     icon: 'bg-sky-500/20 text-sky-600 dark:text-sky-400',      val: 'text-sky-700 dark:text-sky-400'       },
};

const PROJECT_SORT_OPTIONS = [
  { label: 'Hours (High to Low)', fn: (a, b) => (Number(b.projectHours) || 0) - (Number(a.projectHours) || 0) },
  { label: 'Hours (Low to High)', fn: (a, b) => (Number(a.projectHours) || 0) - (Number(b.projectHours) || 0) },
  { label: 'Client (A–Z)',        fn: (a, b) => (a.client ?? '').localeCompare(b.client ?? '')               },
  { label: 'Project (A–Z)',       fn: (a, b) => (a.projectName ?? '').localeCompare(b.projectName ?? '')     },
];

const DrawerContent = ({ selectedRow, monthLabel, hasOriginalTotalHours, hasOriginalProjectHours }) => {
  const [sortIdx, setSortIdx] = useState(0);

  const sortedProjects = useMemo(() => {
    const fn = PROJECT_SORT_OPTIONS[sortIdx]?.fn;
    return fn ? [...selectedRow.filteredProjects].sort(fn) : selectedRow.filteredProjects;
  }, [selectedRow.filteredProjects, sortIdx]);

  return (
    <>
      <SheetHeader className="px-5 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <EmployeeAvatar name={selectedRow.employeeName} />
          <div>
            <SheetTitle className="text-left text-base">{selectedRow.employeeName || '—'}</SheetTitle>
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" />{monthLabel}
            </p>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Stat cards — row 1: Total Hours + [Original Hours] + Billable Amount */}
        <div className={cn('grid gap-2.5', hasOriginalTotalHours ? 'grid-cols-3' : 'grid-cols-2')}>
          {STAT_CARDS.slice(0, 2).map(({ key, label, icon: Icon, color }, idx) => {
            const c = STAT_COLORS[color];
            const isMoney = key === 'billableAmount';
            const value = isMoney ? formatCurrency(selectedRow[key]) : formatHours(selectedRow[key]);
            return (
              <>
                <div key={key} className={cn('rounded-xl border px-2.5 py-2.5 flex items-center gap-2', c.bg)}>
                  <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', c.icon)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                    <p className={cn('text-sm font-bold tabular-nums leading-tight', c.val)}>{value}</p>
                  </div>
                </div>
                {idx === 0 && hasOriginalTotalHours && (
                  <div key="originalTotalHours" className={cn('rounded-xl border px-2.5 py-2.5 flex items-center gap-2', STAT_COLORS.blue.bg)}>
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', STAT_COLORS.blue.icon)}>
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground leading-tight">Original Hours</p>
                      <p className={cn('text-sm font-bold tabular-nums leading-tight', STAT_COLORS.blue.val)}>
                        {formatHours(selectedRow.originalTotalHours)}
                      </p>
                    </div>
                  </div>
                )}
              </>
            );
          })}
        </div>
        {/* Row 2: Billable Hours + Non-Billable Hours + Customer Non-Billable */}
        <div className="grid grid-cols-3 gap-2">
          {STAT_CARDS.slice(2).map(({ key, label, icon: Icon, color }) => {
            const c = STAT_COLORS[color];
            return (
              <div key={key} className={cn('rounded-xl border px-2.5 py-2.5 flex items-center gap-2', c.bg)}>
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', c.icon)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  <p className={cn('text-sm font-bold tabular-nums leading-tight', c.val)}>{formatHours(selectedRow[key])}</p>
                </div>
              </div>
            );
          })}
        </div>

        {selectedRow.remarks && (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Remarks: </span>{selectedRow.remarks}
          </p>
        )}

        {/* Projects header with sort */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Projects ({selectedRow.filteredProjects.length})
          </p>
          {selectedRow.filteredProjects.length > 1 && (
            <Select value={String(sortIdx)} onValueChange={(v) => setSortIdx(Number(v))}>
              <SelectTrigger className="h-7 text-xs w-auto gap-1.5 border-none bg-muted/60 px-2.5 hover:bg-muted">
                <ArrowUpDown className="h-3 w-3 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_SORT_OPTIONS.map((o, i) => (
                  <SelectItem key={i} value={String(i)} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Project list */}
        {selectedRow.filteredProjects.length === 0 ? (
          <p className="text-xs text-muted-foreground">No projects match the current filter.</p>
        ) : (
          <div className="space-y-2">
            {sortedProjects.map((p, pi) => (
              <div key={pi} className="rounded-xl border bg-card flex overflow-hidden">
                {/* Left: name + badges */}
                <div className="flex-1 min-w-0 px-4 py-3">
                  <p className="truncate text-sm font-semibold" title={p.client}>{p.client || '—'}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <p className="truncate text-xs text-muted-foreground" title={p.projectName}>{p.projectName || '—'}</p>
                    <ProjectTypeBadge value={p.projectType} />
                    <CategoryBadge value={p.category} />
                    {(p.isCrossBu ?? p.crossBu ?? p.is_cross_bu) && <CrossBuBadge />}
                  </div>
                </div>
                {/* Right — pseudo-element divider guaranteed full height */}
                <div className="relative shrink-0 flex items-center px-3 py-3 text-right min-w-[120px] before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border before:content-['']">
                  <div>
                    <p className="flex items-center justify-end gap-1 text-sm font-bold tabular-nums text-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />{formatHours(p.projectHours)}
                    </p>
                    {hasOriginalProjectHours && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        Original: {formatHours(p.originalProjectHours)}
                      </p>
                    )}
                    {p.billableAmount ? (
                      <p className="text-[11px] text-muted-foreground tabular-nums">{formatCurrency(p.billableAmount)}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const ResourceProjectUtilization = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [category, setCategory] = useState([]);
  const [typeIds, setTypeIds] = useState([]);
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — backend support for entityIds/businessUnitIds has landed on this report
  // specifically (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md).
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();

  const selectedCategoryNames = category.length > 0
    ? activeServiceCategories
        .filter((sc) => category.includes(String(sc.id)))
        .map((sc) => sc.name?.toLowerCase())
    : [];

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = category.length === 0
    ? activeServiceTypes
    : activeServiceTypes.filter((t) => category.includes(String(t.service_category_id)));

  // Type (or Category, if no type chosen yet) → Service PO
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    activeServiceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [activeServiceTypes]);

  const filteredPOs = activePOs.filter((po) => {
    const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
    if (typeIds.length > 0) return poTypeId != null && typeIds.includes(poTypeId);
    if (category.length > 0) return poTypeId != null && category.includes(typeCategoryMap.get(poTypeId));
    return true;
  });

  const handleCategoryChange = (v) => {
    setCategory(v);
    setTypeIds([]);
    setPoIds([]);
    setPage(1);
  };

  const handleTypeChange = (v) => {
    setTypeIds(v);
    setPoIds([]);
    setPage(1);
  };
    const { roleObjects } = useAuth();


  const params = {
    month: monthYear.month,
    year: monthYear.year,
    hoursSource,
    page,
     roleId: roleObjects[0]?.id,
    limit,
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poIds.length > 0 && { projectIds: poIds.join(',') }),
    ...(category.length > 0 && { serviceCategoryIds: category.join(',') }),
    ...(typeIds.length > 0 && { serviceTypeIds: typeIds.join(',') }),
    ...(debouncedSearch && { search: debouncedSearch }),
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useResourceProjectUtilization(params);

  // Summary chips must reflect every matching record, not just the current page —
  // fetch the full filtered dataset in parallel (mirrors what handleExport does).
  const allDataParams = { ...params, page: 1, limit: 1000 };
  const { data: fullData } = useResourceProjectUtilization(allDataParams);
  const fullRows = Array.isArray(fullData?.data) ? fullData.data : null;

  const allRows = Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};
  const monthLabel = formatMonthYear(monthYear.month, monthYear.year);

  // Client-side safety net: filters this page's rows by employee name even if
  // the backend doesn't (yet) honor the `search` query param for this report.
  const searchTerm = debouncedSearch.trim().toLowerCase();
  const rawRows = searchTerm
    ? allRows.filter((r) => r.employeeName?.toLowerCase().includes(searchTerm))
    : allRows;

  const rows = rawRows.map((r) => {
    const projects = r.projects ?? [];
    const filteredProjects = selectedCategoryNames.length === 0
      ? projects
      : projects.filter((p) => selectedCategoryNames.includes(p.category?.toLowerCase()));
    return {
      ...r,
      billableHours: sumBy(projects, isBillable),
      nonBillableHours: sumBy(projects, isNonBillable),
      customerNonBillableHours: sumBy(projects, isCustomerNonBillable),
      billableAmount: projects.reduce((acc, p) => acc + (Number(p.billableAmount) || 0), 0),
      filteredProjects,
    };
  });

  const hasOriginalTotalHours = useMemo(
    () => allRows.some((r) => r.originalTotalHours != null) || (fullRows?.some((r) => r.originalTotalHours != null) ?? false),
    [allRows, fullRows]
  );
  const hasOriginalProjectHours = useMemo(
    () =>
      allRows.some((r) => r.projects?.some((p) => p.originalProjectHours != null)) ||
      (fullRows?.some((r) => r.projects?.some((p) => p.originalProjectHours != null)) ?? false),
    [allRows, fullRows]
  );

  // Prefer totals over the full filtered dataset; fall back to the current page's
  // totals only until the full-dataset fetch resolves.
  const totalsSource = fullRows
    ? (searchTerm ? fullRows.filter((r) => r.employeeName?.toLowerCase().includes(searchTerm)) : fullRows)
        .map((r) => {
          const projects = r.projects ?? [];
          return {
            totalHours: Number(r.totalHours) || 0,
            originalTotalHours: r.originalTotalHours != null ? Number(r.originalTotalHours) : null,
            billableHours: sumBy(projects, isBillable),
            nonBillableHours: sumBy(projects, isNonBillable),
            customerNonBillableHours: sumBy(projects, isCustomerNonBillable),
            billableAmount: projects.reduce((acc, p) => acc + (Number(p.billableAmount) || 0), 0),
          };
        })
    : rows;

  const pageTotals = totalsSource.reduce(
    (acc, r) => {
      acc.totalHours += Number(r.totalHours) || 0;
      if (r.originalTotalHours != null) {
        acc.originalTotalHours = (acc.originalTotalHours ?? 0) + (Number(r.originalTotalHours) || 0);
      }
      acc.billableHours += r.billableHours;
      acc.nonBillableHours += r.nonBillableHours;
      acc.customerNonBillableHours += r.customerNonBillableHours;
      acc.billableAmount += r.billableAmount;
      return acc;
    },
    { totalHours: 0, originalTotalHours: null, billableHours: 0, nonBillableHours: 0, customerNonBillableHours: 0, billableAmount: 0 }
  );

  // Export pulls every matching record (not just the current page) with one extra request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getResourceProjectUtilization({ ...params, page: 1, limit: total });
      const all = Array.isArray(res?.data) ? res.data : [];
      const exportRows = searchTerm
        ? all.filter((r) => r.employeeName?.toLowerCase().includes(searchTerm))
        : all;
      exportToExcel(exportRows, monthLabel);
    } finally {
      setExporting(false);
    }
  };

  const selectedRow = rows.find((r) => r.employeeId === selectedEmployeeId) ?? null;

  const activeFilterCount = [
    entityIds.length > 0 ? 1 : 0,
    buIds.length > 0 ? 1 : 0,
    employeeIds.length > 0 ? 1 : 0,
    clientIds.length > 0 ? 1 : 0,
    category.length > 0 ? 1 : 0,
    typeIds.length > 0 ? 1 : 0,
    poIds.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setCategory([]);
    setTypeIds([]);
    setPoIds([]);
    setPage(1);
  };

  const totalPages = meta.totalPages ?? 1;
  const currentPage = meta.page ?? page;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Project Utilization"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee…"
              className="w-full sm:w-full md:w-56"
            />
            {canViewOriginal && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border shrink-0">
                {[
                  { value: 'O', label: 'Original' },
                  { value: 'M', label: 'Published' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setHoursSource(value); setPage(1); }}
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
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            {(meta.total ?? rows.length) > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      {/* Collapsible filter panel */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[560px]"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
          <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setPoIds([]); }} />

          <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setPoIds([]); }} />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Month &amp; Year <span className="text-destructive">*</span></Label>
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="Select month"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Employee</Label>
            <MultiSelect
              options={activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) }))}
              value={employeeIds}
              onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
              placeholder="All Employees"
              searchPlaceholder="Search employee..."
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Client</Label>
            <MultiSelect
              options={activeClients.map((c) => ({ label: c.client_name, value: String(c.id) }))}
              value={clientIds}
              onValueChange={(v) => { setClientIds(v); setPage(1); }}
              placeholder="All Clients"
              searchPlaceholder="Search client..."
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service Category</Label>
            <MultiSelect
              options={activeServiceCategories.map((sc) => ({ label: sc.name, value: String(sc.id) }))}
              value={category}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service Type</Label>
            <MultiSelect
              options={filteredServiceTypes.map((t) => ({ label: t.service_type_name, value: String(t.id) }))}
              value={typeIds}
              onValueChange={handleTypeChange}
              placeholder="All Types"
              searchPlaceholder="Search type..."
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service PO</Label>
            <MultiSelect
              options={filteredPOs.map((po) => ({ label: po.service_po_name || po.service_po_code || String(po.id), value: String(po.id) }))}
              value={poIds}
              onValueChange={(v) => { setPoIds(v); setPage(1); }}
              placeholder="All POs"
              searchPlaceholder="Search PO..."
              className="w-full"
            />
          </div>

      </FilterPanel>

      {/* States */}
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No utilization data found" description={`No records found for ${monthLabel}.`} />
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          {/* Summary chips */}
          <div className="shrink-0 mb-4 flex flex-wrap gap-3">
            <div className="rounded-md border bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-400">
              Total Hours&nbsp;
              <span className="font-semibold tabular-nums">{pageTotals.totalHours.toFixed(1)} hrs</span>
            </div>
            {hasOriginalTotalHours && pageTotals.originalTotalHours != null && (
              <div className="rounded-md border bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-400">
                Original Total Hours&nbsp;
                <span className="font-semibold tabular-nums">{pageTotals.originalTotalHours.toFixed(1)} hrs</span>
              </div>
            )}
            <div className="rounded-md border bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              Billable&nbsp;
              <span className="font-semibold tabular-nums">{pageTotals.billableHours.toFixed(1)} hrs</span>
            </div>
            <div className="rounded-md border bg-orange-500/10 px-3 py-1.5 text-xs text-orange-700 dark:text-orange-400">
              Non-Billable&nbsp;
              <span className="font-semibold tabular-nums">{pageTotals.nonBillableHours.toFixed(1)} hrs</span>
            </div>
            <div className="rounded-md border bg-sky-500/10 px-3 py-1.5 text-xs text-sky-700 dark:text-sky-400">
              Customer Non-Billable&nbsp;
              <span className="font-semibold tabular-nums">{pageTotals.customerNonBillableHours.toFixed(1)} hrs</span>
            </div>
            <div className="rounded-md border bg-green-500/10 px-3 py-1.5 text-xs text-green-700 dark:text-green-400">
              Billable Amount&nbsp;
              <span className="font-semibold tabular-nums">{formatCurrency(pageTotals.billableAmount)}</span>
            </div>
          </div>

          {/* ── Table — no `flex-1`: that used to make this always stretch to fill whatever
              room was left on the page, even for a handful of rows, leaving a big blank gap
              inside the bordered box. `min-h-0` (kept) is what still lets it shrink and let its
              own body scroll internally when there genuinely isn't enough room — same fix
              already applied to the shared DataTable component. ── */}
          <div className="hidden md:flex min-h-0 flex-col rounded-lg border overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="min-w-full w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-9" />
                  <col />
                  <col className="w-[110px]" />
                  {hasOriginalTotalHours && <col className="w-[165px]" />}
                  <col className="w-[110px]" />
                  <col className="w-[130px]" />
                  <col className="w-[165px]" />
                  <col className="w-[140px]" />
                  <col className="w-[140px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_0_rgb(0,0,0,0.1)]">
                  <tr className="border-b">
                    <th className="px-2.5 py-2 text-left text-xs font-semibold" />
                    <th className="px-2.5 py-2 text-left text-xs font-semibold">Employee</th>
                    <th className="px-2.5 py-2 text-right text-xs font-semibold">Total Hours</th>
                    {hasOriginalTotalHours && (
                      <th className="px-2.5 py-2 text-right text-xs font-semibold">Original Total Hours</th>
                    )}
                    <th className="px-2.5 py-2 text-right text-xs font-semibold">Billable</th>
                    <th className="px-2.5 py-2 text-right text-xs font-semibold">Non-Billable</th>
                    <th className="px-2.5 py-2 text-right text-xs font-semibold">Customer Non-Billable</th>
                    <th className="px-2.5 py-2 text-right text-xs font-semibold">Billable Amount</th>
                    <th className="px-2.5 py-2 text-left text-xs font-semibold">Projects</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr
                      key={row.employeeId ?? i}
                      className={cn(
                        'transition-colors cursor-pointer border-l-2 border-l-transparent hover:bg-muted/40',
                        i % 2 === 1 && 'bg-muted/[0.15]'
                      )}
                      onClick={() => setSelectedEmployeeId(row.employeeId)}
                    >
                      <td className="px-2.5 py-2 text-center">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground">
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar name={row.employeeName} />
                          <p className="font-medium text-xs">{row.employeeName || '—'}</p>
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-medium">{formatHours(row.totalHours)}</td>
                      {hasOriginalTotalHours && (
                        <td className="px-2.5 py-2 text-right tabular-nums font-medium">{formatHours(row.originalTotalHours)}</td>
                      )}
                      <td className="px-2.5 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatHours(row.billableHours)}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-orange-700 dark:text-orange-400">{formatHours(row.nonBillableHours)}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-sky-700 dark:text-sky-400">{formatHours(row.customerNonBillableHours)}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-medium">{formatCurrency(row.billableAmount)}</td>
                      <td className="px-2.5 py-2 text-xs text-muted-foreground">{row.projects?.length ?? 0} project{(row.projects?.length ?? 0) !== 1 ? 's' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: compact tappable employee rows — same `rows` data, same `setSelectedEmployeeId`
              handler that already opens the detail Sheet below (built for the desktop row click),
              so the "employee detail" the mobile design wants is the exact same Sheet, not a new
              one. */}
          <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto md:hidden">
            {rows.map((row, i) => (
              <button
                type="button"
                key={row.employeeId ?? i}
                onClick={() => setSelectedEmployeeId(row.employeeId)}
                className="flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-left active:bg-muted/40"
              >
                <EmployeeAvatar name={row.employeeName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.employeeName || '—'}</p>
                  <p className="text-xs text-muted-foreground">{row.projects?.length ?? 0} project{(row.projects?.length ?? 0) !== 1 ? 's' : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums">{formatHours(row.totalHours)}</span>
                  {hasOriginalTotalHours && (
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      Orig: {formatHours(row.originalTotalHours)}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>

          {/* Pagination */}
          <div className="shrink-0 mt-3 hidden items-center justify-between gap-2 md:flex">
            <p className="text-xs text-muted-foreground">
              {meta.total != null
                ? `${meta.total} employee${meta.total !== 1 ? 's' : ''} · page ${currentPage} of ${totalPages}`
                : `${rows.length} employee${rows.length !== 1 ? 's' : ''}`}
              {monthLabel ? ` · ${monthLabel}` : ''}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 text-xs bg-white w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!meta.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground px-1">{currentPage} / {totalPages}</span>
                <Button
                  variant="outline" size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!meta.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
          <MobilePagination
            className="shrink-0 mt-3 md:hidden"
            page={currentPage}
            totalPages={totalPages}
            total={meta.total}
            limit={limit}
            itemLabel="employee"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      <Sheet open={!!selectedRow} onOpenChange={(open) => !open && setSelectedEmployeeId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-background overflow-hidden">
          {selectedRow && (
            <DrawerContent
              selectedRow={selectedRow}
              monthLabel={monthLabel}
              hasOriginalTotalHours={hasOriginalTotalHours}
              hasOriginalProjectHours={hasOriginalProjectHours}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ResourceProjectUtilization;
