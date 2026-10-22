import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { useServicePOResourceReport, useResourceAllocationAllRows } from '@/hooks/useReports';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { reportsApi } from '@/api/reports.api';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useActiveClients } from '@/hooks/useClients';
import { formatMonthYear } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import MobilePagination from '@/components/common/MobilePagination';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { cn } from '@/utils/cn';
import useAuth from '@/hooks/useAuth';


const SERVICE_TYPE_COLORS = {
  staffaugmentation:    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  'staff augmentation': 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  project:              'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  support:              'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  servicepack:          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'service pack':       'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

const serviceTypeBadgeClass = (type) =>
  SERVICE_TYPE_COLORS[type?.toLowerCase()] ?? 'bg-muted text-muted-foreground';

// Normalise field names — the API may use different keys depending on backend version
const getField = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return null;
};

const getHours = (row) => getField(row, 'total_hours_logged', 'hours_logged', 'hours', 'time_in_hrs');
const getOriginalHours = (row) => getField(row, 'original_actual_hours', 'original_total_hours_logged', 'original_hours_logged', 'original_hours', 'original_time_in_hrs');

// The columns worth searching, each as the same key-alias list groupRows/exportToExcel use —
// the API's field names vary by backend version, so search has to look through exactly the
// aliases the table renders from or it would miss rows that are plainly visible. Time (hrs) is
// deliberately absent: substring-matching a number is more confusing than useful.
const SEARCHABLE_KEYS = [
  ['customer_name', 'client_name', 'client'],                 // Customer Name
  ['po_name', 'service_po_name', 'po_summary', 'po_title'],   // Service PO Summary
  ['service_type_name', 'service_type', 'po_type', 'type'],   // Service Type
  ['employee_name', 'full_name', 'resource_name'],            // Resource
  ['employee_code'],                                          // Resource code
  ['remarks'],                                                // Remarks
];

const rowMatchesSearch = (row, q) =>
  SEARCHABLE_KEYS.some((keys) => String(getField(row, ...keys) ?? '').toLowerCase().includes(q));

