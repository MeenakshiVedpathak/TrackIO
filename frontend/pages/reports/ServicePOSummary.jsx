import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useServicePOSummary, useServicePOSummaryTotals } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate, formatHours } from '@/utils/formatters';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import useAuth from '@/hooks/useAuth';


const columnHelper = createColumnHelper();

const exportToExcel = (rows) => {
  const header = [
    'PO Code', 'PO Name', 'Client Name', 'Service Type', 'Category', 'Start Date', 'End Date',
    'Status', 'Billable', 'Invoice Freq.', 'Account Manager', 'PO Value', 
    // 'Expected Hours',
    'Hours Delivered Before Month',
    'Billable Amount', 'Invoiced Amount', 'Billed Amount', 'Unbilled Amount'
  ];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client_name ?? '',
    r.service_type ?? '',
    r.service_category_name ?? '',
    r.start_date ? formatDate(r.start_date) : '',
    r.end_date ? formatDate(r.end_date) : '',
    r.status ?? '',
    r.is_billable ? 'Yes' : 'No',
    r.invoice_frequency ?? '',
    r.account_manager ?? '',
    r.po_value != null ? Number(r.po_value) : '',
    // r.expected_man_hours != null ? Number(r.expected_man_hours) : '',
    r.hours_delivered_before_month != null ? Number(r.hours_delivered_before_month) : '',
    r.monthly_billable_amount != null ? Number(r.monthly_billable_amount) : '',
    r.invoiced_amount != null ? Number(r.invoiced_amount) : '',
    r.billed_amount != null ? Number(r.billed_amount) : '',
    r.unbilled_amount != null ? Number(r.unbilled_amount) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service PO Summary');
  XLSX.writeFile(wb, `Service_PO_Summary.xlsx`);
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const ValueCell = ({ value, format = 'currency' }) => {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  
  if (format === 'hours') {
      return <span className="tabular-nums">{formatHours(value)}</span>;
  }
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
  columnHelper.accessor('po_value', {
    header: 'PO Value',
    size: 160,
    cell: (info) => <ValueCell value={info.getValue()} />,
  }),
  // columnHelper.accessor('expected_man_hours', {
  //   header: 'Exp. Hours',
  //   size: 140,
  //   cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  // }),
  columnHelper.accessor('hours_delivered_before_month', {
    header: 'Delivered Before Month',
    size: 180,
    cell: (info) => <ValueCell value={info.getValue()} format="hours" />,
  }),
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

const ServicePOSummary = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [clientId, setClientId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [poId, setPoId] = useState('all');

  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState('all');
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  // Role no longer grants Original-data visibility (e.g. role reassigned mid-session) — force back to Modified.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);
  const [dateRange, setDateRange] = useState(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const { data: activeClients = [] } = useActiveClients();
  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = categoryId === 'all'
    ? activeServiceTypes
    : activeServiceTypes.filter((t) => String(t.service_category_id) === categoryId);

  // Type (or Category, if no type chosen yet) → Service PO
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    activeServiceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [activeServiceTypes]);

  const filteredPOs = activePOs.filter((po) => {
    const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
    if (serviceTypeId !== 'all') return poTypeId === serviceTypeId;
    if (categoryId !== 'all') return poTypeId != null && typeCategoryMap.get(poTypeId) === categoryId;
    return true;
  });

  const handleCategoryChange = (v) => {
    setCategoryId(v);
    setServiceTypeId('all');
    setPoId('all');
    setPage(1);
  };

  const handleTypeChange = (v) => {
    setServiceTypeId(v);
    setPoId('all');
    setPage(1);
  };
  const { roleObjects } = useAuth();

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    hoursSource,
    ...(clientId && clientId !== 'all' && { clientId }),
    ...(serviceTypeId && serviceTypeId !== 'all' && { serviceTypeId }),
    ...(poId && poId !== 'all' && { poId }),

    ...(categoryId !== 'all' && { serviceCategoryId: categoryId }),
    ...(status && status !== 'all' && { status }),
    ...(dateRange?.startDate && { startDate: dateRange.startDate }),
    ...(dateRange?.endDate && { endDate: dateRange.endDate }),
    page,
    limit,
     roleId: roleObjects[0]?.id,
    ...(debouncedSearch && { search: debouncedSearch }),
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useServicePOSummary(params);
  // The backend's own `summary` only aggregates the current page (backend bug) — this
  // recomputes the true all-pages total client-side. See useServicePOSummaryTotals for detail.
  const { data: totalsSummary } = useServicePOSummaryTotals(params);

  const records = Array.isArray(data?.data?.records) ? data.data.records : Array.isArray(data?.data) ? data.data : [];
  const summary = totalsSummary ?? data?.data?.summary ?? null;
  const meta    = data?.meta ?? {};

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    dateRange !== null,
    clientId !== 'all',
    categoryId !== 'all',
    serviceTypeId !== 'all',
    poId !== 'all',
    status !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setDateRange(null);
    setClientId('all');
    setCategoryId('all');
    setServiceTypeId('all');
    setPoId('all');
    setStatus('all');
    setPage(1);
  };

  // Export pulls every matching record (not just the current page) with one extra request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getServicePOSummary({ ...params, page: 1, limit: total });
      const allRecords = Array.isArray(res?.data?.records) ? res.data.records : Array.isArray(res?.data) ? res.data : [];
      exportToExcel(allRecords);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Service PO Summary"
        description="Service PO Summary with Hours & Billing"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search PO Name, Client…"
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

      {/* Collapsible filter panel */}
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[560px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
          <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

          <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

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
            <SearchableSelect
              options={[
                { label: "All Clients", value: "all" },
                ...activeClients.map((c) => ({
                  label: c.client_name,
                  value: String(c.id)
                }))
              ]}
              value={clientId}
              onValueChange={(v) => { setClientId(v); setPage(1); }}
              placeholder="All Clients"
              searchPlaceholder="Search client..."
              className="h-9 w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Category</Label>
            <SearchableSelect
              showSearch={false}
              options={[
                { label: 'All Categories', value: 'all' },
                ...activeServiceCategories.map((c) => ({ label: c.name, value: String(c.id) })),
              ]}
              value={categoryId}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              className="h-9 w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Type</Label>
            <SearchableSelect
              options={[
                { label: 'All Service Types', value: 'all' },
                ...filteredServiceTypes.map((st) => ({
                  label: st.service_type_name,
                  value: String(st.id),
                })),
              ]}
              value={serviceTypeId}
              onValueChange={handleTypeChange}
              placeholder="All Service Types"
              searchPlaceholder="Search service type..."
              className="h-9 w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service PO</Label>
            <SearchableSelect
              options={[
                { label: "All POs", value: "all" },
                ...filteredPOs.map((po) => ({
                  label: po.service_po_name || po.service_po_code || String(po.id),
                  value: String(po.id)
                }))
              ]}
              value={poId}
              onValueChange={(v) => { setPoId(v); setPage(1); }}
              placeholder="All POs"
              searchPlaceholder="Search PO..."
              className="h-9 w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Status</Label>
            <SearchableSelect showSearch={false}
              options={[
                { label: "All", value: "all" },
                { label: "In Progress", value: "in-progress" },
                { label: "Pending", value: "pending" },
                { label: "On Hold", value: "on-hold" },
                { label: "Completed", value: "completed" },
                { label: "Cancelled", value: "cancelled" },
                { label: "Closed", value: "closed" },
              ]}
              value={status}
              onValueChange={(v) => { setStatus(v); setPage(1); }}
              placeholder="All"
              className="h-9 w-full text-sm"
            />
          </div>
      </FilterPanel>

      <DataTable
        columns={columns}
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
            <SummaryItem label="PO Value" value={formatCurrency(summary.total_po_value)} />
            {/* <SummaryItem label="Exp. Hours" value={formatHours(summary.total_expected_man_hours)} /> */}
            <SummaryItem label="Delivered Before Month" value={formatHours(summary.total_hours_delivered_before_month)} />
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

export default ServicePOSummary;
