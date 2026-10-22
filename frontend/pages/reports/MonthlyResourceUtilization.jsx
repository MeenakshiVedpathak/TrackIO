import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useMonthlyResourceUtilization } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { formatMonthYear } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import MobilePagination from '@/components/common/MobilePagination';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Fixed 3-slot visual order/coloring for the known categories. Matched by name for this
// ONLY — it's cosmetic (sort order + color), never used to identify a column, so a category
// rename just falls back to "unranked" (appended last, default color) instead of breaking.
const CATEGORY_ORDER = { billable: 1, customernonbillable: 2, nonbillable: 3 };
const normalizeCategoryName = (name) => (name || '').toLowerCase().replace(/[^a-z]/g, '');

const fh = (val) => {
  const n = Number(val);
  if (val == null || isNaN(n) || n === 0) return null;
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};

const HoursCell = ({ value }) => {
  const v = fh(value);
  return <span className="tabular-nums">{v || '0'}</span>;
};

// utilization_percentage is pre-rounded (2 decimals) server-side; null means the
// underlying report response has no capacity data to compute it from.
const UtilizationPercentCell = ({ value }) => {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{value}%</span>;
};

const exportToExcel = (records, columns, month, year) => {
  const monthLabel = MONTH_NAMES[(month - 1)] ?? month;

  const headerRow1 = [
    '', '', '', '', '', '', '', '', '', // 9 Fixed cols empty
  ];
  const headerRow2 = [
    'Sr. No.', 'Name', 'Designation', 'Total Exp', 'Co. Exp',
    'Resource Description', 'Monthly Cap (hrs)', 'Billing Cap (hrs)', 'Client(s)'
  ];

  columns.forEach(cat => {
    headerRow1.push(cat.category_name);
    for (let i = 1; i < cat.service_types.length; i++) headerRow1.push(''); // span
    cat.service_types.forEach(st => headerRow2.push(st.name));
  });

  headerRow1.push('Summary', '', '');
  headerRow2.push('Billable Total (hrs)', 'Non-Billable Total (hrs)', 'Total Utilization (hrs)');

  const dataRows = records.map((r, i) => {
    const row = [
      i + 1,
      r.full_name ?? '',
      r.designation ?? '',
      r.total_experience ?? '',
      r.company_experience ?? '',
      r.resource_description ?? '',
      r.monthly_capacity ?? '',
      r.monthly_billing_capacity ?? '',
      r.clients ?? '',
    ];

    columns.forEach(cat => {
      cat.service_types.forEach(st => {
        row.push(r.hours?.[st.id] ?? 0);
      });
    });

    row.push(r.billable_total ?? 0, r.non_billable_total ?? 0, r.total_utilization ?? 0);
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);
  
  // merge cells for top header
  const merges = [];
  let colIndex = 9;
  columns.forEach(cat => {
    const len = cat.service_types.length;
    if (len > 1) {
      merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + len - 1 } });
    }
    colIndex += len;
  });
  merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } });
  ws['!merges'] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resource Utilization');
  XLSX.writeFile(wb, `Monthly_Resource_Utilization_${monthLabel}_${year}.xlsx`);
};

// ─── column helpers ──────────────────────────────────────────────────────────
const th = (...cls) =>
  cn('px-2.5 py-2 text-left text-xs font-semibold border-r border-border whitespace-nowrap last:border-r-0', ...cls);
const td = (...cls) =>
  cn('px-2.5 py-2 text-xs border-r border-border last:border-r-0', ...cls);

