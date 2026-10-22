import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useServicePOProfitability } from '@/hooks/useReports';
import { useActiveClients } from '@/hooks/useClients';
import { formatCurrency, formatHours, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const columnHelper = createColumnHelper();

// The Totals section must reflect every matching PO, not just the current server page, so
// the whole matching set is fetched once (capped well above any realistic monthly PO count) and
// paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const exportToExcel = (rows) => {
  const header = [
    'PO Code', 'PO Name', 'Client', 'Service Type', 'Category', 'Status',
    'Hours Delivered', 'Original Hrs Delivered', 'Invoiced Amount', 'Delivery Cost', 'Margin', 'Shortfall',
  ];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client_name ?? '',
    r.service_type ?? '',
    r.service_category_name ?? '',
    r.status ?? '',
    r.hours_delivered != null ? Number(r.hours_delivered) : '',
    r.original_hours_delivered != null ? Number(r.original_hours_delivered) : '',
    r.invoiced_amount != null ? Number(r.invoiced_amount) : '',
    r.delivery_cost != null ? Number(r.delivery_cost) : '',
    r.margin != null ? Number(r.margin) : '',
    r.margin_pct != null ? Number(r.margin_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service PO Profitability');
  XLSX.writeFile(wb, `Service_PO_Profitability.xlsx`);
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const columns = [
  columnHelper.accessor('service_po_code', {
    header: 'PO Code',
    size: 160,
    meta: { sticky: true, left: 0 },
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('service_po_name', {
    header: 'PO Name',
    size: 240,
    meta: { sticky: true, left: 160 },
    cell: (info) => <div className="truncate font-medium max-w-[220px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('client_name', {
    header: 'Client',
    size: 220,
    cell: (info) => <div className="truncate max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('service_type', {
    header: 'Service Type',
    size: 150,
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('service_category_name', {
    header: 'Category',
    size: 140,
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 160,
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('hours_delivered', {
    header: 'Hours Delivered',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('original_hours_delivered', {
    header: 'Original Hrs Delivered',
    size: 160,
    cell: (info) => {
      const value = info.getValue();
      return <span className="tabular-nums text-muted-foreground">{value != null ? formatHours(value) : '—'}</span>;
    },
  }),
  columnHelper.accessor('invoiced_amount', {
    header: 'Invoiced Amount',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('delivery_cost', {
    header: 'Delivery Cost',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('margin', {
    header: 'Margin',
    size: 160,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>
          {formatCurrency(value)}
        </span>
      );
    },
  }),
  columnHelper.accessor('margin_pct', {
    header: 'Shortfall',
    size: 130,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>
          {formatPercentage(value)}
        </span>
      );
    },
  }),
];

const SummaryItem = ({ label, value, negative = false }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${negative ? 'text-destructive' : 'text-foreground'}`}>
      {value}
    </span>
  </div>
);

const ServicePOProfitability = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [clientId, setClientId] = useState([]);
  const [search, setSearch] = useState('');
  const [serviceType, setServiceType] = useState([]);
  const [serviceCategory, setServiceCategory] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);


  const { data: activeClients = [] } = useActiveClients(scope);

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    ...(clientId.length > 0 && { clientId: clientId.join(',') }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useServicePOProfitability(params);

  const records = data?.data?.records ?? [];

  // Service Type / Category options come from the fetched rows themselves rather than the
  // service-type & category masters: the records only carry the display names (service_type,
  // service_category_name), so sourcing the options from the same field the filter compares
  // against makes matching exact, needs no extra requests, and never offers a value that
  // isn't in the current result set. Category narrows the Service Type list, since each row
  // carries both.
  const categoryOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.service_category_name).filter(Boolean))).sort(),
    [records]
  );

  const serviceTypeOptions = useMemo(
    () => Array.from(new Set(
      records
        .filter((r) => serviceCategory.length === 0 || serviceCategory.includes(r.service_category_name))
        .map((r) => r.service_type)
        .filter(Boolean)
    )).sort(),
    [records, serviceCategory]
  );

  // Search and these two filters are applied in memory — the whole matching set is already here
  // (see MAX_RECORDS_FETCH), so there is nothing to gain from a round-trip, and the Totals below
  // recompute off the same filtered set the table shows.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (serviceCategory.length > 0 && !serviceCategory.includes(r.service_category_name)) return false;
      if (serviceType.length > 0 && !serviceType.includes(r.service_type)) return false;
      if (!q) return true;
      return [r.service_po_code, r.service_po_name, r.client_name]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [records, search, serviceType, serviceCategory]);

  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

  // Recomputed client-side from the full matching set rather than trusted from the backend's own
  // `summary` — that object only reflects the current server page, and would understate totals
  // once there's more than one page of POs.
  const summary = filteredRecords.length > 0 ? (() => {
    const total_invoiced_amount = filteredRecords.reduce((sum, r) => sum + (Number(r.invoiced_amount) || 0), 0);
    const total_delivery_cost = filteredRecords.reduce((sum, r) => sum + (Number(r.delivery_cost) || 0), 0);
    const total_margin = filteredRecords.reduce((sum, r) => sum + (Number(r.margin) || 0), 0);
    const total_hours_delivered = filteredRecords.reduce((sum, r) => sum + (Number(r.hours_delivered) || 0), 0);
    const original_total_hours_delivered = filteredRecords.reduce((sum, r) => sum + (Number(r.original_hours_delivered) || 0), 0);
    return {
      total_invoiced_amount,
      total_delivery_cost,
      total_margin,
      total_hours_delivered,
      original_total_hours_delivered,
      // Derived ratio, not a per-row average — recomputed from the summed totals.
      overall_margin_pct: total_invoiced_amount !== 0 ? (total_margin / total_invoiced_amount) * 100 : null,
    };
  })() : null;

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    clientId.length > 0,
    serviceType.length > 0,
    serviceCategory.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setClientId([]);
    setServiceType([]);
    setServiceCategory([]);
    setPage(1);
  };

  // Picking a Category can strip the selected Service Type out of the option list, so the
  // narrower of the two always resets with it.
  const handleCategoryChange = (v) => {
    setServiceCategory(v);
    setServiceType([]);
    setPage(1);
  };

  // Already have the full matching set in memory — no need for a second network round-trip.
  // Exports what the filters and search actually leave on screen, not the unfiltered set.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Service PO Profitability"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search PO Code, PO Name, Client…"
              className="w-full sm:w-full md:w-64"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {filteredRecords.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Five filters on one row from lg up; twMerge lets this override FilterPanel's md:grid-cols-4. */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[380px]"
        gridClassName="md:grid-cols-3 lg:grid-cols-5"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setClientId([]); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setClientId([]); }} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <MultiSelect
            options={activeClients.map((c) => ({
                label: c.client_name,
                value: String(c.id),
              }))}
            value={clientId}
            onValueChange={(v) => { setClientId(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service Type</Label>
          <MultiSelect
            options={serviceTypeOptions.map((name) => ({ label: name, value: name }))}
            value={serviceType}
            onValueChange={(v) => { setServiceType(v); setPage(1); }}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category</Label>
          <MultiSelect
            options={categoryOptions.map((name) => ({ label: name, value: name }))}
            value={serviceCategory}
            onValueChange={handleCategoryChange}
            placeholder="All Categories"
            searchPlaceholder="Search category..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
      </FilterPanel>

      <DataTable
        columns={columns}
        data={pagedRecords}
        mobileCards
        isLoading={isPending}
        pagination={{ page, limit, total: filteredRecords.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Total Hours Delivered" value={formatHours(summary.total_hours_delivered)} />
            <SummaryItem label="Original Total Hrs Delivered" value={formatHours(summary.original_total_hours_delivered)} />
            <SummaryItem label="Total Invoiced" value={formatCurrency(summary.total_invoiced_amount)} />
            <SummaryItem label="Total Delivery Cost" value={formatCurrency(summary.total_delivery_cost)} />
            <SummaryItem
              label="Total Margin"
              value={formatCurrency(summary.total_margin)}
              negative={summary.total_margin < 0}
            />
            <SummaryItem
              label="Overall Shortfall"
              value={formatPercentage(summary.overall_margin_pct)}
              negative={summary.overall_margin_pct < 0}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePOProfitability;
