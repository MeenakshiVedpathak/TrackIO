import { useMemo, useState, Fragment } from 'react';
import { Download, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useResourceCostUtilization } from '@/hooks/useReports';
import { useActiveEmployees, useEmployees } from '@/hooks/useEmployees';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveProjects } from '@/hooks/useProjects';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useRoles } from '@/hooks/useRoles';
import { useDebounce } from '@/hooks/useDebounce';
import { reportsApi } from '@/api/reports.api';
import { extractApiError } from '@/services/apiClient';
import { useNotification } from '@/hooks/useNotification';
import { downloadBlob } from '@/utils/download';
import { ROLE_NAMES } from '@/constants/roleHierarchy';
import { formatCurrency } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import MobilePagination from '@/components/common/MobilePagination';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthRangePicker } from '@/components/ui/month-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

const now = new Date();
const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1);

// Sortable static columns per the confirmed contract — dynamic month metrics are never
// sortable (no backend support for that, and it wouldn't mean much for a range of months).
const SORTABLE = {
  EMPLOYEE_NAME: 'employee_name',
  EMPLOYEE_CODE: 'employee_code',
  BU_NAME: 'bu_name',
  CLIENT_NAME: 'client_name',
  PROJECT_NAME: 'project_name',
  SERVICE_PO_NAME: 'service_po_name',
};

// Builds the ordered month-group list — prefers the response's own `period` (authoritative,
// confirms exactly what the backend actually computed) and falls back to the selected
// from/to range so the table still renders before the first response lands. Cross-year ranges
// (Nov 2026 -> Feb 2027) walk correctly since this indexes by year*12+month, never assuming a
// shared year.
const buildMonthRange = (startMonth, startYear, endMonth, endYear) => {
  if (!startMonth || !startYear || !endMonth || !endYear) return [];
  const startIdx = startYear * 12 + (startMonth - 1);
  const endIdx = endYear * 12 + (endMonth - 1);
  if (endIdx < startIdx) return [];
  const spansMultipleYears = startYear !== endYear;
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    months.push({ month, year, key: `${year}-${month}` });
  }
  return months.map((m) => ({
    ...m,
    // Label is derived from the month/year the range walk computed, not hardcoded per-case —
    // the 2-digit year suffix only appears when the whole range spans more than one calendar
    // year, same convention the Excel export uses.
    label: (new Date(m.year, m.month - 1, 1))
      .toLocaleString('en-US', { month: 'short' })
      .toUpperCase() + (spansMultipleYears ? `-${String(m.year).slice(-2)}` : ''),
  }));
};

const monthKey = (monthNumber, year) => `${year}-${monthNumber}`;

// Light pastel per CALENDAR month (index 0 = January) - the same month always gets the same
// colour whatever range is picked, and a range wider than 12 months repeats it. Identical to the
// backend's utils/monthColors.js list so the screen and the Excel export match.
const MONTH_FILL_HEX = [
  'DBEAFE', 'FCE7F3', 'DCFCE7', 'FEF3C7', 'EDE9FE', 'CFFAFE',
  'FFEDD5', 'ECFCCB', 'FFE4E6', 'E0E7FF', 'CCFBF1', 'E2E8F0',
];
const monthFillHex = (month) => MONTH_FILL_HEX[(((month - 1) % 12) + 12) % 12];
// Header cells: the solid pastel with fixed dark text (readable in dark mode too). Body cells: the
// same colour at ~45% alpha so the page's own light/dark background still shows through.
const monthHeaderStyle = (month) => ({ backgroundColor: `#${monthFillHex(month)}`, color: '#1e293b' });
const monthBodyStyle = (month) => ({ backgroundColor: `#${monthFillHex(month)}73` });

const formatHours2dp = (value) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : n.toFixed(2);
};

const formatPercent2dp = (value) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : `${n.toFixed(2)}%`;
};

const th = (...cls) =>
  cn('px-2.5 py-2 text-left text-xs font-semibold border-r border-border whitespace-nowrap last:border-r-0', ...cls);
const td = (...cls) =>
  cn('px-2.5 py-2 text-xs border-r border-border last:border-r-0 align-top', ...cls);

