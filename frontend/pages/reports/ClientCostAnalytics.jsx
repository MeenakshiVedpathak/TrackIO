import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertCircle, Download } from 'lucide-react';
import { useClientCostAnalytics } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { extractApiError } from '@/services/apiClient';
import { formatCurrency, formatHours } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SegmentedToggle from '@/components/common/SegmentedToggle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const columnHelper = createColumnHelper();

// All-time, unpaginated dataset (`data.clients`) is exported — it's the only one of the three
// tabs' datasets with no pagination gap, so it's the complete picture regardless of the Top
// Clients tab's current page/limit.
const exportToExcel = (clients) => {
  const header = ['Client', 'Total Hours', 'Total Cost'];
  const dataRows = clients.map((c) => [
    c.client_name ?? '',
    c.total_hours != null ? Number(c.total_hours) : '',
    c.total_cost != null ? Number(c.total_cost) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Client Cost Analytics');
  XLSX.writeFile(wb, 'Client_Cost_Analytics.xlsx');
};

const topClientsColumns = [
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
  columnHelper.accessor('total_cost', {
    header: 'Total Cost',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
];

const allClientsColumns = [
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
  columnHelper.accessor('total_cost', {
    header: 'Total Cost',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
];

const ClientCostAnalytics = () => {
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');
  const [activeTab, setActiveTab] = useState('top');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  // This report has no other filter, so the Filters panel exists purely to host the BU picker
  // — every other Reports page already carries one, and the BU choice belongs in the same place.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);

  // Role no longer grants Original-data visibility (e.g. role reassigned mid-session) — force
  // back to Modified, same as every other report.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  // No period/date filter at all — this report is always all-time.
  const params = { hoursSource, page, limit, buId, ...(entityId !== ALL_ENTITIES && { entityId }) };

  const { data, isPending, isError, error } = useClientCostAnalytics(params);
  const errorMessage = isError ? extractApiError(error) : null;

  const clients = Array.isArray(data?.data?.clients) ? data.data.clients : [];
  const topClients = Array.isArray(data?.data?.top_clients?.data) ? data.data.top_clients.data : [];
  const topClientsPagination = data?.data?.top_clients?.pagination ?? null;
  const categoryMatrix = Array.isArray(data?.data?.category_matrix) ? data.data.category_matrix : [];

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
    setBuId(value);
    setPage(1);
  };

  // Picking a different Entity can strand a BU that no longer belongs to it — reset the BU
  // state the same way changing BU itself resets the page.
  const handleEntityChange = (value) => {
    setEntityId(value);
    setBuId(ALL_BUS);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Client Cost Analytics"
        description="Cost and hours breakdown per client — an all-time view with no date range filter."
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
              activeCount={(entityId !== ALL_ENTITIES ? 1 : 0) + (buId !== ALL_BUS ? 1 : 0)}
              className="h-9"
            />
            {clients.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={() => exportToExcel(clients)}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[160px]"
        onClear={() => { setEntityId(ALL_ENTITIES); handleBuChange(ALL_BUS); }}
        showClear={entityId !== ALL_ENTITIES || buId !== ALL_BUS}
      >
        <EntityFilter value={entityId} onChange={handleEntityChange} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={handleBuChange} />
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
            tableContainerClassName="max-h-[55vh]"
            columns={topClientsColumns}
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
            tableContainerClassName="max-h-[55vh]"
            columns={allClientsColumns}
            data={clients}
            isLoading={isPending}
            emptyState={<EmptyState title="No client data" description="No clients found." />}
          />
        </TabsContent>

        <TabsContent value="category">
          <DataTable
            mobileCards
            tableContainerClassName="max-h-[55vh]"
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
