import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Download, Search } from 'lucide-react';
import { useClientServicePOHours } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { formatDate, formatHours } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { cn } from '@/utils/cn';

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const STATUS_OPTIONS = [
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Pending', value: 'pending' },
  { label: 'On Hold', value: 'on-hold' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Closed', value: 'closed' },
];

const getGridCols = (hasOriginal) =>
  hasOriginal
    ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_110px_110px]'
    : 'grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_110px]';

const HOURS_NUMFMT = '#,##0.00';

// The installed 'xlsx' package (SheetJS community edition) silently drops font/fill cell
// styling on write (confirmed by inspecting a written file's styles.xml — no bold/color
// survives) — only column widths, merges, and number formats actually persist. So this sticks
// to those: a merged title/period row, sized columns, and a real 2-decimal number format on
// Hours rather than a raw float.
const exportToExcel = (clientGroups, periodLabel) => {
  const hasOriginal = clientGroups.some((g) =>
    g.original_total_hrs_of_client != null ||
    (g.service_pos ?? []).some((po) => po.original_hours != null || po.original_actual_hours != null)
  );
  const header = [
    'Client',
    'Service PO',
    'Hours',
    ...(hasOriginal ? ['Original Hours'] : []),
  ];
  const aoa = [
    ['Client Service PO Hours Report'],
    [periodLabel ? `Period: ${periodLabel}` : ''],
    [],
    header,
  ];

  // One row per Service PO — the client name repeats on every row for that client rather than
  // collapsing into a separate subtotal row, so the Client column stays a plain, filterable list.
  clientGroups.forEach((group) => {
    (group.service_pos ?? []).forEach((po) => {
      const origHours = po.original_hours ?? po.original_actual_hours;
      aoa.push([
        group.client_name,
        po.service_po_name ?? '',
        Number(po.hours ?? po.actual_hours) || 0,
        ...(hasOriginal ? [origHours != null ? Number(origHours) : ''] : []),
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 30 },
    { wch: 38 },
    { wch: 12 },
    ...(hasOriginal ? [{ wch: 14 }] : []),
  ];
  const mergeEndCol = hasOriginal ? 3 : 2;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: mergeEndCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: mergeEndCol } },
  ];

  const HOURS_COL = 2;
  const HEADER_ROW = 3;
  for (let r = HEADER_ROW + 1; r < aoa.length; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: HOURS_COL });
    if (ws[ref]) ws[ref].z = HOURS_NUMFMT;
    if (hasOriginal) {
      const origRef = XLSX.utils.encode_cell({ r, c: 3 });
      if (ws[origRef]) ws[origRef].z = HOURS_NUMFMT;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Client Service PO Hours');
  XLSX.writeFile(wb, 'Client_Service_PO_Hours_Report.xlsx');
};

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

// The resource-allocation API's field names vary by backend version (same defensive lookup
// ServicePOResource.jsx uses) — try each candidate key in order, first non-empty value wins.
const getField = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return null;
};