// Sticky column widths — only Emp Code + Emp Name, per the "don't make too many columns
// sticky" guidance; every other static column scrolls with the month blocks.
const CODE_COL_WIDTH = 110;
const NAME_COL_WIDTH = 190;

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort, align }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'ASC' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn('inline-flex items-center gap-1 hover:text-foreground transition-colors', align === 'right' && 'justify-end w-full')}
    >
      {label}
      <Icon className={cn('h-3 w-3 shrink-0', !isActive && 'opacity-40')} />
    </button>
  );
};

// Per-employee, per-month resource cost/utilization across a selectable month range — dynamic
// month-group columns (Hours/Logged Hrs/Projection %/Actual %/Contribution per month), sticky
// Emp Code/Emp Name, server-side Excel export preserving the current filters and month range.
const ResourceCostUtilizationReport = () => {
  const { error: showError } = useNotification();
  const [fromMonthYear, setFromMonthYear] = useState({ month: defaultFrom.getMonth() + 1, year: defaultFrom.getFullYear() });
  const [toMonthYear, setToMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [pmIds, setPmIds] = useState([]);
  const [search, setSearch] = useState('');

  const [sortBy, setSortBy] = useState(SORTABLE.EMPLOYEE_NAME);
  const [sortOrder, setSortOrder] = useState('ASC');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isExporting, setIsExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activeProjects = [] } = useActiveProjects();
  const { data: activeServicePOs = [] } = useActiveServicePOs(true, undefined, scope);

  // Project Manager options: employees currently holding the "Project Manager" role — same
  // derivation the Employee-Master PM assignment feature already uses (role checkbox ->
  // role_id filter) — this app has no separate "PM list" endpoint to call instead.
  const { data: rolesData } = useRoles();
  const allRoles = rolesData?.data ?? [];
  const pmRoleId = allRoles.find((r) => r.role_name === ROLE_NAMES.SERVICE_PO_ADMIN)?.id;
  const { data: pmEmployeesData } = useEmployees(pmRoleId ? { role_id: pmRoleId, status: 'active', limit: 200 } : undefined);
  const pmEmployees = pmEmployeesData?.data ?? [];

  const periodReady = !!(fromMonthYear?.month && fromMonthYear?.year && toMonthYear?.month && toMonthYear?.year)
    && (toMonthYear.year * 12 + toMonthYear.month) >= (fromMonthYear.year * 12 + fromMonthYear.month);

  const params = {
    startMonth: fromMonthYear.month,
    startYear: fromMonthYear.year,
    endMonth: toMonthYear.month,
    endYear: toMonthYear.year,
    page,
    limit,
    sortBy,
    sortOrder,
    ...(debouncedSearch && { search: debouncedSearch }),
    // No "Billed Status" filter control — always request every Service PO regardless of
    // billable status, overriding the backend's own default (which otherwise excludes
    // Centralised/non-billable POs).
    isBillable: 'all',
    // `buId` is always the 'all' sentinel so explicitBuScope always drops the X-Company-Id
    // header, letting `businessUnitIds` narrow the caller's full role reach instead — same
    // convention every other multi-select report on this endpoint family uses.
    buId: ALL_BUS,
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
    ...(employeeIds.length > 0 && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length > 0 && { clientIds: clientIds.join(',') }),
    ...(projectIds.length > 0 && { projectIds: projectIds.join(',') }),
    ...(poIds.length > 0 && { poIds: poIds.join(',') }),
    ...(pmIds.length > 0 && { projectManagerIds: pmIds.join(',') }),
  };

  const { data, isPending, isError, error, refetch } = useResourceCostUtilization(periodReady ? params : undefined);

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const period = data?.data?.period;
  const meta = data?.meta ?? {};
  const showLoading = periodReady && isPending;

  const months = period
    ? buildMonthRange(period.startMonth, period.startYear, period.endMonth, period.endYear)
    : buildMonthRange(fromMonthYear.month, fromMonthYear.year, toMonthYear.month, toMonthYear.year);

  const summaryByKey = new Map(
    (Array.isArray(data?.data?.summary) ? data.data.summary : []).map((s) => [
      monthKey(s.monthNumber, s.year),
      s,
    ])
  );

  const activeFilterCount = [
    entityIds.length > 0, buIds.length > 0, employeeIds.length > 0, clientIds.length > 0,
    projectIds.length > 0, poIds.length > 0, pmIds.length > 0, !!search.trim(),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]); setBuIds([]); setEmployeeIds([]); setClientIds([]);
    setProjectIds([]); setPoIds([]); setPmIds([]); setSearch('');
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  // Server-generated .xlsx (merged month headers + frozen columns already built in) — this
  // just triggers the download with the SAME filters/range the screen currently shows, so what
  // the user sees and what they download always match. `page`/`limit` are dropped: the export
  // endpoint always returns the full filtered set regardless.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { page: _page, limit: _limit, ...exportParams } = params;
      const result = await reportsApi.exportResourceCostUtilization(exportParams);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Consolidated Monthly Report"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee, client, project, SPO or PM…"
              className="w-full sm:w-full md:w-72"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            <Button variant="outline" size="sm" className="h-[clamp(1.875rem,2vw,2.25rem)]" onClick={handleExport} disabled={isExporting}>
              <Download className="mr-1.5 h-4 w-4" />{isExporting ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[520px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[clamp(0.5rem,0.8vw,0.75rem)] w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Month Range <span className="text-destructive">*</span></Label>
          <MonthRangePicker
            value={{ from: fromMonthYear, to: toMonthYear }}
            onChange={({ from, to }) => {
              if (from) setFromMonthYear(from);
              if (to) setToMonthYear(to);
              setPage(1);
            }}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Employee</Label>
          <MultiSelect
            options={activeEmployees.map((e) => ({ label: e.full_name, value: String(e.id) }))}
            value={employeeIds}
            onValueChange={(v) => { setEmployeeIds(v); setPage(1); }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="w-full"
          />
        </div>

        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setEmployeeIds([]); setClientIds([]); setProjectIds([]); setPoIds([]); setPmIds([]); setPage(1); }} />
        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setEmployeeIds([]); setClientIds([]); setProjectIds([]); setPoIds([]); setPmIds([]); setPage(1); }} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Client</Label>
          <MultiSelect
            options={activeClients.map((c) => ({ label: c.client_name, value: String(c.id) }))}
            value={clientIds}
            onValueChange={(v) => { setClientIds(v); setPage(1); }}
            placeholder="All"
            searchPlaceholder="Search client..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Project</Label>
          <MultiSelect
            options={activeProjects.map((p) => ({ label: p.project_name, value: String(p.id) }))}
            value={projectIds}
            onValueChange={(v) => { setProjectIds(v); setPage(1); }}
            placeholder="All"
            searchPlaceholder="Search project..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">SPO</Label>
          <MultiSelect
            options={activeServicePOs.map((po) => ({
              label: po.service_po_code ? `${po.service_po_name} (${po.service_po_code})` : po.service_po_name,
              value: String(po.id),
            }))}
            value={poIds}
            onValueChange={(v) => { setPoIds(v); setPage(1); }}
            placeholder="All"
            searchPlaceholder="Search SPO..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Project Manager</Label>
          <MultiSelect
            options={pmEmployees.map((e) => ({ label: e.full_name, value: String(e.id) }))}
            value={pmIds}
            onValueChange={(v) => { setPmIds(v); setPage(1); }}
            placeholder="All"
            searchPlaceholder="Search PM..."
            className="w-full"
          />
        </div>

      </FilterPanel>

      {isError && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{extractApiError(error) || 'Unable to load report data.'}</span>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />Retry
          </Button>
        </div>
      )}

      {!periodReady ? (
        <EmptyState title="Select a valid month range" description="Start month cannot be after end month." />
      ) : showLoading ? (
        <div className="space-y-2 rounded-lg border p-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[clamp(1.875rem,2vw,2.25rem)] w-full" />)}
        </div>
      ) : !isError && records.length === 0 ? (
        <EmptyState
          title="No records match the selected filters."
          action={activeFilterCount > 0 ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : !isError ? (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="min-w-max w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-background">
                  <tr className="border-b bg-muted/60">
                    <th colSpan={2} className="sticky left-0 z-30 bg-muted" />
                    <th colSpan={9} className="border-r border-border" />
                    {months.map((m) => (
                      <th
                        key={m.key}
                        colSpan={8}
                        style={monthHeaderStyle(m.month)}
                        className="border-r border-border px-3 py-1.5 text-center text-xs font-semibold"
                      >
                        {m.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b bg-muted/40">
                    <th className={th('sticky left-0 z-30 bg-muted')} style={{ width: CODE_COL_WIDTH, minWidth: CODE_COL_WIDTH }}>
                      <SortableHeader label="Emp Code" column={SORTABLE.EMPLOYEE_CODE} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </th>
                    <th
                      className={th('sticky z-30 bg-muted border-r border-border shadow-[1px_0_0_0_var(--border)] overflow-hidden text-ellipsis whitespace-nowrap')}
                      style={{ left: CODE_COL_WIDTH, width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH, maxWidth: NAME_COL_WIDTH }}
                    >
                      <SortableHeader label="Emp Name" column={SORTABLE.EMPLOYEE_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </th>
                    <th className={th('w-[110px] text-right')}>Expected CTC</th>
                    <th className={th('w-[110px] text-right')}>Monthly CTC</th>
                    <th className={th('min-w-[140px]')}>
                      <SortableHeader label="BU Name" column={SORTABLE.BU_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </th>
                    <th className={th('min-w-[140px]')}>Sub BU Name</th>
                    <th className={th('w-[100px]')}>Billed Status</th>
                    <th className={th('min-w-[160px]')}>Project Manager</th>
                    <th className={th('min-w-[140px]')}>
                      <SortableHeader label="Client" column={SORTABLE.CLIENT_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </th>
                    <th className={th('min-w-[140px]')}>
                      <SortableHeader label="Project" column={SORTABLE.PROJECT_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </th>
                    <th className={th('min-w-[140px]')}>
                      <SortableHeader label="SPO" column={SORTABLE.SERVICE_PO_NAME} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    </th>
                    {months.map((m) => (
                      <Fragment key={m.key}>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[75px] text-right')}>Hours</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[90px] text-right')}>Logged Hrs</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[90px] text-right text-muted-foreground')}>Original Logged Hrs</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[100px] text-right')}>Projection %</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[100px] text-right')}>Actual %</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[100px] text-right text-muted-foreground')}>Original Actual %</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[110px] text-right')}>Contribution</th>
                        <th style={monthHeaderStyle(m.month)} className={th('w-[110px] text-right text-muted-foreground')}>Original Contribution</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((row, i) => {
                    const monthsByKey = new Map((row.months ?? []).map((m) => [monthKey(m.monthNumber, m.year), m]));
                    const pmList = row.projectManagers ?? [];
                    // One row per employee+ServicePO mapping — the same employeeId repeats
                    // across rows (Training/On Bench/Leaves/actual projects all as separate
                    // rows), so employeeId ALONE is not a unique key. Duplicate keys made React
                    // misreconcile rows across filter changes — stale employee/BU text kept
                    // rendering from a previous, differently-filtered response even though the
                    // correct data had already arrived (confirmed via a real "two children with
                    // the same key" console error).
                    return (
                      <tr key={`${row.employeeId ?? 'na'}-${row.servicePoId ?? i}`} className="group hover:bg-muted/30 transition-colors">
                        <td
                          className={td('sticky left-0 z-10 bg-background font-mono group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 transition-colors')}
                          style={{ width: CODE_COL_WIDTH, minWidth: CODE_COL_WIDTH }}
                        >
                          {row.employeeCode ?? '—'}
                        </td>
                        <td
                          className={td('sticky z-10 bg-background border-r border-border shadow-[1px_0_0_0_var(--border)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 transition-colors overflow-hidden text-ellipsis whitespace-nowrap font-medium')}
                          style={{ left: CODE_COL_WIDTH, width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH, maxWidth: NAME_COL_WIDTH }}
                        >
                          {row.employeeName ?? '—'}
                        </td>
                        {/* Expected CTC / Billed Status: the API always sends these null — no
                            data source exists yet, so they render as a plain blank cell, not a
                            loading/error/missing-data state (spec confirmed both are user-filled
                            manually, e.g. in the Excel export, not here). */}
                        <td className={td('text-right text-muted-foreground')}>—</td>
                        <td className={td('text-right tabular-nums')}>
                          {row.monthlyCtc != null ? formatCurrency(row.monthlyCtc) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={td('truncate max-w-[140px]')} title={row.buName}>{row.buName || <span className="text-muted-foreground">—</span>}</td>
                        <td className={td('truncate max-w-[140px]')} title={row.subBuName ?? ''}>
                          {row.subBuName || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={td('text-muted-foreground')}>—</td>
                        <td className={td('min-w-[160px]')}>
                          {pmList.length > 0 ? pmList.join(', ') : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={td('truncate max-w-[140px]')} title={row.client}>{row.client || <span className="text-muted-foreground">—</span>}</td>
                        <td className={td('truncate max-w-[140px]')} title={row.project}>{row.project || <span className="text-muted-foreground">—</span>}</td>
                        <td className={td('truncate max-w-[140px]')} title={row.spo}>{row.spo || <span className="text-muted-foreground">—</span>}</td>
                        {months.map((m) => {
                          const cell = monthsByKey.get(m.key);
                          return (
                            <Fragment key={m.key}>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>{formatHours2dp(cell?.cappedHours)}</td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>{formatHours2dp(cell?.loggedHours)}</td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums text-muted-foreground')}>{formatHours2dp(cell?.originalLoggedHours)}</td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>{formatPercent2dp(cell?.projectionPercentage)}</td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>{formatPercent2dp(cell?.actualPercentage)}</td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums text-muted-foreground')}>{formatPercent2dp(cell?.originalActualPercentage)}</td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums font-medium')}>
                                {cell?.contribution != null ? formatCurrency(cell.contribution) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums text-muted-foreground')}>
                                {cell?.originalContribution != null ? formatCurrency(cell.originalContribution) : '—'}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {summaryByKey.size > 0 && (
                  <tfoot className="sticky bottom-0 z-10 border-t-2 border-border bg-muted/80 font-semibold">
                    <tr>
                      <td colSpan={2} className={td('sticky left-0 z-10 bg-muted/90 text-xs font-semibold')} style={{ minWidth: CODE_COL_WIDTH + NAME_COL_WIDTH }}>
                        Page Totals
                      </td>
                      <td colSpan={9} className={td()} />
                      {months.map((m) => {
                        const s = summaryByKey.get(m.key);
                        return (
                          <Fragment key={m.key}>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>{formatHours2dp(s?.totalCappedHours)}</td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>{formatHours2dp(s?.totalLoggedHours)}</td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums text-muted-foreground')}>{formatHours2dp(s?.originalTotalLoggedHours)}</td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>—</td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>—</td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums text-muted-foreground')}>—</td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums')}>
                              {s?.totalContribution != null ? formatCurrency(s.totalContribution) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td style={monthBodyStyle(m.month)} className={td('text-right tabular-nums text-muted-foreground')}>
                              {s?.originalTotalContribution != null ? formatCurrency(s.originalTotalContribution) : '—'}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {meta.total != null && (
            <>
              <div className="shrink-0 mt-3 hidden items-center justify-between gap-2 md:flex">
                <p className="text-xs text-muted-foreground">
                  {meta.total} employee{meta.total !== 1 ? 's' : ''} · page {meta.page ?? page} of {meta.totalPages ?? 1}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                    <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                      <SelectTrigger className="h-7 text-xs bg-white w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="sm" className="h-7 px-2 text-xs"
                      disabled={!meta.hasPrev && (meta.page ?? page) <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground px-1">{meta.page ?? page} / {meta.totalPages ?? 1}</span>
                    <Button
                      variant="outline" size="sm" className="h-7 px-2 text-xs"
                      disabled={meta.hasNext === false || (meta.page ?? page) >= (meta.totalPages ?? 1)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
              <MobilePagination
                className="shrink-0 mt-3 md:hidden"
                page={meta.page ?? page}
                totalPages={meta.totalPages ?? 1}
                total={meta.total}
                limit={meta.limit ?? limit}
                itemLabel="employee"
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default ResourceCostUtilizationReport;
