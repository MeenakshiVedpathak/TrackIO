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
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';

const columnHelper = createColumnHelper();


const exportToExcel = (rows) => {
  const hasOriginal = rows.some((r) => r.original_total_hours_logged != null);
  const header = [
    'Code',
    'Employee',
    'Designation',
    'Client',
    'Service PO',
    'PO Code',
    'Service Type',
    'PO Status',
    'Category',
    'Hours Logged',
    ...(hasOriginal ? ['Original Hours Logged'] : []),
  ];
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
    ...(hasOriginal ? [r.original_total_hours_logged != null ? Number(r.original_total_hours_logged) : ''] : []),
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
      <span className="block truncate font-medium text-xs">{info.getValue() || '—'}</span>
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
      <span className="block truncate text-xs">{info.getValue() || '—'}</span>
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
  columnHelper.accessor('original_total_hours_logged', {
    header: 'Original Hours Logged',
    size: 180,
    cell: (info) => (
      <span className="tabular-nums">{formatHours(info.getValue())}</span>
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
  const [employeeIds, setEmployeeIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [poStatus, setPoStatus] = useState([]);
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — backend support for entityIds/businessUnitIds has landed on this report
  // specifically (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md); every other report still uses
  // the single-select EntityFilter/BusinessUnitFilter default.
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = categoryIds.length === 0
    ? activeServiceTypes
    : activeServiceTypes.filter((t) => categoryIds.includes(String(t.service_category_id)));

  // Type (or Category, if no type chosen yet) → Service PO
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    activeServiceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [activeServiceTypes]);

  const filteredPOs = activePOs.filter((po) => {
    const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
    if (serviceTypeIds.length > 0) return poTypeId != null && serviceTypeIds.includes(poTypeId);
    if (categoryIds.length > 0) return poTypeId != null && categoryIds.includes(typeCategoryMap.get(poTypeId));
    return true;
  });

  const handleCategoryChange = (v) => {
    setCategoryIds(v);
    setServiceTypeIds([]);
    setPoIds([]);
    setPage(1);
  };

  const handleTypeChange = (v) => {
    setServiceTypeIds(v);
    setPoIds([]);
    setPage(1);
  };
  const { roleObjects } = useAuth();

  const params = {
    page,
    limit,
    hoursSource,
     roleId: roleObjects[0]?.id,
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poStatus.length > 0 && { status: poStatus.join(',') }),
    ...(categoryIds.length > 0 && { serviceCategoryIds: categoryIds.join(',') }),
    ...(serviceTypeIds.length > 0 && { serviceTypeIds: serviceTypeIds.join(',') }),
    ...(debouncedSearch && { search: debouncedSearch }),
    // `buId` is always the 'all' sentinel here (never a bare single id) so explicitBuScope always
    // drops the X-Company-Id header — the backend's "no header -> full role reach" fallback is
    // exactly what `businessUnitIds` then narrows, matching the backend contract. A single BU
    // selected this way is request-equivalent to the old single-select path (IN (x) narrows the
    // same as = x), just via the new param instead of the header.
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useResourceAllocationReport(params);

  const records = Array.isArray(data?.data) ? data.data : [];
  const rows = records;
  const meta = data?.meta ?? {};

  // Summary chips must reflect every matching record (respecting whatever filters are
  // active), not just the current page — page through the full filtered dataset
  // (backend caps `limit` at 100, so a single large-limit request silently truncates).
  const { data: fullRows } = useResourceAllocationAllRows(params);
  const summaryRows = fullRows ?? rows;

  const hasOriginalData = records.some((r) => r.original_total_hours_logged != null);
  const visibleColumns = useMemo(() => {
    if (hasOriginalData) return columns;
    return columns.filter((col) => {
      const key = col.accessorKey || col.id;
      const isOriginal = (typeof key === 'string' && key.startsWith('original_')) ||
        (typeof col.header === 'string' && col.header.startsWith('Original'));
      return !isOriginal;
    });
  }, [hasOriginalData]);

  // This report is a flat allocation list (one row per employee × PO × service
  // type), not a per-employee pivot, so billable/non-billable/leave totals are
  // derived here the same way the Monthly Utilization report's backend does:
  // billable = category name contains "billable" but not "non"; everything
  // else (including "Customer Non-Billable") counts as non-billable, and
  // Customer Non-Billable is additionally broken out on its own; leave hours
  // are identified by service type name and subtracted from utilization.
  const reportSummary = summaryRows.reduce((acc, r) => {
    const hours = Number(r.total_hours_logged) || 0;
    const origHours = Number(r.original_total_hours_logged) || 0;
    const catLower = (r.service_category_name || '').toLowerCase();
    const typeLower = (r.service_type_name || '').toLowerCase();

    const isBillable = catLower.includes('billable') && !catLower.includes('non');
    const isCustomerNonBillable = catLower.includes('customer') && catLower.includes('non') && catLower.includes('billable');
    const isLeave = typeLower.includes('leave') || typeLower.includes('vacation') || typeLower.includes('holiday');

    if (isBillable) {
      acc.billable_total += hours;
      acc.original_billable_total += origHours;
    } else {
      acc.non_billable_total += hours;
      acc.original_non_billable_total += origHours;
    }

    if (isCustomerNonBillable) {
      acc.customer_non_billable_total += hours;
      acc.original_customer_non_billable_total += origHours;
    }
    if (isLeave) {
      acc.leaves_hours += hours;
      acc.original_leaves_hours += origHours;
    }

    return acc;
  }, {
    billable_total: 0,
    original_billable_total: 0,
    non_billable_total: 0,
    original_non_billable_total: 0,
    customer_non_billable_total: 0,
    original_customer_non_billable_total: 0,
    leaves_hours: 0,
    original_leaves_hours: 0,
  });

  const totalUtilization = reportSummary.billable_total + reportSummary.non_billable_total - reportSummary.leaves_hours;
  const originalTotalUtilization = reportSummary.original_billable_total + reportSummary.original_non_billable_total - reportSummary.original_leaves_hours;

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
    entityIds.length > 0 ? 1 : 0,
    buIds.length > 0 ? 1 : 0,
    employeeIds.length > 0 ? 1 : 0,
    poIds.length > 0 ? 1 : 0,
    clientIds.length > 0 ? 1 : 0,
    categoryIds.length > 0 ? 1 : 0,
    serviceTypeIds.length > 0 ? 1 : 0,
    poStatus.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setPoIds([]);
    setClientIds([]);
    setCategoryIds([]);
    setServiceTypeIds([]);
    setPoStatus([]);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Resource Allocation"
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
          <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setPoIds([]); setClientIds([]); }} />

          <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setPoIds([]); setClientIds([]); }} />

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
            <MultiSelect
              options={activeClients.map((c) => ({ label: c.client_name, value: String(c.id) }))}
              value={clientIds}
              onValueChange={(v) => { setClientIds(v); setPage(1); }}
              placeholder="All Clients"
              searchPlaceholder="Search client..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
            <MultiSelect
              options={activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) }))}
              value={employeeIds}
              onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
              placeholder="All Employees"
              searchPlaceholder="Search employee..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Category</Label>
            <MultiSelect
              options={activeServiceCategories.map((sc) => ({ label: sc.name, value: String(sc.id) }))}
              value={categoryIds}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Type</Label>
            <MultiSelect
              options={filteredServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) }))}
              value={serviceTypeIds}
              onValueChange={handleTypeChange}
              placeholder="All Service Types"
              searchPlaceholder="Search type..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service PO</Label>
            <MultiSelect
              options={filteredPOs.map((po) => ({ label: po.service_po_name || po.service_po_code || String(po.id), value: String(po.id) }))}
              value={poIds}
              onValueChange={(v) => { setPoIds(v); setPage(1); }}
              placeholder="All POs"
              searchPlaceholder="Search PO..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">PO Status</Label>
            <MultiSelect
              options={[
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
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
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
