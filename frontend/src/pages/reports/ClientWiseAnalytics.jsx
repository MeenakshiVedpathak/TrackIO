import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from 'lucide-react';
import { useClientWiseAnalytics } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { formatCurrency, formatHours, formatNumber, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/utils/cn';

// Filter labels read as uppercase micro-labels, echoing the data table's own column headers so
// the panel and the table below it look like one surface.
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const columnHelper = createColumnHelper();

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const exportToExcel = (rows) => {
  const hasOriginal = rows.some((r) => r.original_total_hours != null);
  const header = [
    'Client',
    'Total Cost',
    'Total Hours',
    ...(hasOriginal ? ['Original Total Hours'] : []),
    'Avg Cost/Hour',
    'Total Projects',
    '% of Total Cost',
  ];
  const dataRows = rows.map((r) => [
    r.client_name ?? '',
    r.total_cost != null ? Number(r.total_cost) : '',
    r.total_hours != null ? Number(r.total_hours) : '',
    ...(hasOriginal ? [r.original_total_hours != null ? Number(r.original_total_hours) : ''] : []),
    r.average_cost_per_hour != null ? Number(r.average_cost_per_hour) : '',
    r.total_projects != null ? Number(r.total_projects) : '',
    r.percentage_of_total_cost != null ? Number(r.percentage_of_total_cost) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Client Wise Analytics');
  XLSX.writeFile(wb, 'Client_Wise_Analytics.xlsx');
};

// Adapted from ClientServicePOHoursReport.jsx's SortableHeader — same two-state (asc/desc)
// toggle, but rendered as a column `header` render fn with `enableSorting: false` on every
// DataTable column so the table doesn't also wrap it in its own toggle button.
const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-foreground transition-colors',
        align === 'right' && 'justify-end w-full'
      )}
    >
      {label}
      <Icon className={cn('h-3 w-3', !isActive && 'opacity-40')} />
    </button>
  );
};