// ─── component ───────────────────────────────────────────────────────────────
const MonthlyResourceUtilization = () => {
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { month: prevMonth.getMonth() + 1, year: prevMonth.getFullYear() };
  });
  const [employeeId, setEmployeeId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [serviceCategoryId, setServiceCategoryId] = useState('all');
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);
  const [exporting, setExporting] = useState(false);
  // Mobile-only: which employee cards are expanded to show their per-category hours breakdown.
  const [expandedEmployeeIds, setExpandedEmployeeIds] = useState(() => new Set());
  const toggleEmployee = (employeeId) => {
    setExpandedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const { data: activeEmployees = [] }         = useActiveEmployees();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const { data: activeServiceTypes = [] }      = useActiveServiceTypes();

  const enabled = !!(monthYear?.year >= 2000 && monthYear?.year <= 2100);

  const { roleObjects } = useAuth();
  const params = enabled ? {
     roleId: roleObjects[0]?.id,
    month: monthYear.month,
    year:  monthYear.year,
    hoursSource,
    ...(employeeId !== 'all' && { employeeId }),
    page,
    limit,
    ...(search.trim() && { search: search.trim() }),
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  } : undefined;

  const { data, isPending } = useMonthlyResourceUtilization(params);

  // The API's `summary` only totals the current page's rows. Fetch every matching
  // record (unpaginated) in parallel so the summary chips reflect the full filtered
  // dataset, not just what's currently on screen — mirrors what handleExport already does.
  const allDataParams = enabled ? { ...params, page: 1, limit: 1000 } : undefined;
  const { data: allData } = useMonthlyResourceUtilization(allDataParams);
  const allRecords = Array.isArray(allData?.data?.records) ? allData.data.records : null;

  const dynamicColumns = data?.data?.columns ?? [];

  // Columns come from the live service-type/category master data — matched and looked up
  // by real, stable id, never by name — so editing a service type's label can never split
  // it into two columns or silently merge it into a different one.
  const columns = activeServiceCategories
    .map(cat => ({
      category_id: cat.id,
      category_name: cat.name,
      colorRank: CATEGORY_ORDER[normalizeCategoryName(cat.name)] ?? 99,
      service_types: activeServiceTypes
        .filter(st => st.service_category_id === cat.id)
        .sort((a, b) => a.id - b.id)
        .map(st => ({ id: st.id, name: st.service_type_name })),
    }))
    .filter(cat => cat.service_types.length > 0)
    .sort((a, b) => a.colorRank - b.colorRank);

  // Fold in any service type id the report returned that isn't in the current active
  // master list (e.g. since deactivated) so historical hours for it don't just disappear.
  const knownServiceTypeIds = new Set(columns.flatMap(c => c.service_types.map(st => st.id)));
  dynamicColumns.forEach(dynCat => {
    dynCat.service_types.forEach(dynSt => {
      if (knownServiceTypeIds.has(dynSt.id)) return;
      knownServiceTypeIds.add(dynSt.id);
      let target = columns.find(c => normalizeCategoryName(c.category_name) === normalizeCategoryName(dynCat.category_name));
      if (!target) {
        target = { category_id: dynCat.category_id, category_name: dynCat.category_name, colorRank: 99, service_types: [] };
        columns.push(target);
      }
      target.service_types.push(dynSt);
    });
  });

  // Dropdown options from master data (all categories/types, not just current month)
  const serviceTypeOptions = activeServiceTypes
    .filter(st => serviceCategoryId === 'all' || String(st.service_category_id) === serviceCategoryId)
    .map(st => ({ label: st.service_type_name, value: String(st.id) }));

  // Frontend-only filtering — does not affect the API call
  const filteredColumns = columns
    .filter(cat => serviceCategoryId === 'all' || String(cat.category_id) === serviceCategoryId)
    .map(cat => ({
      ...cat,
      service_types: cat.service_types.filter(st =>
        serviceTypeId === 'all' || String(st.id) === serviceTypeId
      ),
    }))
    .filter(cat => cat.service_types.length > 0);

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const meta    = data?.meta    ?? {};

  // The backend folds "Customer Non-Billable" hours into non_billable_total and
  // doesn't expose them separately, so derive that figure on the frontend from
  // each row's per-service-type hours map instead.
  const customerNonBillableServiceTypeIds = (
    columns.find(c => c.category_name === 'Customer Non-Billable')?.service_types ?? []
  ).map(st => st.id);

  const sumCustomerNonBillable = (r) =>
    customerNonBillableServiceTypeIds.reduce((sum, id) => sum + (Number(r.hours?.[id]) || 0), 0);

  // Prefer totals computed over the full filtered dataset; fall back to the
  // (page-scoped) API summary only until the full-dataset fetch resolves.
  const summary = allRecords
    ? allRecords.reduce(
        (acc, r) => {
          acc.billable_total              += Number(r.billable_total)     || 0;
          acc.non_billable_total          += Number(r.non_billable_total) || 0;
          acc.leaves_hours                += Number(r.leaves_hours)       || 0;
          acc.total_utilization           += Number(r.total_utilization)  || 0;
          acc.customer_non_billable_total += sumCustomerNonBillable(r);
          return acc;
        },
        { billable_total: 0, non_billable_total: 0, leaves_hours: 0, total_utilization: 0, customer_non_billable_total: 0 }
      )
    : {
        ...(data?.data?.summary ?? {}),
        customer_non_billable_total: records.reduce((sum, r) => sum + sumCustomerNonBillable(r), 0),
      };

  const monthLabel = monthYear ? formatMonthYear(monthYear.month, monthYear.year) : '';

  const handleSearchChange = (e) => { setSearch(e.target.value); setPage(1); };

  // Export pulls every matching record (not just the current page) with one extra request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getMonthlyResourceUtilization({ ...params, page: 1, limit: total });
      const allRecords = Array.isArray(res?.data?.records) ? res.data.records : [];
      exportToExcel(allRecords, filteredColumns, monthYear?.month, monthYear?.year);
    } finally {
      setExporting(false);
    }
  };

  const getCategoryColorClass = (rank) => {
    switch(rank) {
      case 1: return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
      case 2: return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 3: return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      default: return 'bg-muted/40 text-foreground';
    }
  };

  const getCellColorClass = (rank) => {
    switch(rank) {
      case 1: return 'bg-emerald-500/[0.02]';
      case 2: return 'bg-blue-500/[0.02]';
      case 3: return 'bg-orange-500/[0.02]';
      default: return '';
    }
  };

  const activeFilterCount = [
    employeeId !== 'all' ? 1 : 0,
    serviceCategoryId !== 'all' ? 1 : 0,
    serviceTypeId !== 'all' ? 1 : 0,
    entityId !== ALL_ENTITIES ? 1 : 0,
    buId !== ALL_BUS ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setEmployeeId('all');
    setServiceCategoryId('all');
    setServiceTypeId('all');
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Monthly Utilization"
        description=""
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full md:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee…"
                value={search}
                onChange={handleSearchChange}
                className="h-9 pl-9 w-full text-sm"
                disabled={!enabled}
              />
            </div>
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
              className="h-9"
            />
            {records.length > 0 && (
              <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={exporting}>
                <Download className="mr-1.5 h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      {/* ── Collapsible Filters Panel ── */}
      {/* All five filters on one row at xl (the panel's default caps at 4 per row, which wrapped
          Service Type onto a second line once Business Unit was added). Steps down on narrower
          viewports; max-h is sized for the mobile single-column stack so nothing clips. */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[460px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />
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
            <SearchableSelect
              options={[
                { label: "All Employees", value: "all" },
                ...activeEmployees.map((e) => ({
                  label: e.full_name,
                  value: String(e.id)
                }))
              ]}
              value={employeeId}
              onValueChange={(v) => { setEmployeeId(v); setPage(1); }}
              placeholder="All Employees"
              searchPlaceholder="Search employee..."
              className="h-9 text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service Category</Label>
            <SearchableSelect
              options={[{ label: "All Categories", value: "all" }, ...activeServiceCategories.map(sc => ({ label: sc.name, value: String(sc.id) }))]}
              value={serviceCategoryId}
              onValueChange={(v) => { setServiceCategoryId(v); setServiceTypeId('all'); setPage(1); }}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-9 text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service Type</Label>
            <SearchableSelect
              options={[{ label: "All Service Types", value: "all" }, ...serviceTypeOptions]}
              value={serviceTypeId}
              onValueChange={(v) => { setServiceTypeId(v); setPage(1); }}
              placeholder="All Service Types"
              searchPlaceholder="Search service type..."
              className="h-9 text-sm w-full"
            />
          </div>
      </FilterPanel>

      {/* ── States ── */}
      {!enabled ? (
        <div className="rounded-lg border-2 border-dashed border-muted py-20 text-center">
          <p className="text-sm text-muted-foreground">Select a month and year to view utilization data.</p>
        </div>
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border py-20 text-center">
          <p className="text-sm text-muted-foreground">No utilization data found for {monthLabel}.</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          {/* ── Summary chips (desktop): unchanged flex-wrap pills ── */}
          <div className="hidden shrink-0 mb-4 md:flex flex-wrap gap-3">
            {summary.billable_total != null && (
              <div className="rounded-md border bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                Billable Total&nbsp;
                <span className="font-semibold tabular-nums">{Number(summary.billable_total).toFixed(1)} hrs</span>
              </div>
            )}
            {summary.non_billable_total != null && (
              <div className="rounded-md border bg-orange-500/10 px-3 py-1.5 text-xs text-orange-700 dark:text-orange-400">
                Non-Billable Total&nbsp;
                <span className="font-semibold tabular-nums">{Number(summary.non_billable_total).toFixed(1)} hrs</span>
              </div>
            )}
            {summary.customer_non_billable_total != null && (
              <div className="rounded-md border bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-400">
                Customer Non-Billable&nbsp;
                <span className="font-semibold tabular-nums">{Number(summary.customer_non_billable_total).toFixed(1)} hrs</span>
              </div>
            )}
            {summary.total_utilization != null && (
              <div className="rounded-md border bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-400">
                Total Utilization&nbsp;
                <span className="font-semibold tabular-nums">{Number(summary.total_utilization).toFixed(1)} hrs</span>
              </div>
            )}
            {summary.leaves_hours != null && (
              <div className="rounded-md border bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                Leaves&nbsp;
                <span className="font-semibold tabular-nums">{Number(summary.leaves_hours).toFixed(1)} hrs</span>
              </div>
            )}
          </div>

          {/* ── Summary chips (mobile): same `summary` values, as a compact 2-column KPI grid ── */}
          <div className="grid shrink-0 grid-cols-2 gap-2 mb-4 md:hidden">
            {summary.billable_total != null && (
              <div className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-400">
                <p className="text-xs">Billable</p>
                <p className="text-sm font-semibold tabular-nums">{Number(summary.billable_total).toFixed(1)} hrs</p>
              </div>
            )}
            {summary.non_billable_total != null && (
              <div className="rounded-lg border bg-orange-500/10 px-3 py-2 text-orange-700 dark:text-orange-400">
                <p className="text-xs">Non-Billable</p>
                <p className="text-sm font-semibold tabular-nums">{Number(summary.non_billable_total).toFixed(1)} hrs</p>
              </div>
            )}
            {summary.customer_non_billable_total != null && (
              <div className="rounded-lg border bg-cyan-500/10 px-3 py-2 text-cyan-700 dark:text-cyan-400">
                <p className="text-xs">Customer N-B</p>
                <p className="text-sm font-semibold tabular-nums">{Number(summary.customer_non_billable_total).toFixed(1)} hrs</p>
              </div>
            )}
            {summary.leaves_hours != null && (
              <div className="rounded-lg border bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
                <p className="text-xs">Leaves</p>
                <p className="text-sm font-semibold tabular-nums">{Number(summary.leaves_hours).toFixed(1)} hrs</p>
              </div>
            )}
            {summary.total_utilization != null && (
              <div className="col-span-2 rounded-lg border bg-blue-500/10 px-3 py-2 text-blue-700 dark:text-blue-400">
                <p className="text-xs">Total Utilization</p>
                <p className="text-sm font-semibold tabular-nums">{Number(summary.total_utilization).toFixed(1)} hrs</p>
              </div>
            )}
          </div>

          {/* ── Table — no `flex-1`: that used to make this always stretch to fill whatever
              room was left after the summary chips/pagination, even for a handful of rows,
              leaving a big blank gap inside the bordered box. `min-h-0` (kept) is what still
              lets it shrink and let its own body scroll internally when there genuinely isn't
              enough room — same fix already applied to the shared DataTable component. ── */}
          <div className="hidden md:flex min-h-0 flex-col rounded-lg border overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="min-w-max w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-background">
                  <tr className="border-b bg-muted/60">
                    <th colSpan={2} className="sticky left-0 z-30 bg-muted" />
                    <th colSpan={7} className="border-r border-border" />
                    {filteredColumns.map(cat => (
                      <th
                        key={cat.category_id}
                        colSpan={cat.service_types.length}
                        className={cn('px-3 py-1.5 text-center text-xs font-semibold border-r border-border', getCategoryColorClass(cat.colorRank))}
                      >
                        {cat.category_name}
                      </th>
                    ))}
                    <th colSpan={4} className="px-3 py-1.5 text-center text-xs font-semibold bg-primary/10 text-primary">
                      Summary
                    </th>
                  </tr>

                  <tr className="border-b bg-muted/40">
                    <th className={th('sticky left-0 z-30 bg-muted w-[50px] text-center')}>#</th>
                    <th className={th('sticky left-[50px] z-30 bg-muted border-r border-border shadow-[1px_0_0_0_var(--border)] w-[220px] min-w-[220px] max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap')}>Name</th>
                    <th className={th('min-w-[160px]')}>Designation</th>
                    <th className={th('w-[90px] text-right')}>Total Exp</th>
                    <th className={th('w-[90px] text-right')}>Co. Exp</th>
                    <th className={th('min-w-[150px]')}>Resource Description</th>
                    <th className={th('w-[100px] text-right')}>Cap. (hrs)</th>
                    <th className={th('w-[100px] text-right')}>Bill. Cap.</th>
                    <th className={th('min-w-[180px]')}>Client(s)</th>
                    
                    {filteredColumns.map(cat =>
                      cat.service_types.map(st => (
                        <th key={st.id} className={th('w-[110px] text-right', getCellColorClass(cat.colorRank))}>
                          {st.name}
                        </th>
                      ))
                    )}
                    
                    <th className={th('w-[120px] text-right bg-primary/[0.04] font-bold')}>Billable (hrs)</th>
                    <th className={th('w-[120px] text-right bg-primary/[0.04] font-bold')}>Non-Bill. (hrs)</th>
                    <th className={th('w-[150px] text-right bg-primary/[0.04] font-bold')}>Total Utilization</th>
                    <th className={th('w-[110px] text-right bg-primary/[0.04] font-bold border-r-0')}>Utilization %</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {records.map((row, i) => (
                    <tr key={row.employee_id ?? i} className="group hover:bg-muted/30 transition-colors">
                      <td className={td('sticky left-0 z-10 bg-background group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 w-[50px] text-center text-muted-foreground transition-colors')}>
                        {((meta.page ?? page) - 1) * (meta.limit ?? limit) + i + 1}
                      </td>
                      <td className={td('sticky left-[50px] z-10 bg-background border-r border-border shadow-[1px_0_0_0_var(--border)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 transition-colors w-[220px] min-w-[220px] max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap')}>
                        <p className="font-medium">{row.full_name ?? '—'}</p>
                        {row.employee_code && (
                          <p className="text-[10px] text-muted-foreground font-mono">{row.employee_code}</p>
                        )}
                      </td>
                      <td className={td()}>{row.designation || <span className="text-muted-foreground">—</span>}</td>
                      <td className={td('text-right tabular-nums')}>{row.total_experience ?? '—'}</td>
                      <td className={td('text-right tabular-nums')}>{row.company_experience ?? '—'}</td>
                      <td className={td('truncate max-w-[150px]')} title={row.resource_description}>{row.resource_description || <span className="text-muted-foreground">—</span>}</td>
                      <td className={td('text-right tabular-nums')}>{row.monthly_capacity ?? '—'}</td>
                      <td className={td('text-right tabular-nums')}>{row.monthly_billing_capacity ?? '—'}</td>
                      <td className={td('max-w-[200px] truncate')} title={row.clients}>{row.clients || <span className="text-muted-foreground">—</span>}</td>
                      
                      {filteredColumns.map(cat =>
                        cat.service_types.map(st => (
                          <td key={st.id} className={td('text-right', getCellColorClass(cat.colorRank))}>
                            <HoursCell value={row.hours?.[st.id]} />
                          </td>
                        ))
                      )}

                      <td className={td('text-right font-semibold bg-primary/[0.02]')}>
                        <HoursCell value={row.billable_total} />
                      </td>
                      <td className={td('text-right font-semibold bg-primary/[0.02]')}>
                        <HoursCell value={row.non_billable_total} />
                      </td>
                      <td className={td('text-right font-semibold bg-primary/[0.02]')}>
                        <HoursCell value={row.total_utilization} />
                      </td>
                      <td className={td('text-right font-semibold bg-primary/[0.02] border-r-0')}>
                        <UtilizationPercentCell value={row.utilization_percentage} />
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>

          {/* ── Mobile: expandable employee cards — one card per record, grouping that
              employee's hours by category (Billable/Non-Billable/Customer Non-Billable/…)
              instead of squeezing the wide dynamic-column table. Every column the desktop table
              shows is still reachable here, just inside the expanded card rather than a column. ── */}
          <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto md:hidden">
            {records.map((row, i) => {
              const employeeKey = row.employee_id ?? i;
              const isExpanded = expandedEmployeeIds.has(employeeKey);
              return (
                <div key={employeeKey} className="rounded-lg border bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleEmployee(employeeKey)}
                    className="flex w-full items-center justify-between gap-2 p-3.5 text-left active:bg-muted/30"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{row.full_name ?? '—'}</span>
                        {row.employee_code && (
                          <span className="block truncate text-xs font-mono text-muted-foreground">{row.employee_code}</span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {isExpanded ? 'Total ' : ''}<HoursCell value={row.total_utilization} />h
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-3 border-t p-3.5 text-xs">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <p className="text-muted-foreground">Designation</p>
                          <p className="font-medium text-foreground">{row.designation || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Client(s)</p>
                          <p className="truncate font-medium text-foreground" title={row.clients}>{row.clients || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total / Co. Exp</p>
                          <p className="font-medium text-foreground">{row.total_experience ?? '—'} / {row.company_experience ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Cap. / Bill. Cap.</p>
                          <p className="font-medium text-foreground">{row.monthly_capacity ?? '—'} / {row.monthly_billing_capacity ?? '—'}</p>
                        </div>
                        {row.resource_description && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground">Resource Description</p>
                            <p className="font-medium text-foreground">{row.resource_description}</p>
                          </div>
                        )}
                      </div>

                      {filteredColumns.map((cat) => (
                        <div key={cat.category_id}>
                          <p className={cn('rounded px-2 py-1 text-[11px] font-semibold', getCategoryColorClass(cat.colorRank))}>
                            {cat.category_name}
                          </p>
                          <div className="mt-1 space-y-1">
                            {cat.service_types.map((st) => (
                              <div key={st.id} className="flex items-center justify-between px-1">
                                <span className="text-muted-foreground">{st.name}</span>
                                <HoursCell value={row.hours?.[st.id]} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="grid grid-cols-2 gap-2 border-t pt-3">
                        <div className="rounded-md border bg-primary/[0.04] px-2.5 py-1.5">
                          <p className="text-muted-foreground">Billable (hrs)</p>
                          <p className="font-semibold"><HoursCell value={row.billable_total} /></p>
                        </div>
                        <div className="rounded-md border bg-primary/[0.04] px-2.5 py-1.5">
                          <p className="text-muted-foreground">Non-Bill. (hrs)</p>
                          <p className="font-semibold"><HoursCell value={row.non_billable_total} /></p>
                        </div>
                        <div className="rounded-md border bg-primary/[0.04] px-2.5 py-1.5">
                          <p className="text-muted-foreground">Total Utilization</p>
                          <p className="font-semibold"><HoursCell value={row.total_utilization} /></p>
                        </div>
                        <div className="rounded-md border bg-primary/[0.04] px-2.5 py-1.5">
                          <p className="text-muted-foreground">Utilization %</p>
                          <p className="font-semibold"><UtilizationPercentCell value={row.utilization_percentage} /></p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination (desktop) */}
          <div className="shrink-0 mt-3 hidden items-center justify-between gap-2 md:flex">
            <p className="text-xs text-muted-foreground">
              {meta.total != null
                ? `${meta.total} employee${meta.total !== 1 ? 's' : ''} · page ${meta.page ?? page} of ${meta.totalPages ?? 1}`
                : `${records.length} employee${records.length !== 1 ? 's' : ''}`}
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
                    {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const currentPage = meta.page ?? page;
                const totalPages  = meta.totalPages ?? 1;
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground px-1">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline" size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                );
              })()}
            </div>
          </div>
          <MobilePagination
            className="shrink-0 mt-3 md:hidden"
            page={meta.page ?? page}
            totalPages={meta.totalPages ?? 1}
            total={meta.total}
            limit={meta.limit ?? limit}
            itemLabel="employee"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}
    </div>
  );
};

export default MonthlyResourceUtilization;