// Group flat rows by customer → po_name
const groupRows = (rows) => {
  const map = new Map(); // key: `${customer}|||${po_name}`

  rows.forEach((row) => {
    const customer = getField(row, 'customer_name', 'client_name', 'client') ?? '(No Customer)';
    const po       = getField(row, 'po_name', 'service_po_name', 'po_summary', 'po_title') ?? '(No PO)';
    const key      = `${customer}|||${po}`;

    if (!map.has(key)) {
      map.set(key, {
        customer,
        po,
        service_type: getField(row, 'service_type_name', 'service_type', 'po_type', 'type'),
        rows: [],
      });
    }
    map.get(key).rows.push(row);
  });

  return Array.from(map.values());
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const exportToExcel = (rows, month, year) => {
  const monthLabel = MONTH_NAMES[(month - 1)] ?? month;

  const hasOriginal = rows.some((r) => getOriginalHours(r) != null);

  const header = [
    'Sr. No.',
    'Customer Name',
    'Service PO Summary',
    'Service Type',
    'Resource',
    'Time in Hrs',
    ...(hasOriginal ? ['Original Time in Hrs'] : []),
    'Remarks',
  ];
  let srNo = 1;
  const dataRows = [];

  const groups = groupRows(rows);
  groups.forEach((group) => {
    group.rows.forEach((row, i) => {
      const employee  = getField(row, 'full_name', 'employee_name', 'resource_name');
      const hours     = getHours(row);
      const origHours = getOriginalHours(row);
      const remarks   = getField(row, 'remarks') ?? '';

      dataRows.push([
        i === 0 ? srNo++ : '',
        i === 0 ? group.customer : '',
        i === 0 ? group.po : '',
        i === 0 ? (group.service_type ?? '') : '',
        employee ?? '',
        hours != null ? Number(hours) : '',
        ...(hasOriginal ? [origHours != null ? Number(origHours) : ''] : []),
        remarks,
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service PO vs Resource');
  XLSX.writeFile(wb, `ServicePO_Resource_${monthLabel}_${year}.xlsx`);
};

// ─── main component ──────────────────────────────────────────────────────────
const ServicePOResource = () => {
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { month: prevMonth.getMonth() + 1, year: prevMonth.getFullYear() };
  });
  const [employeeIds, setEmployeeIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [typeIds, setTypeIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [exporting, setExporting] = useState(false);  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);


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
    if (typeIds.length > 0) return poTypeId != null && typeIds.includes(poTypeId);
    if (categoryIds.length > 0) return poTypeId != null && categoryIds.includes(typeCategoryMap.get(poTypeId));
    return true;
  });

  const handleCategoryChange = (v) => {
    setCategoryIds(v);
    setTypeIds([]);
    setPoIds([]);
    setPage(1);
  };

  const handleTypeChange = (v) => {
    setTypeIds(v);
    setPoIds([]);
    setPage(1);
  };
  const { roleObjects } = useAuth();

  const params = {
    ...(monthYear && { month: monthYear.month }),
    ...(monthYear && { year: monthYear.year }),
    hoursSource,
    ...(roleObjects[0]?.id && { roleId: roleObjects[0].id }),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(categoryIds.length > 0 && { serviceCategoryIds: categoryIds.join(',') }),
    ...(typeIds.length > 0 && { serviceTypeIds: typeIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    page,
    limit,
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending } = useServicePOResourceReport(params);

  // Total Hours must reflect every matching record (respecting whatever filters are
  // active), not just the current page — page through the full filtered dataset
  // (backend caps `limit` at 100, so a single large-limit request silently truncates).
  const { data: fullRows } = useResourceAllocationAllRows(params);

  const rows   = data?.data ?? [];
  const meta   = data?.meta ?? {};

  // Search deliberately spans the whole result set rather than the page on screen: the full
  // dataset is already in memory for Total Hours, so there is nothing to fetch, and a search
  // that only looked at the current 10 rows would report "not found" for records that exist.
  // While a search is active the server's page boundaries no longer describe the result, so
  // paging switches to client-side over the matches; with no search, nothing changes.
  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const searchedRows = useMemo(
    () => (isSearching ? (fullRows ?? rows).filter((r) => rowMatchesSearch(r, trimmedSearch)) : null),
    [isSearching, trimmedSearch, fullRows, rows]
  );

  const visibleRows = isSearching ? searchedRows.slice((page - 1) * limit, page * limit) : rows;
  const groups = useMemo(() => groupRows(visibleRows), [visibleRows]);

  // One pagination view-model so the footer reads the same whether the server or the search is
  // doing the paging.
  const pageCount    = isSearching ? Math.max(1, Math.ceil(searchedRows.length / limit)) : (meta.totalPages ?? 1);
  const recordCount  = isSearching ? searchedRows.length : meta.total;
  const currentPage  = isSearching ? page : (meta.page ?? page);
  const canPrev      = isSearching ? page > 1 : !!(meta.hasPrev || meta.hasPrevPage);
  const canNext      = isSearching ? page < pageCount : !!(meta.hasNext || meta.hasNextPage);

  // Export pulls every matching record (not just the current page); reuses the
  // already-fetched full dataset above when available instead of firing a new request.
  const handleExport = async () => {
    setExporting(true);
    try {
      // Exports what the search actually leaves on screen, not the unfiltered set.
      const all = isSearching
        ? searchedRows
        : (fullRows ?? await reportsApi.fetchAllResourceAllocationRows(params));
      exportToExcel(all, monthYear?.month, monthYear?.year);
    } finally {
      setExporting(false);
    }
  };

  const monthLabel  = monthYear ? formatMonthYear(monthYear.month, monthYear.year) : '';
  const allRecords  = isSearching ? searchedRows : (fullRows ?? rows);
  const totalHours  = allRecords.reduce((sum, r) => {
    const h = getHours(r);
    return sum + (h ? Number(h) : 0);
  }, 0);
  const totalOriginalHours = allRecords.reduce((sum, r) => {
    const h = getOriginalHours(r);
    return sum + (h ? Number(h) : 0);
  }, 0);
  const hasOriginal = useMemo(
    () => (fullRows ?? rows).some((r) => getOriginalHours(r) != null),
    [fullRows, rows]
  );

  const activeFilterCount = [
    entityIds.length > 0 ? 1 : 0,
    buIds.length > 0 ? 1 : 0,
    employeeIds.length > 0 ? 1 : 0,
    categoryIds.length > 0 ? 1 : 0,
    typeIds.length > 0 ? 1 : 0,
    poIds.length > 0 ? 1 : 0,
    clientIds.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setEmployeeIds([]);
    setCategoryIds([]);
    setTypeIds([]);
    setPoIds([]);
    setClientIds([]);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Service PO vs Resource"
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
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search customer, PO, type, resource…"
              className="w-full sm:w-full md:w-72"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((o) => !o)}
              activeCount={activeFilterCount}
            />
            {visibleRows.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      {/* ── Collapsible Filter Panel ── */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[560px]"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
          <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setPoIds([]); setPage(1); }} />

          <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setPoIds([]); setPage(1); }} />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Month &amp; Year</Label>
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="All months"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Client</Label>
            <MultiSelect
              options={activeClients.map((c) => ({
                  label: c.client_name,
                  value: String(c.id)
                }))}
              value={clientIds}
              onValueChange={(v) => { setClientIds(v); setPage(1); }}
              placeholder="All Clients"
              searchPlaceholder="Search client..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Employee</Label>
            <MultiSelect
              options={activeEmployees.map((e) => ({
                  label: e.full_name,
                  value: String(e.id)
                }))}
              value={employeeIds}
              onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
              placeholder="All Employees"
              searchPlaceholder="Search employee..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service Category</Label>
            <MultiSelect
              options={activeServiceCategories.map((sc) => ({
                  label: sc.name,
                  value: String(sc.id)
                }))}
              value={categoryIds}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service Type</Label>
            <MultiSelect
              options={filteredServiceTypes.map((t) => ({
                  label: t.service_type_name,
                  value: String(t.id)
                }))}
              value={typeIds}
              onValueChange={handleTypeChange}
              placeholder="All Types"
              searchPlaceholder="Search type..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Service PO</Label>
            <MultiSelect
              options={filteredPOs.map((po) => ({
                  label: po.service_po_name || po.service_po_code || String(po.id),
                  value: String(po.id)
                }))}
              value={poIds}
              onValueChange={(v) => { setPoIds(v); setPage(1); }}
              placeholder="All POs"
              searchPlaceholder="Search PO..."
              className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] w-full"
            />
          </div>
      </FilterPanel>

      {/* ── States ── */}
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border py-20 text-center">
          <p className="text-sm text-muted-foreground">
            {isSearching ? `No rows match “${search.trim()}”.` : 'No allocation data found.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          {/* ── Summary ── */}
          <div className="shrink-0 mb-4 flex flex-wrap gap-3">
            <div className="rounded-md border bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-400">
              Total Hours&nbsp;
              <span className="font-semibold tabular-nums">{totalHours.toFixed(1)} hrs</span>
            </div>
          </div>

          {/* Desktop — same shared Table primitives (and the same no-vertical-borders,
              fluid-clamp() sizing, sticky header) every other report table in this app uses,
              rather than a hand-rolled `<table>` with its own one-off styling. rowSpan-merged
              Customer/Service PO Summary/Service Type cells (one Service PO can have several
              Resource rows under it) are the one thing DataTable's flat row model can't do, so
              this stays a direct `Table`/`TableRow`/`TableCell` composition instead of going
              through DataTable itself. */}
          <div className="hidden md:flex min-h-0 flex-col rounded-lg border overflow-hidden">
          <Table containerClassName="flex-1 min-h-0">
            <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="w-[48px]">#</TableHead>
                <TableHead className="min-w-[160px]">Customer Name</TableHead>
                <TableHead className="min-w-[200px]">Service PO Summary</TableHead>
                <TableHead className="w-[150px]">Service Type</TableHead>
                <TableHead className="min-w-[180px]">Resource</TableHead>
                <TableHead className="w-[110px] text-right">Time (hrs)</TableHead>
                {hasOriginal && <TableHead className="w-[160px] text-right whitespace-nowrap">Original Time (hrs)</TableHead>}
                <TableHead className="w-[160px]">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group, gi) =>
                group.rows.map((row, ri) => {
                  const isFirst    = ri === 0;
                  const rowCount   = group.rows.length;
                  const employee   = getField(row, 'employee_name', 'full_name', 'resource_name');
                  const hours      = getHours(row);
                  const origHours  = getOriginalHours(row);
                  const remarks    = getField(row, 'remarks');

                  return (
                    <TableRow key={`${gi}-${ri}`} className={cn(isFirst && gi > 0 && 'border-t-2 border-border/60')}>
                      {/* Sr No — only on first row of group, rowSpan */}
                      {isFirst && (
                        <TableCell rowSpan={rowCount} className="text-center align-top text-muted-foreground">
                          {gi + 1}
                        </TableCell>
                      )}
                      {/* Customer — only on first row */}
                      {isFirst && (
                        <TableCell rowSpan={rowCount} className="align-top font-medium">
                          {group.customer}
                        </TableCell>
                      )}
                      {/* PO — only on first row */}
                      {isFirst && (
                        <TableCell rowSpan={rowCount} className="align-top">
                          {group.po}
                        </TableCell>
                      )}
                      {/* Service Type — only on first row */}
                      {isFirst && (
                        <TableCell rowSpan={rowCount} className="align-top">
                          {group.service_type ? (
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                              serviceTypeBadgeClass(group.service_type)
                            )}>
                              {group.service_type}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {/* Resource — name only, no employee code/id */}
                      <TableCell>
                        {employee ? (
                          <span className="font-medium">{employee}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      {/* Hours */}
                      <TableCell className="text-right">
                        {hours != null ? (
                          <span className="tabular-nums font-medium">{Number(hours).toFixed(1)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* Original Hours */}
                      {hasOriginal && (
                        <TableCell className="text-right">
                          {origHours != null ? (
                            <span className="tabular-nums font-medium text-muted-foreground">{Number(origHours).toFixed(1)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {/* Remarks */}
                      <TableCell className="text-muted-foreground">
                        {remarks || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>

          {/* Mobile: same `groups` data (customer -> Service PO -> resource rows), as nested
              cards instead of rowSpan-merged table cells — the group header (customer/PO/service
              type) stays visually attached to its resource rows via one bordered card. */}
          <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto md:hidden">
            {groups.map((group, gi) => (
              <div key={gi} className="rounded-lg border bg-white overflow-hidden">
                <div className="border-b bg-muted/30 p-3.5">
                  <p className="font-semibold">{group.customer}</p>
                  <p className="text-sm text-muted-foreground">{group.po}</p>
                  {group.service_type && (
                    <span className={cn(
                      'mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      serviceTypeBadgeClass(group.service_type)
                    )}>
                      {group.service_type}
                    </span>
                  )}
                </div>
                <div className="divide-y">
                  {group.rows.map((row, ri) => {
                    const employee = getField(row, 'employee_name', 'full_name', 'resource_name');
                    const hours = getHours(row);
                    const origHours = getOriginalHours(row);
                    const remarks = getField(row, 'remarks');
                    return (
                      <div key={ri} className="flex items-center justify-between gap-2 p-3.5">
                        <div className="min-w-0">
                          {employee ? (
                            <p className="truncate text-sm font-medium">{employee}</p>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">Unassigned</p>
                          )}
                          {remarks && <p className="mt-0.5 truncate text-xs text-muted-foreground">{remarks}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-semibold tabular-nums">
                            {hours != null ? Number(hours).toFixed(1) : '—'}
                          </span>
                          {hasOriginal && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              Orig: {origHours != null ? Number(origHours).toFixed(1) : '—'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="shrink-0 mt-3 hidden items-center justify-between gap-2 md:flex">
            <p className="text-xs text-muted-foreground">
              {recordCount != null
                ? `${recordCount} record${recordCount !== 1 ? 's' : ''} · page ${currentPage} of ${pageCount}`
                : `${groups.length} service PO${groups.length !== 1 ? 's' : ''} · ${visibleRows.length} resource row${visibleRows.length !== 1 ? 's' : ''}`}
              {monthLabel ? ` · ${monthLabel}` : ''}
            </p>
                        <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 text-xs bg-white w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!canPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground px-1">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  variant="outline" size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!canNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
          <MobilePagination
            className="shrink-0 mt-3 md:hidden"
            page={currentPage}
            totalPages={pageCount}
            total={recordCount}
            limit={limit}
            itemLabel="record"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}
    </div>
  );
};

export default ServicePOResource;
