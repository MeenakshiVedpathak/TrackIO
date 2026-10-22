import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
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

const exportToExcel = (rows) => {
  const header = ['Month', 'Billable', 'Non-Billable', 'Customer Non-Billable', 'Other'];
  const dataRows = rows.map((r) => [
    r.month ?? '',
    r.Billable != null ? Number(r.Billable) : '',
    r['Non-Billable'] != null ? Number(r['Non-Billable']) : '',
    r['Customer Non-Billable'] != null ? Number(r['Customer Non-Billable']) : '',
    r.Other != null ? Number(r.Other) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Hours Trend');
  XLSX.writeFile(wb, 'Monthly_Hours_Trend.xlsx');
};

const hoursColumns = [
  hoursColumnHelper.accessor('month', {
    header: 'Month',
    size: 120,
    cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
  }),
  hoursColumnHelper.accessor((row) => row.Billable, {
    id: 'billable',
    header: 'Billable',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  hoursColumnHelper.accessor((row) => row['Non-Billable'], {
    id: 'nonBillable',
    header: 'Non-Billable',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  hoursColumnHelper.accessor((row) => row['Customer Non-Billable'], {
    id: 'customerNonBillable',
    header: 'Customer Non-Billable',
    size: 210,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  hoursColumnHelper.accessor((row) => row.Other, {
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

const utilizationColumns = [
  utilizationColumnHelper.accessor('month', {
    header: 'Month',
    size: 120,
    cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
  }),
  utilizationColumnHelper.accessor('total_hours', {
    header: 'Total Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  utilizationColumnHelper.accessor('billable_hours', {
    header: 'Billable Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  utilizationColumnHelper.accessor('utilization_percentage', {
    header: 'Utilization %',
    size: 150,
    cell: (info) => (
      <span className={cn('tabular-nums font-medium', utilizationColorClass(info.getValue()))}>
        {formatPercentage(info.getValue())}
      </span>
    ),
  }),
];

const leaveNoWorkColumns = [
  leaveColumnHelper.accessor('month', {
    header: 'Month',
    size: 120,
    cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
  }),
  leaveColumnHelper.accessor('leave_hours', {
    header: 'Leave Hours',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  leaveColumnHelper.accessor('no_work_hours', {
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

  const [employeeId, setEmployeeId] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [poId, setPoId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buId, setBuId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);

  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  // Role no longer grants Original-data visibility (e.g. role reassigned mid-session) — force
  // back to Modified, same as every other report.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  const { data: activeClients = [] } = useActiveClients();
  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeEmployees = [] } = useActiveEmployees();

  // Service Type -> Project (Service PO) cascade, same as ClientServicePOHoursReport.
  const filteredPOs = serviceTypeId === 'all'
    ? activePOs
    : activePOs.filter((po) => String(po.serviceType?.id) === serviceTypeId);

  const handleServiceTypeChange = (v) => {
    setServiceTypeId(v);
    setPoId('all');
  };

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? (monthYear ? { month: monthYear.month, year: monthYear.year } : {})
      : (dateRange?.startDate && dateRange?.endDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {})),
    hoursSource,
    ...(employeeId !== 'all' && { employeeId }),
    ...(clientId !== 'all' && { clientId }),
    ...(poId !== 'all' && { poId }),
    ...(serviceTypeId !== 'all' && { serviceTypeId }),
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
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
    no_work_hours: noWorkTrend[i]?.no_work_hours,
  })), [leaveTrend, noWorkTrend]);

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    employeeId !== 'all',
    clientId !== 'all',
    poId !== 'all',
    serviceTypeId !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setEmployeeId('all');
    setClientId('all');
    setPoId('all');
    setServiceTypeId('all');
  };

  const handleExport = () => exportToExcel(hoursByCategory);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Monthly Hours Trend"
        description="Hours by category, cost by category, utilization, and leave/no-work hours across a resolved month range."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewOriginal && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border shrink-0">
                {[
                  { value: 'O', label: 'Original' },
                  { value: 'M', label: 'Published' },
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
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="h-9"
            />
            {hoursByCategory.length > 0 && (
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
        gridClassName="items-end gap-x-4 gap-y-5 rounded-xl border-slate-200/80 bg-slate-50/70 p-5 shadow-sm"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter
          value={entityId}
          onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }}
          labelClassName={FILTER_LABEL}
        />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} labelClassName={FILTER_LABEL} />

        {/* Period mode and its picker take one grid cell each, rather than sharing a single
            col-span-2 cell: a picker stretched across two columns dwarfed every neighbouring
            control, and split this way all seven filters sit on the same column rhythm. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs value={periodMode} onValueChange={setPeriodMode}>
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white">
                Month
              </TabsTrigger>
              <TabsTrigger value="range" className="text-xs font-semibold data-[state=active]:bg-white">
                Date Range
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* The required marker belongs on the value, not the mode toggle above — the toggle
            always holds one of its two values, so it is the picker that can be left unset. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>
            {periodMode === 'month' ? 'Month & Year' : 'Date Range'} <span className="text-destructive">*</span>
          </Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={setMonthYear}
              placeholder="Select month"
              clearable={false}
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
          <SearchableSelect
            options={[
              { label: 'All Clients', value: 'all' },
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientId}
            onValueChange={setClientId}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service Type</Label>
          <SearchableSelect
            options={[
              { label: 'All Service Types', value: 'all' },
              ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) })),
            ]}
            value={serviceTypeId}
            onValueChange={handleServiceTypeChange}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Project (Service PO)</Label>
          <SearchableSelect
            options={[
              { label: 'All Projects', value: 'all' },
              ...filteredPOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poId}
            onValueChange={setPoId}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <SearchableSelect
            options={[
              { label: 'All Employees', value: 'all' },
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
            ]}
            value={employeeId}
            onValueChange={setEmployeeId}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="h-9 w-full text-sm"
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
              tableContainerClassName="max-h-[40vh]"
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
              tableContainerClassName="max-h-[40vh]"
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
              tableContainerClassName="max-h-[40vh]"
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
              tableContainerClassName="max-h-[40vh]"
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
