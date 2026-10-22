import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Info } from 'lucide-react';
import { useMonthlyHoursTrend } from '@/hooks/useReports';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { formatCurrency, formatHours, formatPercentage } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Filter labels read as uppercase micro-labels, echoing the data table's own column headers so
// the panel and the tables below it look like one surface (same treatment as ClientWiseAnalytics).
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const hoursColumnHelper = createColumnHelper();
const costColumnHelper = createColumnHelper();
const utilizationColumnHelper = createColumnHelper();
const leaveColumnHelper = createColumnHelper();

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// The page renders four separate tables (Hours by Category, Cost by Category, Utilization,
// Leave/No-Work Hours) — every table gets its own sheet in the same workbook. In Original mode
// the export uses original_* fields under the same column names (no "Original" prefix needed
// since the whole export is in that mode) and appends "_Original" to the filename.
const exportToExcel = ({ hoursByCategory, costRows, costCategoryNames, utilization, leaveNoWorkRows, hoursSource = 'M' }) => {
  const isOriginal = hoursSource === 'O';
  const wb = XLSX.utils.book_new();

  const hoursHeader = ['Month', 'Billable', 'Non-Billable', 'Customer Non-Billable', 'Other'];
  const hoursDataRows = hoursByCategory.map((r) => [
    r.month ?? '',
    isOriginal ? (r.original_Billable != null ? Number(r.original_Billable) : '') : (r.Billable != null ? Number(r.Billable) : ''),
    isOriginal ? (r['original_Non-Billable'] != null ? Number(r['original_Non-Billable']) : '') : (r['Non-Billable'] != null ? Number(r['Non-Billable']) : ''),
    isOriginal ? (r['original_Customer Non-Billable'] != null ? Number(r['original_Customer Non-Billable']) : '') : (r['Customer Non-Billable'] != null ? Number(r['Customer Non-Billable']) : ''),
    isOriginal ? (r.original_Other != null ? Number(r.original_Other) : '') : (r.Other != null ? Number(r.Other) : ''),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hoursHeader, ...hoursDataRows]), 'Hours by Category');

  const costHeader = ['Month', ...costCategoryNames];
  const costDataRows = costRows.map((r) => [
    r.month ?? '',
    ...costCategoryNames.map((name) => (r[name] != null ? Number(r[name]) : '')),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([costHeader, ...costDataRows]), 'Cost by Category');

  const utilizationHeader = ['Month', 'Total Hours', 'Billable Hours', 'Billable Mix %', 'Employees', 'Capacity Hrs', 'Billable % of Capacity'];
  const utilizationDataRows = utilization.map((r) => [
    r.month ?? '',
    isOriginal ? (r.original_total_hours != null ? Number(r.original_total_hours) : '') : (r.total_hours != null ? Number(r.total_hours) : ''),
    isOriginal ? (r.original_billable_hours != null ? Number(r.original_billable_hours) : '') : (r.billable_hours != null ? Number(r.billable_hours) : ''),
    isOriginal ? (r.original_utilization_percentage != null ? Number(r.original_utilization_percentage) : '') : (r.utilization_percentage != null ? Number(r.utilization_percentage) : ''),
    r.employee_count ?? '',
    r.capacity_hours != null ? Number(r.capacity_hours) : '',
    isOriginal ? (r.original_billable_vs_capacity_percentage != null ? Number(r.original_billable_vs_capacity_percentage) : '') : (r.billable_vs_capacity_percentage != null ? Number(r.billable_vs_capacity_percentage) : ''),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([utilizationHeader, ...utilizationDataRows]), 'Utilization');

  const leaveHeader = ['Month', 'Leave Hours', 'No-Work Hours'];
  const leaveDataRows = leaveNoWorkRows.map((r) => [
    r.month ?? '',
    isOriginal ? (r.original_leave_hours != null ? Number(r.original_leave_hours) : '') : (r.leave_hours != null ? Number(r.leave_hours) : ''),
    isOriginal ? (r.original_no_work_hours != null ? Number(r.original_no_work_hours) : '') : (r.no_work_hours != null ? Number(r.no_work_hours) : ''),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([leaveHeader, ...leaveDataRows]), 'Leave-No-Work Hours');

  XLSX.writeFile(wb, `Monthly_Hours_Trend${isOriginal ? '_Original' : ''}.xlsx`);
};

const getHoursColumns = ({ isOriginal = false } = {}) => [
  hoursColumnHelper.accessor('month', {
    header: 'Month',
    size: 120,
    cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
  }),
  hoursColumnHelper.accessor((row) => (isOriginal ? row.original_Billable : row.Billable), {
    id: 'billable',
    header: 'Billable',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  hoursColumnHelper.accessor((row) => (isOriginal ? row['original_Non-Billable'] : row['Non-Billable']), {
    id: 'nonBillable',
    header: 'Non-Billable',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  hoursColumnHelper.accessor((row) => (isOriginal ? row['original_Customer Non-Billable'] : row['Customer Non-Billable']), {
    id: 'customerNonBillable',
    header: 'Customer Non-Billable',
    size: 210,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  hoursColumnHelper.accessor((row) => (isOriginal ? row.original_Other : row.Other), {
    id: 'other',
    header: 'Other',
    size: 130,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
];

// >=75% is healthy utilization, >=50% is borderline, below that flags under-utilization —
// same emerald/amber/destructive vocabulary the other reports use for good/caution/bad values.
const utilizationColorClass = (value) => {
  if (value == null) return 'text-muted-foreground';
  const num = Number(value);
  if (num >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (num >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
};

// Capacity-based percentages are allowed to exceed 100% (original hours logged beyond the cap) —
// never clamped, just flagged amber above 100% rather than colored by the billable-mix healthy/
// borderline/bad scale above, which doesn't apply to a capacity comparison.
const capacityColorClass = (value) => {
  if (value == null) return 'text-muted-foreground';
  return Number(value) > 100 ? 'text-amber-600 dark:text-amber-400' : '';
};

// DataTable makes every sortable column header a <button> (toggles sorting on click) — the info
// trigger here is a focusable <span>, not a nested <button>, so it never ends up inside another
// interactive button element, which browsers handle unpredictably.
const HeaderWithInfo = ({ label, tooltip }) => (
  <span className="inline-flex items-center gap-1">
    {label}
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`What is ${label}?`}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  </span>
);

const BILLABLE_MIX_TOOLTIP = 'Billable hours / total logged hours. 100% means everything logged was billable. It does not compare against capacity.';
const BILLABLE_VS_CAPACITY_TOOLTIP = "Billable hours / (people who logged that month x that month's Monthly Cap Hours). Original hours above the cap can exceed 100%.";

const getUtilizationColumns = ({ isOriginal = false } = {}) => [
  utilizationColumnHelper.accessor('month', {
    header: 'Month',
    size: 120,
    cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
  }),
  utilizationColumnHelper.accessor(isOriginal ? 'original_total_hours' : 'total_hours', {
    id: 'totalHours',
    header: 'Total Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  utilizationColumnHelper.accessor(isOriginal ? 'original_billable_hours' : 'billable_hours', {
    id: 'billableHours',
    header: 'Billable Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  utilizationColumnHelper.accessor(isOriginal ? 'original_utilization_percentage' : 'utilization_percentage', {
    id: 'utilizationPct',
    header: () => <HeaderWithInfo label="Billable Mix %" tooltip={BILLABLE_MIX_TOOLTIP} />,
    size: 160,
    cell: (info) => (
      <span className={cn('tabular-nums font-medium', utilizationColorClass(info.getValue()))}>
        {formatPercentage(info.getValue())}
      </span>
    ),
  }),
  utilizationColumnHelper.accessor('employee_count', {
    header: 'Employees',
    size: 120,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? '—'}</span>,
  }),
  utilizationColumnHelper.accessor('capacity_hours', {
    header: 'Capacity Hrs',
    size: 150,
    cell: (info) => <span className="tabular-nums">{info.getValue() != null ? formatHours(info.getValue()) : '—'}</span>,
  }),
  utilizationColumnHelper.accessor(isOriginal ? 'original_billable_vs_capacity_percentage' : 'billable_vs_capacity_percentage', {
    id: 'billableVsCapacity',
    header: () => <HeaderWithInfo label="Billable % of Capacity" tooltip={BILLABLE_VS_CAPACITY_TOOLTIP} />,
    size: 200,
    cell: (info) => {
      const val = info.getValue();
      return <span className={cn('tabular-nums font-medium', capacityColorClass(val))}>{val != null ? formatPercentage(val, 2) : '—'}</span>;
    },
  }),
];

const getLeaveNoWorkColumns = ({ isOriginal = false } = {}) => [
  leaveColumnHelper.accessor('month', {
    header: 'Month',
    size: 120,
    cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
  }),
  leaveColumnHelper.accessor(isOriginal ? 'original_leave_hours' : 'leave_hours', {
    id: 'leaveHours',
    header: 'Leave Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  leaveColumnHelper.accessor(isOriginal ? 'original_no_work_hours' : 'no_work_hours', {
    id: 'noWorkHours',
    header: 'No-Work Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
];

const ReportSection = ({ title, children }) => (
  <div className="mb-6 last:mb-0">
    <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
    {children}
  </div>
);

const MonthlyHoursTrend = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [dateRange, setDateRange] = useState(null);

  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);

  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  // Role no longer grants Original-data visibility (e.g. role reassigned mid-session) — force
  // back to Modified, same as every other report.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);

  // Service Type -> Project (Service PO) cascade, same as ClientServicePOHoursReport.
  const filteredPOs = serviceTypeIds.length === 0
    ? activePOs
    : activePOs.filter((po) => serviceTypeIds.includes(String(po.serviceType?.id)));

  const handleServiceTypeChange = (v) => {
    setServiceTypeIds(v);
    setPoIds([]);
  };

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? (monthYear ? { month: monthYear.month, year: monthYear.year } : {})
      : (dateRange?.startDate && dateRange?.endDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {})),
    hoursSource,
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(serviceTypeIds.length > 0 && { serviceTypeIds: serviceTypeIds.join(',') }),
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useMonthlyHoursTrend(params);

  const hoursByCategory = data?.data?.monthly_hours_by_category ?? [];
  const costByCategory = data?.data?.monthly_cost_by_category ?? [];
  const utilization = data?.data?.monthly_utilization ?? [];
  const leaveTrend = data?.data?.leave_hours_trend ?? [];
  const noWorkTrend = data?.data?.no_work_trend ?? [];

  // monthly_cost_by_category nests an array of {category_name, cost} per month rather than flat
  // keys — category names aren't a fixed set, so derive the column list from every name seen
  // across all months, then flatten each month into one row keyed by category name.
  const costCategoryNames = useMemo(() => {
    const set = new Set();
    costByCategory.forEach((m) => (m.categories ?? []).forEach((c) => set.add(c.category_name)));
    return Array.from(set);
  }, [costByCategory]);

  const costRows = useMemo(() => costByCategory.map((m) => {
    const row = { month: m.month };
    (m.categories ?? []).forEach((c) => { row[c.category_name] = c.cost; });
    return row;
  }), [costByCategory]);

  const costColumns = useMemo(() => [
    costColumnHelper.accessor('month', {
      header: 'Month',
      size: 120,
      cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
    }),
    // Widened to fit the longest known category label ("Customer Non-Billable") on one line —
    // category names are data-driven, not a fixed set, so this is a best-effort default.
    ...costCategoryNames.map((name) => costColumnHelper.accessor((row) => row[name], {
      id: name,
      header: name,
      size: 210,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    })),
  ], [costCategoryNames]);

  // leave_hours_trend and no_work_trend are the same length/order — zip by index into one table.
  const leaveNoWorkRows = useMemo(() => leaveTrend.map((l, i) => ({
    month: l.month,
    leave_hours: l.leave_hours,
    original_leave_hours: l.original_leave_hours,
    no_work_hours: noWorkTrend[i]?.no_work_hours,
    original_no_work_hours: noWorkTrend[i]?.original_no_work_hours,
  })), [leaveTrend, noWorkTrend]);

  const isOriginal = hoursSource === 'O';

  const hoursColumns = useMemo(() => getHoursColumns({ isOriginal }), [isOriginal]);
  const utilizationColumns = useMemo(() => getUtilizationColumns({ isOriginal }), [isOriginal]);
  const leaveNoWorkColumns = useMemo(() => getLeaveNoWorkColumns({ isOriginal }), [isOriginal]);

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    employeeIds.length > 0,
    clientIds.length > 0,
    poIds.length > 0,
    serviceTypeIds.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setPoIds([]);
    setServiceTypeIds([]);
  };

  const hasAnyData = hoursByCategory.length > 0 || costRows.length > 0 || utilization.length > 0 || leaveNoWorkRows.length > 0;
  const handleExport = () => exportToExcel({ hoursByCategory, costRows, costCategoryNames, utilization, leaveNoWorkRows, hoursSource });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Monthly Hours Trend"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewOriginal && (
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border shrink-0">
                  {[
                    { value: 'O', label: 'Original' },
                    { value: 'M', label: 'Adjusted' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setHoursSource(value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                        hoursSource === value ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {hoursSource === 'O' ? 'Original (as logged, before the monthly cap)' : 'Adjusted (after sync)'}
                </span>
              </div>
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {hasAnyData && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[420px]"
        gridClassName="items-end gap-x-[clamp(0.5rem,0.8vw,0.75rem)] gap-y-[clamp(0.625rem,1vw,0.875rem)] rounded-xl border-slate-200/80 bg-slate-50/70 p-[clamp(0.5rem,0.8vw,0.75rem)] shadow-sm"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter
          multiple
          value={entityIds}
          onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setPoIds([]); }}
          labelClassName={FILTER_LABEL}
        />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setPoIds([]); }} labelClassName={FILTER_LABEL} />

        {/* Period mode and its picker take one grid cell each, rather than sharing a single
            col-span-2 cell: a picker stretched across two columns dwarfed every neighbouring
            control, and split this way all seven filters sit on the same column rhythm. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs value={periodMode} onValueChange={setPeriodMode}>
            <TabsList className="grid w-full grid-cols-3 border border-input bg-slate-100">
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white">
                Month
              </TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs font-semibold data-[state=active]:bg-white">
                Weekly
              </TabsTrigger>
              <TabsTrigger value="range" className="text-xs font-semibold data-[state=active]:bg-white">
                Date Range
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* The required marker belongs on the value, not the mode toggle above — the toggle
            always holds one of its three values, so it is the picker that can be left unset.
            'weekly' shares the same `dateRange` state as 'range' — WeekPicker just snaps
            selection to a Mon-Sat business week instead of two free clicks, so
            periodReady/params below need no separate weekly case. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>
            {periodMode === 'month' ? 'Month & Year' : periodMode === 'weekly' ? 'Week' : 'Date Range'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={setMonthYear}
              placeholder="Select month"
              clearable={false}
              className="w-full"
            />
          ) : periodMode === 'weekly' ? (
            <WeekPicker
              value={dateRange}
              onChange={setDateRange}
              placeholder="Select week"
              className="w-full"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              placeholder="Select date range"
              className="w-full"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <MultiSelect
            options={[
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientIds}
            onValueChange={setClientIds}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service Type</Label>
          <MultiSelect
            options={[
              ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) })),
            ]}
            value={serviceTypeIds}
            onValueChange={handleServiceTypeChange}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Project (Service PO)</Label>
          <MultiSelect
            options={[
              ...filteredPOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poIds}
            onValueChange={setPoIds}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <MultiSelect
            options={[
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
            ]}
            value={employeeIds}
            onValueChange={setEmployeeIds}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
      </FilterPanel>

      {!periodReady ? (
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Select a month or date range to load the report.
        </div>
      ) : (
        <>
          <ReportSection title="Hours by Category">
            <DataTable
              mobileCards
              tableContainerClassName="max-h-[min(346px,40vh)]"
              columns={hoursColumns}
              data={hoursByCategory}
              isLoading={isPending}
              emptyState={
                <EmptyState
                  title="No hours data"
                  description="No hours were found for the selected period. Try a different period or filters."
                />
              }
            />
          </ReportSection>

          <ReportSection title="Cost by Category">
            <DataTable
              mobileCards
              tableContainerClassName="max-h-[min(346px,40vh)]"
              columns={costColumns}
              data={costRows}
              isLoading={isPending}
              emptyState={
                <EmptyState
                  title="No cost data"
                  description="No cost data was found for the selected period. Try a different period or filters."
                />
              }
            />
          </ReportSection>

          <ReportSection title="Utilization">
            <DataTable
              mobileCards
              tableContainerClassName="max-h-[min(346px,40vh)]"
              columns={utilizationColumns}
              data={utilization}
              isLoading={isPending}
              emptyState={
                <EmptyState
                  title="No utilization data"
                  description="No utilization data was found for the selected period. Try a different period or filters."
                />
              }
            />
          </ReportSection>

          <ReportSection title="Leave / No-Work Hours">
            <DataTable
              mobileCards
              tableContainerClassName="max-h-[min(346px,40vh)]"
              columns={leaveNoWorkColumns}
              data={leaveNoWorkRows}
              isLoading={isPending}
              emptyState={
                <EmptyState
                  title="No leave / no-work data"
                  description="No leave or no-work hours were found for the selected period. Try a different period or filters."
                />
              }
            />
          </ReportSection>
        </>
      )}
    </div>
  );
};

export default MonthlyHoursTrend;