const ClientWiseAnalytics = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [dateRange, setDateRange] = useState(null);

  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [poIds, setPoIds] = useState([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buIds, setBuIds] = useState([]);
  const [entityIds, setEntityIds] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [exporting, setExporting] = useState(false);

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);

  // Service Type -> Project (Service PO) cascade, same as ClientServicePOHoursReport.
  const filteredPOs = serviceTypeIds.length === 0
    ? activePOs
    : activePOs.filter((po) => serviceTypeIds.includes(String(po.serviceType?.id)));

  const handleServiceTypeChange = (v) => {
    setServiceTypeIds(v);
    setPoIds([]);
    setPage(1);
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? (monthYear?.month && monthYear?.year && { month: monthYear.month, year: monthYear.year })
      : (dateRange?.startDate && dateRange?.endDate && { startDate: dateRange.startDate, endDate: dateRange.endDate })),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(serviceTypeIds.length > 0 && { serviceTypeIds: serviceTypeIds.join(',') }),
    ...(sortBy && { sortBy, sortOrder }),
    page,
    limit,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useClientWiseAnalytics(params);

  const records = periodReady && Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    employeeIds.length > 0,
    clientIds.length > 0,
    serviceTypeIds.length > 0,
    poIds.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setClientIds([]);
    setServiceTypeIds([]);
    setPoIds([]);
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getClientWiseAnalytics({ ...params, page: 1, limit: total });
      const allRecords = Array.isArray(res?.data) ? res.data : [];
      exportToExcel(allRecords);
    } finally {
      setExporting(false);
    }
  };

  const hasOriginal = useMemo(() => {
    return records.some((r) => r.original_total_hours != null);
  }, [records]);

  const columns = useMemo(() => [
    columnHelper.accessor('client_name', {
      header: 'Client',
      size: 220,
      enableSorting: false,
      cell: (info) => <div className="truncate font-medium max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    columnHelper.accessor('total_cost', {
      header: () => (
        <SortableHeader label="Total Cost" column="total_cost" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 160,
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('total_hours', {
      header: () => (
        <SortableHeader label="Total Hours" column="total_hours" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 140,
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
    }),
    ...(hasOriginal ? [
      columnHelper.accessor('original_total_hours', {
        header: () => (
          <SortableHeader label="Original Total Hours" column="original_total_hours" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
        ),
        size: 150,
        enableSorting: false,
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue() != null ? formatHours(info.getValue()) : '—'}</span>,
      }),
    ] : []),
    columnHelper.accessor('average_cost_per_hour', {
      header: () => (
        <SortableHeader label="Avg Cost/Hour" column="average_cost_per_hour" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 160,
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('total_projects', {
      header: () => (
        <SortableHeader label="Total Projects" column="total_projects" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 140,
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
    }),
    columnHelper.accessor('percentage_of_total_cost', {
      header: () => (
        <SortableHeader label="% of Total Cost" column="percentage_of_total_cost" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 180,
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        return (
          <div className="flex items-center gap-2">
            <Progress value={Number(value)} className="h-1.5 w-16" />
            <span className="tabular-nums text-xs text-muted-foreground">{formatPercentage(value)}</span>
          </div>
        );
      },
    }),
  ], [sortBy, sortOrder, hasOriginal]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Client Wise Analytics"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[460px]"
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
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
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
            selection to a Mon-Sat business week instead of two free clicks, emitting the
            identical {startDate, endDate} shape, so periodReady/params below need no separate
            case. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>
            {periodMode === 'month' ? 'Month & Year' : periodMode === 'weekly' ? 'Week' : 'Date Range'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="Select month"
              clearable={false}
              className="w-full"
            />
          ) : periodMode === 'weekly' ? (
            <WeekPicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); setPage(1); }}
              placeholder="Select week"
              className="w-full"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); setPage(1); }}
              placeholder="Select date range"
              className="w-full"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <MultiSelect
            options={[
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) , 
            ...(e.original_total_hours != null ? {'Original Total Hours': e.original_total_hours} : {}),
            ...(e.original_billable_hours != null ? {'Original Billable Hours': e.original_billable_hours} : {}),
            ...(e.original_hours != null ? {'Original Hours': e.original_hours} : {})
          })),
            ]}
            value={employeeIds}
            onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <MultiSelect
            options={[
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) , 
            ...(c.original_total_hours != null ? {'Original Total Hours': c.original_total_hours} : {}),
            ...(c.original_billable_hours != null ? {'Original Billable Hours': c.original_billable_hours} : {}),
            ...(c.original_hours != null ? {'Original Hours': c.original_hours} : {})
          })),
            ]}
            value={clientIds}
            onValueChange={(v) => { setClientIds(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service Type</Label>
          <MultiSelect
            options={[
              ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) , 
            ...(st.original_total_hours != null ? {'Original Total Hours': st.original_total_hours} : {}),
            ...(st.original_billable_hours != null ? {'Original Billable Hours': st.original_billable_hours} : {}),
            ...(st.original_hours != null ? {'Original Hours': st.original_hours} : {})
          })),
            ]}
            value={serviceTypeIds}
            onValueChange={handleServiceTypeChange}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Project (Service PO)</Label>
          <MultiSelect
            options={[
              ...filteredPOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
                  ...(po.original_total_hours != null ? {'Original Total Hours': po.original_total_hours} : {}),
            ...(po.original_billable_hours != null ? {'Original Billable Hours': po.original_billable_hours} : {}),
            ...(po.original_hours != null ? {'Original Hours': po.original_hours} : {})
          })),
            ]}
            value={poIds}
            onValueChange={(v) => { setPoIds(v); setPage(1); }}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={records}
        isLoading={periodReady && isPending}
        emptyState={!periodReady ? (
          <EmptyState title="Select a period" description="Choose a month or a complete date range to load the report." />
        ) : undefined}
        pagination={periodReady && meta.total != null ? {
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total,
        } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default ClientWiseAnalytics;
