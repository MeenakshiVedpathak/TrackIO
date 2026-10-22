import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertCircle, Download } from 'lucide-react';
import { useClientCostAnalytics } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { useActiveClients } from '@/hooks/useClients';
import { extractApiError } from '@/services/apiClient';
import { formatCurrency, formatHours, formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SegmentedToggle from '@/components/common/SegmentedToggle';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const columnHelper = createColumnHelper();

// The page has three tabs (Top Clients, All Clients, Category Breakdown) — the export used to
// only ever cover "All Clients" regardless of which tab was active, so Category Breakdown's
// dynamic per-category columns were never exportable at all. Every tab now gets its own sheet.
// Top Clients is server-paginated — its sheet covers only the currently-loaded page, same
// current-page tradeoff other reports document for their own exports; All Clients and Category
// Breakdown are both already all-time/unpaginated datasets.
const exportToExcel = ({ topClients, clients, categoryMatrix, categoryNames }) => {
  const wb = XLSX.utils.book_new();

  const hasOrigTop = topClients.some((c) => c.original_total_hours != null);
  const topHeader = [
    'Rank',
    'Client',
    'Total Hours',
    ...(hasOrigTop ? ['Original Total Hours'] : []),
    'Total Cost',
  ];
  const topRows = topClients.map((c) => [
    c.rank ?? '',
    c.client_name ?? '',
    c.total_hours != null ? Number(c.total_hours) : '',
    ...(hasOrigTop ? [c.original_total_hours != null ? Number(c.original_total_hours) : ''] : []),
    c.total_cost != null ? Number(c.total_cost) : '',
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([topHeader, ...topRows]), 'Top Clients');

  const hasOrigAll = clients.some((c) => c.original_total_hours != null);
  const allHeader = [
    'Client',
    'Total Hours',
    ...(hasOrigAll ? ['Original Total Hours'] : []),
    'Total Cost',
  ];
  const allRows = clients.map((c) => [
    c.client_name ?? '',
    c.total_hours != null ? Number(c.total_hours) : '',
    ...(hasOrigAll ? [c.original_total_hours != null ? Number(c.original_total_hours) : ''] : []),
    c.total_cost != null ? Number(c.total_cost) : '',
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([allHeader, ...allRows]), 'All Clients');

  const categoryHeader = ['Client', ...categoryNames, 'Total Cost'];
  const categoryRows = categoryMatrix.map((row) => [
    row.client_name ?? '',
    ...categoryNames.map((name) => (row.categories?.[name] != null ? Number(row.categories[name]) : '')),
    row.total_cost != null ? Number(row.total_cost) : '',
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([categoryHeader, ...categoryRows]), 'Category Breakdown');

  XLSX.writeFile(wb, 'Client_Cost_Analytics.xlsx');
};

const ClientCostAnalytics = () => {
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');
  const [activeTab, setActiveTab] = useState('top');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  // This report has no other filter, so the Filters panel exists purely to host the BU picker
  // — every other Reports page already carries one, and the BU choice belongs in the same place.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  // Period is optional here (unlike every month/range-gated report elsewhere) — leaving both
  // empty means all-time, matching this report's original always-all-time behavior.
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeClients = [] } = useActiveClients(scope);

  // Role no longer grants Original-data visibility (e.g. role reassigned mid-session) — force
  // back to Modified, same as every other report.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  // Period is optional — omit both month/year and startDate/endDate for all-time (the backend's
  // own default, same as before this filter existed). Never sent together.
  // `buId` is always the 'all' sentinel so explicitBuScope always drops the X-Company-Id
  // header, letting `businessUnitIds` below narrow the full role reach instead.
  const params = {
    hoursSource,
    page,
    limit,
    buId: ALL_BUS,
    ...(periodMode === 'month'
      ? (monthYear?.month && monthYear?.year ? { month: monthYear.month, year: monthYear.year } : {})
      : (dateRange?.startDate && dateRange?.endDate ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : {})),
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
  };

  const { data, isPending, isError, error } = useClientCostAnalytics(params);
  const errorMessage = isError ? extractApiError(error) : null;

  const period = data?.data?.period ?? null;
  const periodLabel = period?.start_date && period?.end_date
    ? `${formatDate(period.start_date)} - ${formatDate(period.end_date)}`
    : 'All-time';

  const clients = Array.isArray(data?.data?.clients) ? data.data.clients : [];
  const topClients = Array.isArray(data?.data?.top_clients?.data) ? data.data.top_clients.data : [];
  const topClientsPagination = data?.data?.top_clients?.pagination ?? null;
  const categoryMatrix = Array.isArray(data?.data?.category_matrix) ? data.data.category_matrix : [];

  const hasOrigTop = useMemo(() => topClients.some((c) => c.original_total_hours != null), [topClients]);
  const hasOrigAll = useMemo(() => clients.some((c) => c.original_total_hours != null), [clients]);

  const visibleTopClientsColumns = useMemo(() => [
    columnHelper.accessor('rank', {
      header: 'Rank',
      size: 90,
      cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue()}</span>,
    }),
    columnHelper.accessor('client_name', {
      header: 'Client',
      size: 260,
      cell: (info) => <div className="truncate font-medium max-w-[240px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    columnHelper.accessor('total_hours', {
      header: 'Total Hours',
      size: 150,
      cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
    }),
    ...(hasOrigTop ? [
      columnHelper.accessor('original_total_hours', {
        header: 'Original Total Hours',
        size: 150,
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue() != null ? formatHours(info.getValue()) : '—'}</span>,
      }),
    ] : []),
    columnHelper.accessor('total_cost', {
      header: 'Total Cost',
      size: 160,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    }),
  ], [hasOrigTop]);

  const visibleAllClientsColumns = useMemo(() => [
    columnHelper.accessor('client_name', {
      header: 'Client',
      size: 280,
      cell: (info) => <div className="truncate font-medium max-w-[260px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    columnHelper.accessor('total_hours', {
      header: 'Total Hours',
      size: 150,
      cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
    }),
    ...(hasOrigAll ? [
      columnHelper.accessor('original_total_hours', {
        header: 'Original Total Hours',
        size: 150,
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue() != null ? formatHours(info.getValue()) : '—'}</span>,
      }),
    ] : []),
    columnHelper.accessor('total_cost', {
      header: 'Total Cost',
      size: 160,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    }),
  ], [hasOrigAll]);

  // Category names aren't a fixed set — derive the union of keys seen across every row's
  // `categories` object at runtime, rather than hardcoding Billable/Non-Billable/etc.
  const categoryNames = useMemo(() => {
    const names = new Set();
    categoryMatrix.forEach((row) => {
      Object.keys(row.categories ?? {}).forEach((name) => names.add(name));
    });
    return Array.from(names);
  }, [categoryMatrix]);

  const categoryColumns = useMemo(() => [
    columnHelper.accessor('client_name', {
      header: 'Client',
      size: 240,
      cell: (info) => <div className="truncate font-medium max-w-[220px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    ...categoryNames.map((name) =>
      columnHelper.accessor((row) => row.categories?.[name], {
        id: `category:${name}`,
        header: name,
        size: 160,
        cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
      })
    ),
    columnHelper.accessor('total_cost', {
      header: 'Total Cost',
      size: 160,
      cell: (info) => <span className="tabular-nums font-semibold">{formatCurrency(info.getValue())}</span>,
    }),
  ], [categoryNames]);

  const handleHoursSourceChange = (value) => {
    setHoursSource(value);
    setPage(1);
  };

  const handleLimitChange = (size) => {
    setLimit(size);
    setPage(1);
  };

  const handleBuChange = (value) => {
    setBuIds(value);
    setClientIds([]);
    setPage(1);
  };

  // Picking a different Entity can strand a BU that no longer belongs to it — reset the BU
  // state the same way changing BU itself resets the page.
  const handleEntityChange = (value) => {
    setEntityIds(value);
    setBuIds([]);
    setClientIds([]);
    setPage(1);
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const activeFilterCount = (entityIds.length > 0 ? 1 : 0)
    + (buIds.length > 0 ? 1 : 0)
    + (clientIds.length > 0 ? 1 : 0)
    + (periodMode === 'month' ? (monthYear ? 1 : 0) : (dateRange ? 1 : 0));

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setClientIds([]);
    setMonthYear(null);
    setDateRange(null);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Client Cost Analytics"
        description={`Showing: ${periodLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewOriginal && (
              <SegmentedToggle
                options={[
                  { value: 'O', label: 'Original' },
                  { value: 'M', label: 'Published' },
                ]}
                value={hoursSource}
                onChange={handleHoursSourceChange}
              />
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {(clients.length > 0 || topClients.length > 0 || categoryMatrix.length > 0) && (
              <Button
                variant="outline"
                size="toolbar"
                onClick={() => exportToExcel({ topClients, clients, categoryMatrix, categoryNames })}
              >
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Period</Label>
          <Tabs value={periodMode} onValueChange={handlePeriodModeChange}>
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white">Month</TabsTrigger>
              <TabsTrigger value="range" className="text-xs font-semibold data-[state=active]:bg-white">Date Range</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{periodMode === 'month' ? 'Month & Year' : 'Date Range'}</Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="All-time"
              clearable
              className="w-full"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); setPage(1); }}
              placeholder="All-time"
              className="w-full"
            />
          )}
        </div>

        <EntityFilter multiple value={entityIds} onChange={handleEntityChange} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={handleBuChange} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <MultiSelect
            options={activeClients.map((c) => ({ label: c.client_name, value: String(c.id) }))}
            value={clientIds}
            onValueChange={(v) => { setClientIds(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
      </FilterPanel>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="top">Top Clients</TabsTrigger>
          <TabsTrigger value="all">All Clients</TabsTrigger>
          <TabsTrigger value="category">Category Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="top">
          <DataTable
            mobileCards
            tableContainerClassName="max-h-[min(475px,55vh)]"
            columns={visibleTopClientsColumns}
            data={topClients}
            isLoading={isPending}
            pagination={topClientsPagination ? {
              page: topClientsPagination.page ?? page,
              limit: topClientsPagination.limit ?? limit,
              total: topClientsPagination.total_records ?? 0,
            } : undefined}
            onPageChange={setPage}
            onPageSizeChange={handleLimitChange}
            emptyState={<EmptyState title="No client data" description="No ranked clients found." />}
          />
        </TabsContent>

        <TabsContent value="all">
          <DataTable
            mobileCards
            tableContainerClassName="max-h-[min(475px,55vh)]"
            columns={visibleAllClientsColumns}
            data={clients}
            isLoading={isPending}
            emptyState={<EmptyState title="No client data" description="No clients found." />}
          />
        </TabsContent>

        <TabsContent value="category">
          <DataTable
            mobileCards
            tableContainerClassName="max-h-[min(475px,55vh)]"
            columns={categoryColumns}
            data={categoryMatrix}
            isLoading={isPending}
            emptyState={<EmptyState title="No category data" description="No category breakdown found." />}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientCostAnalytics;
