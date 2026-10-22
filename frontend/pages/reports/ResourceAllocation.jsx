import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useResourceAllocationReport, useResourceAllocationAllRows } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { useDebounce } from '@/hooks/useDebounce';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { formatHours } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';

const columnHelper = createColumnHelper();


const exportToExcel = (rows) => {
  const header = ['Code', 'Employee', 'Designation', 'Client', 'Service PO', 'PO Code', 'Service Type', 'PO Status', 'Category', 'Hours Logged'];
  const dataRows = rows.map((r) => [
    r.employee_code ?? '',
    r.full_name ?? '',
    r.designation ?? '',
    r.client_name ?? '',
    r.service_po_name ?? '',
    r.service_po_code ?? '',
    r.service_type_name ?? '',
    r.po_status ?? '',
    r.service_category_name ?? '',
    r.total_hours_logged != null ? Number(r.total_hours_logged) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resource Allocation');
  XLSX.writeFile(wb, 'Resource_Allocation.xlsx');
};

const SERVICE_TYPE_COLORS = {
  staffaugmentation:    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  'staff augmentation': 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  project:              'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  support:              'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  servicepack:          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'service pack':       'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'managed services':   'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
};

const serviceTypeBadgeClass = (type) =>
  SERVICE_TYPE_COLORS[type?.toLowerCase()] ?? 'bg-muted text-muted-foreground';

const CATEGORY_COLORS = {
  billable: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'non-billable': 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
};

const categoryBadgeClass = (category) =>
  CATEGORY_COLORS[category?.toLowerCase()] ?? 'bg-muted text-muted-foreground';

const columns = [
  columnHelper.accessor('employee_code', {
    header: 'Code',
    meta: { sticky: true, left: 0 },
    size: 120,
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('full_name', {
    header: 'Employee',
    meta: { sticky: true, left: 120 },
    size: 220,
    cell: (info) => (
      <div>
        <p className="font-medium text-xs">{info.getValue() || '—'}</p>
        {info.row.original.designation && (
          <p className="text-[10px] text-muted-foreground">{info.row.original.designation}</p>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('client_name', {
    header: 'Client',
    size: 200,
    cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
  }),
  columnHelper.accessor('service_po_name', {
    header: 'Service PO',
    size: 220,
    cell: (info) => (
      <div>
        <p className="text-xs">{info.getValue() || '—'}</p>
        {info.row.original.service_po_code && (
          <p className="text-[10px] font-mono text-muted-foreground">
            {info.row.original.service_po_code}
          </p>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('service_type_name', {
    header: 'Service Type',
    size: 160,
    cell: (info) => {
      const val = info.getValue();
      return val ? (
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
          serviceTypeBadgeClass(val)
        )}>
          {val}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
  }),
  columnHelper.accessor('po_status', {
    header: 'PO Status',
    size: 150,
    cell: (info) => {
      const v = info.getValue();
      const PO_STATUS_COLORS = {
        'in-progress': 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
        completed:     'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        'on-hold':     'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        pending:       'bg-violet-500/10 text-violet-700 dark:text-violet-400',
        cancelled:     'bg-red-500/10 text-red-700 dark:text-red-400',
        closed:        'bg-muted text-muted-foreground',
      };
      const PO_STATUS_LABELS = {
        'in-progress': 'In Progress',
        completed:     'Completed',
        'on-hold':     'On Hold',
        pending:       'Pending',
        cancelled:     'Cancelled',
        closed:        'Closed',
      };
      return v ? (
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
          PO_STATUS_COLORS[v] ?? 'bg-muted text-muted-foreground'
        )}>
          {PO_STATUS_LABELS[v] ?? v}
        </span>
      ) : <span className="text-muted-foreground text-xs">—</span>;
    },
  }),
  columnHelper.accessor('service_category_name', {
    header: 'Category',
    size: 130,
    cell: (info) => {
      const val = info.getValue();
      return val ? (
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
          categoryBadgeClass(val)
        )}>
          {val}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
  }),
  columnHelper.accessor('total_hours_logged', {
    header: 'Hours Logged',
    size: 140,
    cell: (info) => (
      <span className="tabular-nums font-medium">{formatHours(info.getValue())}</span>
    ),
  }),
];

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const ResourceAllocation = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [employeeId, setEmployeeId] = useState('all');
  const [poId, setPoId] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [poStatus, setPoStatus] = useState('all');
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

  const debouncedSearch = useDebounce(search, 400);
  const { data: activeEmployees = [] } = useActiveEmployees();
  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: activeClients = [] } = useActiveClients();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();

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
    page,
    limit,
    hoursSource,
     roleId: roleObjects[0]?.id,
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    ...(employeeId !== 'all' && { employeeId }),
    ...(poId !== 'all' && { poId }),
    ...(clientId !== 'all' && { clientId }),
    ...(poStatus !== 'all' && { status: poStatus }),
    ...(categoryId !== 'all' && { serviceCategoryId: categoryId }),
    ...(serviceTypeId !== 'all' && { serviceTypeId }),
    ...(debouncedSearch && { search: debouncedSearch }),
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useResourceAllocationReport(params);

  const rows = Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};

  // Summary chips must reflect every matching record (respecting whatever filters are
  // active), not just the current page — page through the full filtered dataset
  // (backend caps `limit` at 100, so a single large-limit request silently truncates).
  const { data: fullRows } = useResourceAllocationAllRows(params);
  const summaryRows = fullRows ?? rows;

  // This report is a flat allocation list (one row per employee × PO × service
  // type), not a per-employee pivot, so billable/non-billable/leave totals are
  // derived here the same way the Monthly Utilization report's backend does:
  // billable = category name contains "billable" but not "non"; everything
  // else (including "Customer Non-Billable") counts as non-billable, and
  // Customer Non-Billable is additionally broken out on its own; leave hours
  // are identified by service type name and subtracted from utilization.
  const reportSummary = summaryRows.reduce((acc, r) => {
    const hours = Number(r.total_hours_logged) || 0;
    const catLower = (r.service_category_name || '').toLowerCase();
    const typeLower = (r.service_type_name || '').toLowerCase();

    const isBillable = catLower.includes('billable') && !catLower.includes('non');
    const isCustomerNonBillable = catLower.includes('customer') && catLower.includes('non') && catLower.includes('billable');
    const isLeave = typeLower.includes('leave') || typeLower.includes('vacation') || typeLower.includes('holiday');

    if (isBillable) acc.billable_total += hours;
    else acc.non_billable_total += hours;

    if (isCustomerNonBillable) acc.customer_non_billable_total += hours;
    if (isLeave) acc.leaves_hours += hours;

    return acc;
  }, { billable_total: 0, non_billable_total: 0, customer_non_billable_total: 0, leaves_hours: 0 });

  const totalUtilization = reportSummary.billable_total + reportSummary.non_billable_total - reportSummary.leaves_hours;

  // Export pulls every matching record (not just the current page); reuses the
  // already-fetched full dataset above when available instead of firing a new request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const all = fullRows ?? await reportsApi.fetchAllResourceAllocationRows(params);
      exportToExcel(all);
    } finally {
      setExporting(false);
    }
  };

  const activeFilterCount = [
    entityId !== ALL_ENTITIES ? 1 : 0,
    buId !== ALL_BUS ? 1 : 0,
    employeeId !== 'all' ? 1 : 0,
    poId !== 'all' ? 1 : 0,
    clientId !== 'all' ? 1 : 0,
    categoryId !== 'all' ? 1 : 0,
    serviceTypeId !== 'all' ? 1 : 0,
    poStatus !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setEmployeeId('all');
    setPoId('all');
    setClientId('all');
    setCategoryId('all');
    setServiceTypeId('all');
    setPoStatus('all');
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Allocation"
        description=""
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Employee, PO…"
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
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
              className="h-9"
            />
            {rows.length > 0 && (
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
            <Label className="text-xs">Month &amp; Year</Label>
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="All months"
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
              className="h-9 text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
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
            <Label className="text-xs">Service Category</Label>
            <SearchableSelect
              options={[
                { label: "All Categories", value: "all" },
                ...activeServiceCategories.map((sc) => ({
                  label: sc.name,
                  value: String(sc.id)
                }))
              ]}
              value={categoryId}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-9 text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Type</Label>
            <SearchableSelect
              options={[
                { label: "All Service Types", value: "all" },
                ...filteredServiceTypes.map((st) => ({
                  label: st.service_type_name,
                  value: String(st.id)
                }))
              ]}
              value={serviceTypeId}
              onValueChange={handleTypeChange}
              placeholder="All Service Types"
              searchPlaceholder="Search type..."
              className="h-9 text-sm w-full"
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
              className="h-9 text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">PO Status</Label>
            <SearchableSelect showSearch={false}
              options={[
                { label: "All statuses", value: "all" },
                { label: "In Progress", value: "in-progress" },
                { label: "Completed", value: "completed" },
                { label: "On Hold", value: "on-hold" },
                { label: "Pending", value: "pending" },
                { label: "Cancelled", value: "cancelled" },
                { label: "Closed", value: "closed" },
              ]}
              value={poStatus}
              onValueChange={(v) => { setPoStatus(v); setPage(1); }}
              placeholder="All statuses"
              className="h-9 text-sm w-full"
            />
          </div>
      </FilterPanel>

      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="rounded-md border bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            Billable Total&nbsp;
            <span className="font-semibold tabular-nums">{reportSummary.billable_total.toFixed(1)} hrs</span>
          </div>
          <div className="rounded-md border bg-orange-500/10 px-3 py-1.5 text-xs text-orange-700 dark:text-orange-400">
            Non-Billable Total&nbsp;
            <span className="font-semibold tabular-nums">{reportSummary.non_billable_total.toFixed(1)} hrs</span>
          </div>
          <div className="rounded-md border bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-400">
            Customer Non-Billable&nbsp;
            <span className="font-semibold tabular-nums">{reportSummary.customer_non_billable_total.toFixed(1)} hrs</span>
          </div>
          <div className="rounded-md border bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-400">
            Total Utilization&nbsp;
            <span className="font-semibold tabular-nums">{totalUtilization.toFixed(1)} hrs</span>
          </div>
          <div className="rounded-md border bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            Leaves&nbsp;
            <span className="font-semibold tabular-nums">{reportSummary.leaves_hours.toFixed(1)} hrs</span>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
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
    </div>
  );
};

export default ResourceAllocation;