// Lazily fetches the employee-level hours breakdown for one Service PO, only once that PO
// row is expanded — reuses /reports/resource-allocation (already scoped by poId/month/year)
// rather than a new endpoint, so this needs no backend change.
const ServicePoEmployeeBreakdown = ({ poId, monthYear, hoursSource, buId, hasOriginal }) => {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['clientServicePoHours', 'employeeBreakdown', poId, monthYear?.month, monthYear?.year, hoursSource, buId],
    queryFn: () => reportsApi.getResourceAllocation({
      month: monthYear.month,
      year: monthYear.year,
      hoursSource,
      poId,
      // Same BU scope as the parent row, so the drill-down can never resolve against a
      // different BU than the total it is expanding.
      buId,
      page: 1,
      limit: 500,
    }),
    enabled: !!poId,
    staleTime: 0,
  });

  const rows = Array.isArray(data?.data) ? data.data : [];

  if (isFetching) {
    return (
      <>
        <div className={cn('hidden md:grid gap-2 px-4 py-2 text-xs text-muted-foreground border-t', getGridCols(hasOriginal))}>
          <span />
          <span style={{ paddingLeft: 28 }}>Loading employees…</span>
          <span />
          {hasOriginal && <span />}
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground border-t md:hidden">Loading employees…</div>
      </>
    );
  }

  if (isError || rows.length === 0) {
    const message = isError ? 'Failed to load employee hours.' : 'No employee hours found.';
    return (
      <>
        <div className={cn('hidden md:grid gap-2 px-4 py-2 text-xs text-muted-foreground border-t', getGridCols(hasOriginal))}>
          <span />
          <span style={{ paddingLeft: 28 }}>{message}</span>
          <span />
          {hasOriginal && <span />}
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground border-t md:hidden">{message}</div>
      </>
    );
  }

  return rows.map((row, i) => {
    const employee = getField(row, 'full_name', 'employee_name', 'resource_name') ?? 'Unassigned';
    const hours = getField(row, 'total_hours_logged', 'hours_logged', 'hours', 'time_in_hrs');
    const origHours = getField(row, 'original_total_hours_logged', 'original_hours_logged', 'original_hours');
    return (
      <div key={i}>
        <div className={cn('hidden md:grid gap-2 px-4 py-1.5 text-xs bg-muted/20 border-t', getGridCols(hasOriginal))}>
          <span />
          <span className="flex items-center truncate text-muted-foreground" style={{ paddingLeft: 28 }}>
            <span className="mr-1.5">└</span>
            <span className="truncate">{employee}</span>
          </span>
          <span className="text-right tabular-nums">{formatHours(Number(hours) || 0)}</span>
          {hasOriginal && (
            <span className="text-right tabular-nums text-muted-foreground">
              {origHours != null ? formatHours(Number(origHours) || 0) : '—'}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs bg-muted/20 border-t md:hidden">
          <span className="flex min-w-0 items-center truncate text-muted-foreground">
            <span className="mr-1.5">└</span>
            <span className="truncate">{employee}</span>
          </span>
          <span className="shrink-0 tabular-nums">
            {formatHours(Number(hours) || 0)}
            {hasOriginal && origHours != null && (
              <span className="text-muted-foreground text-[10px] ml-1">
                (orig: {formatHours(Number(origHours) || 0)})
              </span>
            )}
          </span>
        </div>
      </div>
    );
  });
};

const ClientServicePOHoursReport = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });

  const [clientIds, setClientIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsedClientIds, setCollapsedClientIds] = useState(() => new Set());
  const [expandedPoIds, setExpandedPoIds] = useState(() => new Set());
  const canViewOriginal = useCanViewOriginalData();
  const [hoursSource, setHoursSource] = useState('M');

  // Role no longer grants Original-data visibility (e.g. role reassigned mid-session) — force
  // back to Modified, same as every other report.
  useEffect(() => {
    if (!canViewOriginal) setHoursSource('M');
  }, [canViewOriginal]);
  // 'client' | 'servicePO' | 'hours'. 'client'/'hours' reorder the client groups; 'servicePO'
  // (and 'hours' too) also reorders each group's own service_pos rows.
  const [sortBy, setSortBy] = useState('client');
  const [sortOrder, setSortOrder] = useState('asc');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);

  // Service Type -> Project (Service PO), same cascade as ServicePOSummary's Category/Type/PO chain.
  const filteredPOs = serviceTypeIds.length === 0
    ? activePOs
    : activePOs.filter((po) => serviceTypeIds.includes(String(po.serviceType?.id)));

  const handleServiceTypeChange = (v) => {
    setServiceTypeIds(v);
    setPoIds([]);
  };

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    hoursSource,
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(serviceTypeIds.length > 0 && { serviceTypeIds: serviceTypeIds.join(',') }),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(statuses.length > 0 && { status: statuses.join(',') }),
    // `buId` is always the 'all' sentinel so explicitBuScope always drops the X-Company-Id
    // header, letting `businessUnitIds` below narrow the full role reach instead.
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const periodReady = !!(monthYear?.month && monthYear?.year);

  const periodLabel = monthYear ? formatDate(`${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`, 'MMMM YYYY') : '';

  const { data, isPending, isError, error } = useClientServicePOHours(params);
  const clientGroups = Array.isArray(data?.data) ? data.data : [];

  const sortedClientGroups = useMemo(() => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    const groups = clientGroups.map((group) => ({
      ...group,
      service_pos: [...(group.service_pos ?? [])].sort((a, b) => {
        if (sortBy === 'servicePO') return dir * String(a.service_po_name ?? '').localeCompare(String(b.service_po_name ?? ''));
        if (sortBy === 'hours') return dir * ((Number(a.hours) || 0) - (Number(b.hours) || 0));
        return 0;
      }),
    }));
    groups.sort((a, b) => {
      if (sortBy === 'client') return dir * String(a.client_name ?? '').localeCompare(String(b.client_name ?? ''));
      if (sortBy === 'hours') return dir * ((Number(a.total_hrs_of_client) || 0) - (Number(b.total_hrs_of_client) || 0));
      return 0;
    });
    return groups;
  }, [clientGroups, sortBy, sortOrder]);

  const hasOriginal = useMemo(() => {
    return clientGroups.some((g) =>
      g.original_total_hrs_of_client != null ||
      (g.service_pos ?? []).some((po) => po.original_hours != null || po.original_actual_hours != null)
    );
  }, [clientGroups]);

  // The API has no `search` query param, so this filters client-side over the already-fetched
  // (unpaginated) result set — matches on client name or Service PO name. A client-name match
  // keeps all its POs; a PO-name-only match narrows to just the matching POs, with that group's
  // displayed total recomputed to match what's actually shown.
  const visibleClientGroups = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return sortedClientGroups;
    return sortedClientGroups
      .map((group) => {
        const clientMatches = (group.client_name ?? '').toLowerCase().includes(q);
        const pos = clientMatches
          ? group.service_pos ?? []
          : (group.service_pos ?? []).filter((po) => (po.service_po_name ?? '').toLowerCase().includes(q));
        if (pos.length === 0) return null;
        const total = clientMatches
          ? group.total_hrs_of_client
          : pos.reduce((sum, po) => sum + (Number(po.hours ?? po.actual_hours) || 0), 0);
        const origTotal = clientMatches
          ? group.original_total_hrs_of_client
          : (group.original_total_hrs_of_client != null || pos.some((po) => (po.original_hours ?? po.original_actual_hours) != null))
            ? pos.reduce((sum, po) => sum + (Number(po.original_hours ?? po.original_actual_hours) || 0), 0)
            : undefined;
        return {
          ...group,
          service_pos: pos,
          total_hrs_of_client: total,
          original_total_hrs_of_client: origTotal,
        };
      })
      .filter(Boolean);
  }, [sortedClientGroups, debouncedSearch]);

  const grandTotal = visibleClientGroups.reduce((sum, g) => sum + (Number(g.total_hrs_of_client) || 0), 0);
  const originalGrandTotal = hasOriginal
    ? visibleClientGroups.reduce((sum, g) => sum + (Number(g.original_total_hrs_of_client) || 0), 0)
    : null;
  const errorMessage = isError ? extractApiError(error) : null;
  const showLoading = periodReady && isPending;

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const activeFilterCount = [
    clientIds.length > 0,
    poIds.length > 0,
    serviceTypeIds.length > 0,
    employeeIds.length > 0,
    statuses.length > 0,
    entityIds.length > 0,
    buIds.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setClientIds([]);
    setPoIds([]);
    setServiceTypeIds([]);
    setEmployeeIds([]);
    setStatuses([]);
    setEntityIds([]);
    setBuIds([]);
  };

  const toggleClient = (clientKey) => {
    setCollapsedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientKey)) next.delete(clientKey);
      else next.add(clientKey);
      return next;
    });
  };

  const togglePo = (poKey) => {
    setExpandedPoIds((prev) => {
      const next = new Set(prev);
      if (next.has(poKey)) next.delete(poKey);
      else next.add(poKey);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Client Service PO Hours Report"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full md:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
              <Input
                placeholder="Search client, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[clamp(1.875rem,2vw,2.25rem)] pl-9 w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>
            {canViewOriginal && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border shrink-0">
                {[
                  { value: 'O', label: 'Original' },
                  { value: 'M', label: 'Published' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHoursSource(value)}
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
            />
            {visibleClientGroups.length > 0 && (
              <Button variant="outline" size="sm" className="h-[clamp(1.875rem,2vw,2.25rem)]" onClick={() => exportToExcel(visibleClientGroups, periodLabel)}>
                <Download className="mr-1.5 h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Collapsible filter panel */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[620px]"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
            <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setClientIds([]); setPoIds([]); setEmployeeIds([]); }} />

            <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setClientIds([]); setPoIds([]); setEmployeeIds([]); }} />

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
              <MonthYearPicker
                value={monthYear}
                onChange={setMonthYear}
                placeholder="Select month"
                clearable={false}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Client</Label>
              <MultiSelect
                options={[
                  ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
                ]}
                value={clientIds}
                onValueChange={setClientIds}
                placeholder="All Clients"
                searchPlaceholder="Search client..."
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Service Type</Label>
              <MultiSelect
                options={[
                  ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) })),
                ]}
                value={serviceTypeIds}
                onValueChange={handleServiceTypeChange}
                placeholder="All Service Types"
                searchPlaceholder="Search service type..."
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Project (Service PO)</Label>
              <MultiSelect
                options={[
                  ...filteredPOs.map((po) => ({
                    label: po.service_po_name || po.service_po_code || String(po.id),
                    value: String(po.id),
                  })),
                ]}
                value={poIds}
                onValueChange={setPoIds}
                placeholder="All Projects"
                searchPlaceholder="Search project..."
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Employee</Label>
              <MultiSelect
                options={[
                  ...activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) })),
                ]}
                value={employeeIds}
                onValueChange={setEmployeeIds}
                placeholder="All Employees"
                searchPlaceholder="Search employee..."
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Status</Label>
              <MultiSelect
                options={STATUS_OPTIONS}
                value={statuses}
                onValueChange={setStatuses}
                placeholder="All Statuses"
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>
      </FilterPanel>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* `shrink-0` matters here for a subtler reason than usual: per the flexbox spec, a flex
          item whose own `overflow` isn't `visible` gets an automatic minimum size of 0 for the
          shrink calculation (not its content height) — so this `overflow-hidden` card (needed
          only for the rounded corners) was a legal shrink target even without a `min-h-0`, and
          the browser would silently clip whole client groups off the bottom under space pressure
          (e.g. once Filters pushed everything else down) instead of the page simply growing
          taller and letting the user scroll to it. This report has no internally-scrolling table
          area — it's a content-driven grouped list — so it should never shrink at all. */}
      <div className="hidden md:block shrink-0 rounded-lg border overflow-hidden">
        <div className={cn('grid gap-2 bg-muted/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b', getGridCols(hasOriginal))}>
          <SortableHeader label="Client" column="client" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
          <SortableHeader label="Service PO" column="servicePO" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
          <SortableHeader label="Hours" column="hours" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
          {hasOriginal && (
            <span className="text-right">Original Hours</span>
          )}
        </div>

        {!periodReady && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Select a month to load the report.</div>
        )}

        {showLoading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        )}

        {periodReady && !showLoading && !errorMessage && clientGroups.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No data found for the selected filters.</div>
        )}

        {periodReady && !showLoading && !errorMessage && clientGroups.length > 0 && visibleClientGroups.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No results match "{search}".</div>
        )}

        {periodReady && !showLoading && visibleClientGroups.map((group) => {
          const clientKey = group.client_id ?? group.client_name;
          const isExpanded = !collapsedClientIds.has(clientKey);
          const poCount = group.service_pos?.length ?? 0;

          return (
            <div key={clientKey} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => toggleClient(clientKey)}
                className={cn(
                  'w-full grid gap-2 items-center px-4 py-2.5 text-left border-l-2 border-l-primary/40 hover:bg-muted/30 transition-colors',
                  getGridCols(hasOriginal)
                )}
              >
                <span className="flex items-center gap-2 font-semibold truncate">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{group.client_name}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {!isExpanded && `${poCount} Service PO${poCount !== 1 ? 's' : ''}`}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {!isExpanded && formatHours(group.total_hrs_of_client)}
                </span>
                {hasOriginal && (
                  <span className="text-right font-semibold tabular-nums text-muted-foreground">
                    {!isExpanded && (group.original_total_hrs_of_client != null ? formatHours(group.original_total_hrs_of_client) : '—')}
                  </span>
                )}
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {(group.service_pos ?? []).map((po) => {
                      const poExpanded = expandedPoIds.has(po.service_po_id);
                      return (
                        <div key={po.service_po_id}>
                          <button
                            type="button"
                            onClick={() => togglePo(po.service_po_id)}
                            className={cn(
                              'w-full grid gap-2 px-4 py-2 text-sm text-left bg-muted/10 border-t hover:bg-muted/20 transition-colors',
                              getGridCols(hasOriginal)
                            )}
                          >
                            <span className="text-muted-foreground truncate text-xs">{group.client_name}</span>
                            <span className="flex items-center truncate text-muted-foreground" style={{ paddingLeft: 14 }}>
                              <span className="mr-1.5">└</span>
                              {poExpanded ? (
                                <ChevronDown className="h-3 w-3 mr-1 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3 w-3 mr-1 shrink-0" />
                              )}
                              <span className="truncate">{po.service_po_name}</span>
                            </span>
                            <span className="text-right tabular-nums">{formatHours(po.hours ?? po.actual_hours)}</span>
                            {hasOriginal && (
                              <span className="text-right tabular-nums text-muted-foreground">
                                {(po.original_hours ?? po.original_actual_hours) != null
                                  ? formatHours(po.original_hours ?? po.original_actual_hours)
                                  : '—'}
                              </span>
                            )}
                          </button>

                          <AnimatePresence initial={false}>
                            {poExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <ServicePoEmployeeBreakdown
                                  poId={po.service_po_id}
                                  monthYear={monthYear}
                                  hoursSource={hoursSource}
                                  buId={ALL_BUS}
                                  hasOriginal={hasOriginal}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    <div className={cn('grid gap-2 px-4 py-2 text-sm font-semibold bg-muted/20 border-t', getGridCols(hasOriginal))}>
                      <span className="pl-6">Total</span>
                      <span />
                      <span className="text-right tabular-nums">{formatHours(group.total_hrs_of_client)}</span>
                      {hasOriginal && (
                        <span className="text-right tabular-nums text-muted-foreground">
                          {group.original_total_hrs_of_client != null ? formatHours(group.original_total_hrs_of_client) : '—'}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Mobile: same grouped client -> Service PO -> employee accordion, as full-width cards
          instead of a 3-column grid row — reuses the exact same `visibleClientGroups` data and
          `toggleClient`/`togglePo` handlers as the desktop table above, just different markup. */}
      <div className="shrink-0 space-y-3 md:hidden">
        {!periodReady && (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Select a month to load the report.</div>
        )}
        {showLoading && (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        )}
        {periodReady && !showLoading && !errorMessage && clientGroups.length === 0 && (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">No data found for the selected filters.</div>
        )}
        {periodReady && !showLoading && !errorMessage && clientGroups.length > 0 && visibleClientGroups.length === 0 && (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">No results match "{search}".</div>
        )}

        {periodReady && !showLoading && visibleClientGroups.length > 0 && (
          <>
            <p className="text-sm font-semibold text-foreground">
              {visibleClientGroups.length} Client{visibleClientGroups.length !== 1 ? 's' : ''}
            </p>
            {visibleClientGroups.map((group) => {
              const clientKey = group.client_id ?? group.client_name;
              const isExpanded = !collapsedClientIds.has(clientKey);

              return (
                <div key={clientKey} className="rounded-lg border bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleClient(clientKey)}
                    className="flex w-full items-center justify-between gap-2 border-l-2 border-l-primary/40 p-3.5 text-left active:bg-muted/30"
                  >
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{group.client_name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      Total {formatHours(group.total_hrs_of_client)}
                      {hasOriginal && group.original_total_hrs_of_client != null && (
                        <span className="text-muted-foreground text-xs ml-1.5 font-normal">
                          (Orig: {formatHours(group.original_total_hrs_of_client)})
                        </span>
                      )}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t"
                      >
                        {(group.service_pos ?? []).map((po) => {
                          const poExpanded = expandedPoIds.has(po.service_po_id);
                          return (
                            <div key={po.service_po_id} className="border-b last:border-b-0">
                              <button
                                type="button"
                                onClick={() => togglePo(po.service_po_id)}
                                className="flex w-full items-center justify-between gap-2 bg-muted/10 px-3.5 py-2.5 text-left text-sm active:bg-muted/20"
                              >
                                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                  {poExpanded ? (
                                    <ChevronDown className="h-3 w-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0" />
                                  )}
                                  <span className="truncate">{po.service_po_name}</span>
                                </span>
                                <div className="shrink-0 text-right">
                                  <span className="font-medium tabular-nums block">{formatHours(po.hours ?? po.actual_hours)}</span>
                                  {hasOriginal && (po.original_hours ?? po.original_actual_hours) != null && (
                                    <span className="text-muted-foreground text-xs block">
                                      Orig: {formatHours(po.original_hours ?? po.original_actual_hours)}
                                    </span>
                                  )}
                                </div>
                              </button>

                              <AnimatePresence initial={false}>
                                {poExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                  >
                                    <ServicePoEmployeeBreakdown
                                      poId={po.service_po_id}
                                      monthYear={monthYear}
                                      hoursSource={hoursSource}
                                      buId={ALL_BUS}
                                      hasOriginal={hasOriginal}
                                    />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between gap-2 bg-muted/20 px-3.5 py-2 text-sm font-semibold">
                          <span>Total</span>
                          <span className="tabular-nums">
                            {formatHours(group.total_hrs_of_client)}
                            {hasOriginal && group.original_total_hrs_of_client != null && (
                              <span className="text-muted-foreground text-xs ml-1.5 font-normal">
                                (Orig: {formatHours(group.original_total_hrs_of_client)})
                              </span>
                            )}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </>
        )}
      </div>

      {!showLoading && visibleClientGroups.length > 0 && (
        <div className="mt-4 flex flex-wrap shrink-0 justify-end gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-sm font-semibold tabular-nums">
            Grand Total: {formatHours(grandTotal)}
          </span>
          {hasOriginal && originalGrandTotal != null && (
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              Original Grand Total: {formatHours(originalGrandTotal)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientServicePOHoursReport;
