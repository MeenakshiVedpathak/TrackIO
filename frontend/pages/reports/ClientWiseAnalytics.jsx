import { useState } from 'react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
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
  const header = ['Client', 'Total Cost', 'Total Hours', 'Avg Cost/Hour', 'Total Projects', '% of Total Cost'];
  const dataRows = rows.map((r) => [
    r.client_name ?? '',
    r.total_cost != null ? Number(r.total_cost) : '',
    r.total_hours != null ? Number(r.total_hours) : '',
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

  const [employeeId, setEmployeeId] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [poId, setPoId] = useState('all');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buId, setBuId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [exporting, setExporting] = useState(false);

  const { data: activeEmployees = [] } = useActiveEmployees();
  const { data: activeClients = [] } = useActiveClients();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activePOs = [] } = useActiveServicePOs();

  // Service Type -> Project (Service PO) cascade, same as ClientServicePOHoursReport.
  const filteredPOs = serviceTypeId === 'all'
    ? activePOs
    : activePOs.filter((po) => String(po.serviceType?.id) === serviceTypeId);

  const handleServiceTypeChange = (v) => {
    setServiceTypeId(v);
    setPoId('all');
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
    ...(employeeId !== 'all' && { employeeId }),
    ...(clientId !== 'all' && { clientId }),
    ...(poId !== 'all' && { poId }),
    ...(serviceTypeId !== 'all' && { serviceTypeId }),
    ...(sortBy && { sortBy, sortOrder }),
    page,
    limit,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useClientWiseAnalytics(params);

  const records = periodReady && Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    employeeId !== 'all',
    clientId !== 'all',
    serviceTypeId !== 'all',
    poId !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setEmployeeId('all');
    setClientId('all');
    setServiceTypeId('all');
    setPoId('all');
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

  const columns = [
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
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Client Wise Analytics"
        description="Cost, hours and project distribution per client for the selected period."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="h-9"
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
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
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
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="Select month"
              clearable={false}
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
          <SearchableSelect
            options={[
              { label: 'All Employees', value: 'all' },
              ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
            ]}
            value={employeeId}
            onValueChange={(v) => { setEmployeeId(v); setPage(1); }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <SearchableSelect
            options={[
              { label: 'All Clients', value: 'all' },
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientId}
            onValueChange={(v) => { setClientId(v); setPage(1); }}
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
            onValueChange={(v) => { setPoId(v); setPage(1); }}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-9 w-full text-sm"
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
