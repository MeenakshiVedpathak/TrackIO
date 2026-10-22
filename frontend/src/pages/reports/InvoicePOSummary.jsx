import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useInvoicePOSummary, useInvoicePOSummaryTotals } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate, formatHours, capitalize } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';

const columnHelper = createColumnHelper();

const exportToExcel = (rows) => {
  const hasOriginalBefore = rows.some((r) => r.original_hours_delivered_before_month != null);
  const hasOriginalCurrent = rows.some((r) => r.original_hours_delivered_current_month != null);
  const header = [
    'PO Code', 'PO Name', 'Client Name', 'Service Type', 'Category', 'Status', 'Billable',
    'Invoice Freq.', 'Start Date', 'End Date', 'Account Manager', 'PO Value',
    'Expected Hours',
    'Hours Delivered Before Month',
    ...(hasOriginalBefore ? ['Original Hours Delivered Before Month'] : []),
    'Hours Delivered This Month',
    ...(hasOriginalCurrent ? ['Original Hours Delivered This Month'] : []),
    /* 'Available Hours', */
    'Billable Amount', 'Invoiced Amount', 'Billed Amount', 'Unbilled Amount',
  ];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client_name ?? '',
    r.service_type ?? '',
    r.service_category_name ?? '',
    r.status ?? '',
    r.is_billable ? 'Yes' : 'No',
    r.invoice_frequency ?? '',
    r.start_date ? formatDate(r.start_date) : '',
    r.end_date ? formatDate(r.end_date) : '',
    r.account_manager ?? '',
    r.po_value != null ? Number(r.po_value) : '',
    r.exp_hours != null ? Number(r.exp_hours) : '',
    r.hours_delivered_before_month != null ? Number(r.hours_delivered_before_month) : '',
    ...(hasOriginalBefore ? [r.original_hours_delivered_before_month != null ? Number(r.original_hours_delivered_before_month) : ''] : []),
    r.hours_delivered_current_month != null ? Number(r.hours_delivered_current_month) : '',
    ...(hasOriginalCurrent ? [r.original_hours_delivered_current_month != null ? Number(r.original_hours_delivered_current_month) : ''] : []),
    // r.available_hours != null ? Number(r.available_hours) : '',
    r.monthly_billable_amount != null ? Number(r.monthly_billable_amount) : '',
    r.invoiced_amount != null ? Number(r.invoiced_amount) : '',
    r.billed_amount != null ? Number(r.billed_amount) : '',
    r.unbilled_amount != null ? Number(r.unbilled_amount) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice PO Summary');
  XLSX.writeFile(wb, 'Invoice_PO_Summary.xlsx');
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// null/'' -> em-dash (is_billable=false rows null out every amount/hours field per the backend
// contract); otherwise a tabular-nums span so columns of numbers stay vertically aligned.
const ValueCell = ({ value, format = 'currency' }) => {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  if (format === 'hours') return <span className="tabular-nums">{formatHours(value)}</span>;
  return <span className="tabular-nums">{formatCurrency(value)}</span>;
};

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
    size: 190,
    cell: (info) => <div className="truncate whitespace-nowrap max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('service_category_name', {
    header: 'Category',
    size: 180,
    cell: (info) => <div className="truncate whitespace-nowrap max-w-[170px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 160,
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('is_billable', {
    header: 'Billable',
    size: 140,
    cell: (info) => (
      <Badge variant={info.getValue() ? 'success' : 'muted'} className="whitespace-nowrap">{info.getValue() ? 'Billable' : 'Non-Billable'}</Badge>
    ),
  }),
  columnHelper.accessor('invoice_frequency', {
    header: 'Invoice Freq.',
    size: 170,
    cell: (info) => <div className="truncate whitespace-nowrap max-w-[160px]" title={info.getValue() ? capitalize(info.getValue()) : ''}>{info.getValue() ? capitalize(info.getValue()) : '—'}</div>,
  }),
  columnHelper.accessor('start_date', {
    header: 'Start Date',
    size: 120,
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor('end_date', {
    header: 'End Date',
    size: 120,
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor('exp_hours', {
    header: 'Exp. Hours',
    size: 140,
    cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  }),
  columnHelper.accessor('hours_delivered_before_month', {
    header: 'Delivered Before Month',
    size: 180,
    cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  }),
  columnHelper.accessor('original_hours_delivered_before_month', {
    header: 'Original Delivered Before Month',
    size: 220,
    cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  }),
  columnHelper.accessor('hours_delivered_current_month', {
    header: 'Delivered This Month',
    size: 170,
    cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  }),
  columnHelper.accessor('original_hours_delivered_current_month', {
    header: 'Original Delivered This Month',
    size: 210,
    cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  }),
  // columnHelper.accessor('available_hours', {
  //   header: 'Available Hours',
  //   size: 150,
  //   cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  // }),
  columnHelper.accessor('monthly_billable_amount', {
    header: 'Billable Amount',
    size: 160,
    cell: (info) => <ValueCell value={info.getValue()} />,
  }),
  columnHelper.accessor('invoiced_amount', {
    header: 'Invoiced Amount',
    size: 160,
    cell: (info) => <ValueCell value={info.getValue()} />,
  }),
  columnHelper.accessor('billed_amount', {
    header: 'Billed Amount',
    size: 160,
    cell: (info) => <ValueCell value={info.getValue()} />,
  }),
  columnHelper.accessor('unbilled_amount', {
    header: 'Unbilled Amount',
    size: 160,
    cell: (info) => <ValueCell value={info.getValue()} />,
  }),
];

const SummaryItem = ({ label, value, highlight = false, negative = false }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${negative ? 'text-destructive' : highlight ? 'text-foreground' : 'text-foreground'}`}>
      {value}
    </span>
  </div>
);

const InvoicePOSummary = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [clientId, setClientId] = useState([]);
  const [serviceTypeId, setServiceTypeId] = useState([]);
  const [poId, setPoId] = useState([]);
  const [categoryId, setCategoryId] = useState([]);
  const [status, setStatus] = useState([]);
  const [billable, setBillable] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = categoryId.length === 0
    ? activeServiceTypes
    : activeServiceTypes.filter((t) => categoryId.includes(String(t.service_category_id)));

  // Type (or Category, if no type chosen yet) → Service PO
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    activeServiceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [activeServiceTypes]);

  const filteredPOs = activePOs.filter((po) => {
    const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
    if (serviceTypeId.length > 0) return poTypeId != null && serviceTypeId.includes(poTypeId);
    if (categoryId.length > 0) return poTypeId != null && categoryId.includes(typeCategoryMap.get(poTypeId));
    return true;
  });

  const handleCategoryChange = (v) => {
    setCategoryId(v);
    setServiceTypeId([]);
    setPoId([]);
    setPage(1);
  };

  const handleTypeChange = (v) => {
    setServiceTypeId(v);
    setPoId([]);
    setPage(1);
  };

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    ...(clientId.length > 0 && { clientId: clientId.join(',') }),
    ...(serviceTypeId.length > 0 && { serviceTypeId: serviceTypeId.join(',') }),
    ...(poId.length > 0 && { poId: poId.join(',') }),
    ...(categoryId.length > 0 && { serviceCategoryId: categoryId.join(',') }),
    ...(status.length > 0 && { status: status.join(',') }),
    // Both Billable and Non-Billable selected means no restriction.
    ...(billable.length === 1 && { is_billable: billable[0] }),
    ...(dateRange?.startDate && { startDate: dateRange.startDate }),
    ...(dateRange?.endDate && { endDate: dateRange.endDate }),
    page,
    limit,
    ...(debouncedSearch && { search: debouncedSearch }),
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useInvoicePOSummary(params);
  // The backend's own `summary` only aggregates the current page — recomputes the true
  // all-pages total client-side. See useInvoicePOSummaryTotals for detail.
  const { data: totalsSummary } = useInvoicePOSummaryTotals(params);

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const summary = totalsSummary ?? data?.data?.summary ?? null;
  const meta = data?.meta ?? {};

  const hasOriginalBefore = records.some((r) => r.original_hours_delivered_before_month != null);
  const hasOriginalCurrent = records.some((r) => r.original_hours_delivered_current_month != null);

  const visibleColumns = useMemo(() => {
    if (hasOriginalBefore && hasOriginalCurrent) return columns;
    return columns.filter((col) => {
      const key = col.accessorKey || col.id;
      if (key === 'original_hours_delivered_before_month' && !hasOriginalBefore) return false;
      if (key === 'original_hours_delivered_current_month' && !hasOriginalCurrent) return false;
      return true;
    });
  }, [hasOriginalBefore, hasOriginalCurrent]);

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    dateRange !== null,
    clientId.length > 0,
    categoryId.length > 0,
    serviceTypeId.length > 0,
    poId.length > 0,
    status.length > 0,
    billable.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setDateRange(null);
    setClientId([]);
    setCategoryId([]);
    setServiceTypeId([]);
    setPoId([]);
    setStatus([]);
    setBillable([]);
    setPage(1);
  };

  // Export pulls every matching record (not just the current page) with one extra request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getInvoicePOSummary({ ...params, page: 1, limit: total });
      const allRecords = Array.isArray(res?.data?.records) ? res.data.records : [];
      exportToExcel(allRecords);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Invoice PO Summary"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search PO Name, Client…"
              className="w-full sm:w-full md:w-56"
            />
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

      {/* Collapsible filter panel */}
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[560px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setClientId([]); setPoId([]); setPage(1); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setClientId([]); setPoId([]); setPage(1); }} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            clearable={false}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">PO Start &amp; End Date</Label>
          <DateRangePicker
            value={dateRange}
            onChange={(val) => { setDateRange(val); setPage(1); }}
            placeholder="PO start → end date"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <MultiSelect
            options={activeClients.map((c) => ({ label: c.client_name, value: String(c.id) , 
            ...(c.original_total_hours != null ? {'Original Total Hours': c.original_total_hours} : {}),
            ...(c.original_billable_hours != null ? {'Original Billable Hours': c.original_billable_hours} : {}),
            ...(c.original_hours != null ? {'Original Hours': c.original_hours} : {})
          }))}
            value={clientId}
            onValueChange={(v) => { setClientId(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category</Label>
          <MultiSelect
            options={activeServiceCategories.map((c) => ({ label: c.name, value: String(c.id) , 
            ...(c.original_total_hours != null ? {'Original Total Hours': c.original_total_hours} : {}),
            ...(c.original_billable_hours != null ? {'Original Billable Hours': c.original_billable_hours} : {}),
            ...(c.original_hours != null ? {'Original Hours': c.original_hours} : {})
          }))}
            value={categoryId}
            onValueChange={handleCategoryChange}
            placeholder="All Categories"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service Type</Label>
          <MultiSelect
            options={filteredServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) , 
            ...(st.original_total_hours != null ? {'Original Total Hours': st.original_total_hours} : {}),
            ...(st.original_billable_hours != null ? {'Original Billable Hours': st.original_billable_hours} : {}),
            ...(st.original_hours != null ? {'Original Hours': st.original_hours} : {})
          }))}
            value={serviceTypeId}
            onValueChange={handleTypeChange}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service PO</Label>
          <MultiSelect
            options={filteredPOs.map((po) => ({ label: po.service_po_name || po.service_po_code || String(po.id), value: String(po.id) , 
            ...(po.original_total_hours != null ? {'Original Total Hours': po.original_total_hours} : {}),
            ...(po.original_billable_hours != null ? {'Original Billable Hours': po.original_billable_hours} : {}),
            ...(po.original_hours != null ? {'Original Hours': po.original_hours} : {})
          }))}
            value={poId}
            onValueChange={(v) => { setPoId(v); setPage(1); }}
            placeholder="All POs"
            searchPlaceholder="Search PO..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <MultiSelect
            options={[
              { label: 'In Progress', value: 'in-progress' },
              { label: 'Pending', value: 'pending' },
              { label: 'On Hold', value: 'on-hold' },
              { label: 'Completed', value: 'completed' },
              { label: 'Cancelled', value: 'cancelled' },
              { label: 'Closed', value: 'closed' },
            ]}
            value={status}
            onValueChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Billable</Label>
          <MultiSelect
            options={[
              { label: 'Billable', value: 'true' },
              { label: 'Non-Billable', value: 'false' },
            ]}
            value={billable}
            onValueChange={(v) => { setBillable(v); setPage(1); }}
            placeholder="All"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>
      </FilterPanel>

      <DataTable
        columns={visibleColumns}
        data={records}
        mobileCards
        isLoading={isPending}
        pagination={meta.total != null ? {
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total,
        } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Exp. Hours" value={formatHours(summary.total_exp_hours)} />
            <SummaryItem label="Delivered Before Month" value={formatHours(summary.total_hours_delivered_before_month)} />
            {hasOriginalBefore && (
              <SummaryItem
                label="Original Delivered Before Month"
                value={formatHours(summary.total_original_hours_delivered_before_month ?? summary.original_hours_delivered_before_month)}
              />
            )}
            <SummaryItem label="Delivered This Month" value={formatHours(summary.total_hours_delivered_current_month)} />
            {hasOriginalCurrent && (
              <SummaryItem
                label="Original Delivered This Month"
                value={formatHours(summary.total_original_hours_delivered_current_month ?? summary.original_hours_delivered_current_month)}
              />
            )}
            {/* <SummaryItem label="Available Hours" value={formatHours(summary.total_available_hours)} /> */}
            <SummaryItem label="Billable Amount" value={formatCurrency(summary.total_monthly_billable_amount)} highlight />
            <SummaryItem label="Invoiced Amount" value={formatCurrency(summary.total_invoiced_amount)} highlight />
            <SummaryItem label="Billed Amount" value={formatCurrency(summary.total_billed_amount)} highlight />
            <SummaryItem
              label="Unbilled Amount"
              value={formatCurrency(summary.total_unbilled_amount)}
              highlight
              negative={summary.total_unbilled_amount < 0}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePOSummary;
