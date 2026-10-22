import { useState, useMemo, useEffect, Fragment } from 'react';
import dayjs from 'dayjs';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, FolderKanban, ChevronDown, ChevronRight, ChevronLeft, Eye } from 'lucide-react';
import { useProjectTimesheet } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { useNotification } from '@/hooks/useNotification';
import { downloadBlob } from '@/utils/download';
import { formatDate, getStatusColor } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterPanel from '@/components/common/FilterPanel';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import DataTable from '@/components/common/DataTable';
import EmptyState from '@/components/common/EmptyState';
import MobilePagination from '@/components/common/MobilePagination';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const now = dayjs();
const columnHelper = createColumnHelper();

const formatHours2dp = (value) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : n.toFixed(2);
};

// KPI chips — same colored-pill summary style as MonthlyResourceUtilization's own stat row
// (flex-wrap pills on desktop, a 2-col KPI grid on mobile), so this report's header reads
// consistently with the rest of the Reports module instead of the flatter gray tile it used before.
const STAT_TONES = {
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  teal: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
  orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

const STAT_TILES = [
  { key: 'entry_count', label: 'Entries', tone: 'blue', format: (v) => v ?? '—' },
  { key: 'employee_count', label: 'Employees', tone: 'cyan', format: (v) => v ?? '—' },
  { key: 'logged_hours', label: 'Logged Hours', tone: 'emerald', format: formatHours2dp },
  { key: 'leave_hours', label: 'Leave Hours', tone: 'amber', format: formatHours2dp },
  { key: 'approved_hours', label: 'Approved Hours', tone: 'teal', format: formatHours2dp },
  { key: 'pending_hours', label: 'Pending Hours', tone: 'orange', format: formatHours2dp },
  { key: 'rejected_hours', label: 'Rejected Hours', tone: 'rose', format: formatHours2dp },
];

// Fluid clamp() sizing (see ui/button.jsx's own comment) instead of a fixed px-3/py-1.5/text-xs,
// matching the same treatment already applied to MonthlyResourceUtilization's own summary chips.
const StatChips = ({ totals }) => (
  <>
    {/* Desktop — flex-wrap pills */}
    <div className="hidden shrink-0 flex-wrap gap-[clamp(0.4rem,0.7vw,0.75rem)] md:flex">
      {STAT_TILES.map(({ key, label, tone, format }) => (
        <div key={key} className={`rounded-md border px-[clamp(0.5rem,0.7vw,0.75rem)] py-[clamp(0.25rem,0.4vw,0.375rem)] text-[clamp(0.6875rem,0.75vw,0.75rem)] whitespace-nowrap ${STAT_TONES[tone]}`}>
          {label}&nbsp;
          <span className="font-semibold tabular-nums">{format(totals[key])}</span>
        </div>
      ))}
    </div>
    {/* Mobile — compact 2-column KPI grid */}
    <div className="grid shrink-0 grid-cols-2 gap-2 md:hidden">
      {STAT_TILES.map(({ key, label, tone, format }) => (
        <div key={key} className={`rounded-lg border px-[clamp(0.5rem,0.7vw,0.75rem)] py-[clamp(0.375rem,0.5vw,0.5rem)] ${STAT_TONES[tone]}`}>
          <p className="text-[clamp(0.6875rem,0.75vw,0.75rem)]">{label}</p>
          <p className="text-[clamp(0.75rem,0.85vw,0.875rem)] font-semibold tabular-nums">{format(totals[key])}</p>
        </div>
      ))}
    </div>
  </>
);

// Desktop Rows-per-page + Prev/Next footer (mirrors DataTable's own pagination markup) plus a
// mobile MobilePagination row — shared by the two client-side-paginated summary tabs below, since
// their data arrives as one full unpaginated array and can't reuse DataTable's server-side paging.
const SummaryPaginationFooter = ({ page, limit, total, onPageChange, onLimitChange, itemLabel }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <>
      <div className="mt-3 hidden shrink-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between md:flex">
        <p className="text-xs text-muted-foreground">
          Showing {total === 0 ? 0 : ((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total} {itemLabel}(s)
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">Rows per page</span>
            <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
              <SelectTrigger className="h-8 w-16 bg-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <MobilePagination
        className="mt-3 shrink-0 md:hidden"
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        itemLabel={itemLabel}
        onPrev={() => onPageChange(page - 1)}
        onNext={() => onPageChange(page + 1)}
      />
    </>
  );
};

const ProjectWiseTimesheetReport = () => {
  const { error: showError } = useNotification();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState('month'); // 'month' | 'range'
  const [monthYear, setMonthYear] = useState({ month: now.month() + 1, year: now.year() });
  const [dateRange, setDateRange] = useState(null); // { startDate, endDate }

  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [poIds, setPoIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [approvalStatus, setApprovalStatus] = useState([]);
  const [includeLeave, setIncludeLeave] = useState(true);
  const [sortBy, setSortBy] = useState('project');

  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'projects' | 'employees'
  // Summary arrays are a heavier payload than the paged details list, so they're only ever asked
  // for once a summary tab is actually opened (or the user hits Apply) — not on every keystroke
  // while still on Details.
  const [summaryRequested, setSummaryRequested] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exportingFormat, setExportingFormat] = useState(null);
  const [moduleTaskRow, setModuleTaskRow] = useState(null);

  const scope = useMemo(() => ({ entityIds, businessUnitIds: buIds }), [entityIds, buIds]);
  const { data: activeClients = [] } = useActiveClients(scope);
  const { data: activeServicePOs = [] } = useActiveServicePOs(true, undefined, scope);
  const { data: activeEmployees = [] } = useActiveEmployees(undefined, scope);

  // Project/Service PO cascade — each active Service PO already nests both its Project and its
  // Client (see api/servicePOs.api.js), so that one list is enough to derive "Project follows the
  // chosen Clients" and "Service PO follows the chosen Projects" without a second round-trip per
  // level. A Project/Client with no active Service PO at all can't appear here — acceptable for a
  // timesheet report, since a logged entry always has a Service PO behind it anyway.
  const spoList = useMemo(() => (Array.isArray(activeServicePOs) ? activeServicePOs : []), [activeServicePOs]);

  const spoByClient = useMemo(
    () => (clientIds.length ? spoList.filter((po) => clientIds.includes(String(po.client?.id))) : spoList),
    [spoList, clientIds]
  );

  const projectOptions = useMemo(() => {
    const seen = new Map();
    spoByClient.forEach((po) => {
      if (po.project?.id != null && !seen.has(String(po.project.id))) {
        seen.set(String(po.project.id), po.project.project_name);
      }
    });
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [spoByClient]);

  const spoByProject = useMemo(
    () => (projectIds.length ? spoByClient.filter((po) => projectIds.includes(String(po.project?.id))) : spoByClient),
    [spoByClient, projectIds]
  );

  const poOptions = useMemo(
    () => spoByProject.map((po) => ({
      value: String(po.id),
      label: po.service_po_code ? `${po.service_po_name} (${po.service_po_code})` : po.service_po_name,
    })),
    [spoByProject]
  );

  const clientOptions = useMemo(
    () => activeClients.map((c) => ({ value: String(c.id), label: c.client_name })),
    [activeClients]
  );

  const employeeOptions = useMemo(
    () => activeEmployees.map((e) => ({ value: String(e.id), label: `${e.full_name} (${e.employee_code})` })),
    [activeEmployees]
  );

  // Narrowing a broader level drops any lower-level picks that fell outside the new option set —
  // same "reset what no longer applies" rule EmployeeWorkLogHoursSummaryReport's employee dropdown
  // already follows for its own single BU-scoped selection.
  useEffect(() => {
    const valid = new Set(projectOptions.map((o) => o.value));
    setProjectIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIds]);

  useEffect(() => {
    const valid = new Set(poOptions.map((o) => o.value));
    setPoIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIds, projectIds]);

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = useMemo(() => {
    const p = {
      page,
      limit,
      sort_by: sortBy,
      approval_status: approvalStatus.length > 0 ? approvalStatus.join(',') : 'all',
      include_leave: includeLeave,
      // Always sent (even with nothing narrowed) so getReport drops the navbar's active-BU
      // header and scopes by the caller's full role reach instead — entity_ids/business_unit_ids
      // below narrow it further as real filters, same convention ResourceCostUtilizationReport
      // uses for this exact reason (see explicitBuScope's own comment for why `buId: undefined`
      // would NOT have this effect).
      buId: ALL_BUS,
    };
    if (periodMode === 'month') {
      p.month = monthYear.month;
      p.year = monthYear.year;
    } else if (dateRange?.startDate && dateRange?.endDate) {
      p.start_date = dateRange.startDate;
      p.end_date = dateRange.endDate;
    }
    if (entityIds.length) p.entity_ids = entityIds.join(',');
    if (buIds.length) p.business_unit_ids = buIds.join(',');
    if (clientIds.length) p.client_ids = clientIds.join(',');
    if (projectIds.length) p.project_ids = projectIds.join(',');
    if (poIds.length) p.service_po_ids = poIds.join(',');
    if (employeeIds.length) p.employee_ids = employeeIds.join(',');
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    if (summaryRequested) p.include_summary = true;
    return p;
  }, [
    page, limit, sortBy, approvalStatus, includeLeave, periodMode, monthYear, dateRange,
    entityIds, buIds, clientIds, projectIds, poIds, employeeIds, debouncedSearch, summaryRequested,
  ]);

  const { data, isLoading, isError } = useProjectTimesheet(periodReady ? params : undefined);

  const records = data?.data?.records ?? [];
  const totals = data?.data?.totals ?? {};
  const summary = data?.data?.summary ?? {};
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    periodMode !== 'month',
    entityIds.length > 0,
    buIds.length > 0,
    clientIds.length > 0,
    projectIds.length > 0,
    poIds.length > 0,
    employeeIds.length > 0,
    approvalStatus.length > 0,
    !includeLeave,
    sortBy !== 'project',
    !!search.trim(),
  ].filter(Boolean).length;

  const handleReset = () => {
    setPeriodMode('month');
    setMonthYear({ month: now.month() + 1, year: now.year() });
    setDateRange(null);
    setEntityIds([]);
    setBuIds([]);
    setClientIds([]);
    setProjectIds([]);
    setPoIds([]);
    setEmployeeIds([]);
    setSearch('');
    setApprovalStatus([]);
    setIncludeLeave(true);
    setSortBy('project');
    setPage(1);
  };

  const handleApply = () => {
    setSummaryRequested(true);
    setPage(1);
    setFiltersOpen(false);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'details') setSummaryRequested(true);
  };

  // Downloads reuse the SAME filters the screen currently shows (no page/limit/include_summary —
  // the export endpoint always returns the full filtered detail set plus both summary sheets).
  const handleDownload = async (format) => {
    setExportingFormat(format);
    try {
      const { page: _p, limit: _l, include_summary: _is, ...exportParams } = params;
      const result = await reportsApi.downloadProjectTimesheet(exportParams, format);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setExportingFormat(null);
    }
  };

  const columns = useMemo(() => [
    columnHelper.accessor('employee_code', { header: 'Employee ID', size: 110, cell: (i) => <span className="font-mono text-xs text-muted-foreground">{i.getValue() || '—'}</span> }),
    columnHelper.accessor('employee_name', { header: 'Employee Name', size: 180, cell: (i) => <span className="text-xs font-medium">{i.getValue() || '—'}</span> }),
    columnHelper.accessor('date', { header: 'Date', size: 110, cell: (i) => <span className="whitespace-nowrap text-xs">{formatDate(i.getValue(), 'DD-MMM-YYYY')}</span> }),
    columnHelper.accessor('day', { header: 'Day', size: 100, cell: (i) => <span className="text-xs text-muted-foreground">{i.getValue() || '—'}</span> }),
    columnHelper.accessor('client_name', { header: 'Client', size: 160, cell: (i) => <span className="block max-w-[150px] truncate text-xs" title={i.getValue()}>{i.getValue() || '—'}</span> }),
    columnHelper.accessor('project_name', {
      header: 'Project',
      size: 170,
      cell: (i) => {
        const row = i.row.original;
        return (
          <div className="flex items-center gap-1.5">
            <span className="max-w-[130px] truncate text-xs" title={row.project_name}>{row.project_name || '—'}</span>
            {row.work_type === 'Leave' && <Badge variant="secondary" className="shrink-0 text-[10px]">Leave</Badge>}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'service_po',
      header: 'Service PO',
      size: 170,
      cell: ({ row }) => {
        const label = [row.original.service_po_name, row.original.service_po_code].filter(Boolean).join(' - ');
        return <span className="block max-w-[160px] truncate text-xs" title={label}>{label || '—'}</span>;
      },
    }),
    columnHelper.display({
      id: 'module_task',
      header: 'Module / Task',
      size: 100,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => setModuleTaskRow(row.original)}
        >
          <Eye className="h-3.5 w-3.5" />View
        </Button>
      ),
    }),
    columnHelper.accessor('logged_hours', { header: 'Logged Hours', meta: { align: 'right' }, size: 110, cell: (i) => <span className="block text-right text-xs font-semibold tabular-nums">{formatHours2dp(i.getValue())}</span> }),
    columnHelper.accessor('leave_hours', { header: 'Leave Hours', meta: { align: 'right' }, size: 100, cell: (i) => <span className="block text-right text-xs tabular-nums">{formatHours2dp(i.getValue())}</span> }),
    columnHelper.accessor('description', {
      header: 'Activity / Work Description',
      size: 260,
      cell: (i) => {
        const row = i.row.original;
        return (
          <div className="max-w-[260px]">
            <p className="line-clamp-2 text-xs" title={row.description}>{row.description || '—'}</p>
            {row.time_slots && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.time_slots}>{row.time_slots}</p>}
          </div>
        );
      },
    }),
    columnHelper.accessor('project_managers', { header: 'Project Manager', size: 160, cell: (i) => <span className="block max-w-[150px] truncate text-xs" title={i.getValue() || ''}>{i.getValue() || '—'}</span> }),
    columnHelper.accessor('approval_status', {
      header: 'Approval Status',
      size: 170,
      cell: (i) => {
        const row = i.row.original;
        return (
          <Badge
            variant={getStatusColor(row.approval_status)}
            className="text-[10px] whitespace-nowrap"
            title={row.approval_status === 'rejected' ? (row.rejection_remark ?? '') : undefined}
          >
            {row.approval_status_label || row.approval_status}
          </Badge>
        );
      },
    }),
  ], []);

  const periodLabel = periodMode === 'month'
    ? formatDate(`${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`, 'MMMM YYYY')
    : (dateRange?.startDate && dateRange?.endDate
      ? `${formatDate(dateRange.startDate)} – ${formatDate(dateRange.endDate)}`
      : 'Select a date range');

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Project-Wise Timesheet Report"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search…"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            <Button variant="outline" size="sm" className="h-[clamp(1.875rem,2vw,2.25rem)]" onClick={() => handleDownload('excel')} disabled={!!exportingFormat}>
              <Download className="mr-1.5 h-4 w-4" />{exportingFormat === 'excel' ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[560px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[clamp(0.5rem,0.8vw,0.75rem)] w-full"
        onClear={handleReset}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs value={periodMode} onValueChange={(v) => { setPeriodMode(v); setPage(1); }}>
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white">Month</TabsTrigger>
              <TabsTrigger value="range" className="text-xs font-semibold data-[state=active]:bg-white">Date Range</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>{periodMode === 'month' ? 'Month & Year' : 'Date Range'}</Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(v) => { if (v) { setMonthYear(v); setPage(1); } }}
              clearable={false}
              className="w-full text-sm"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={(v) => { setDateRange(v); setPage(1); }}
              className="w-full"
            />
          )}
        </div>

        <EntityFilter multiple labelClassName={FILTER_LABEL} value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); setClientIds([]); setProjectIds([]); setPoIds([]); setEmployeeIds([]); setPage(1); }} />
        <BusinessUnitFilter multiple labelClassName={FILTER_LABEL} value={buIds} entityId={entityIds} onChange={(v) => { setBuIds(v); setClientIds([]); setProjectIds([]); setPoIds([]); setEmployeeIds([]); setPage(1); }} />

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <MultiSelect options={clientOptions} value={clientIds} onValueChange={(v) => { setClientIds(v); setPage(1); }} placeholder="All Clients" searchPlaceholder="Search client..." className="w-full" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Project</Label>
          <MultiSelect options={projectOptions} value={projectIds} onValueChange={(v) => { setProjectIds(v); setPage(1); }} placeholder="All Projects" searchPlaceholder="Search project..." className="w-full" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service PO</Label>
          <MultiSelect options={poOptions} value={poIds} onValueChange={(v) => { setPoIds(v); setPage(1); }} placeholder="All Service POs" searchPlaceholder="Search Service PO..." className="w-full" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <MultiSelect options={employeeOptions} value={employeeIds} onValueChange={(v) => { setEmployeeIds(v); setPage(1); }} placeholder="All Employees" searchPlaceholder="Search employee..." className="w-full" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Approval Status</Label>
          <MultiSelect
            options={[
              { label: 'Pending', value: 'pending' },
              { label: 'Approved', value: 'approved' },
              { label: 'Rejected', value: 'rejected' },
            ]}
            value={approvalStatus}
            onValueChange={(v) => { setApprovalStatus(v); setPage(1); }}
            placeholder="All"
            searchPlaceholder="Search status..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Sort</Label>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
            <SelectTrigger className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project-wise</SelectItem>
              <SelectItem value="employee">Employee-wise</SelectItem>
              <SelectItem value="date">Date-wise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col justify-end gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={includeLeave} onCheckedChange={(v) => { setIncludeLeave(!!v); setPage(1); }} />
            Include leave
          </label>
          <p className="text-[11px] text-muted-foreground">
            With a project filter, also shows leave taken by the same employees in the period.
          </p>
        </div>

        <div className="flex items-end gap-2 xl:col-span-2">
          <Button size="sm" className="h-[clamp(1.875rem,2vw,2.25rem)]" onClick={handleApply}>Apply</Button>
          <Button variant="outline" size="sm" className="h-[clamp(1.875rem,2vw,2.25rem)]" onClick={handleReset}>Reset</Button>
        </div>
      </FilterPanel>

      {!periodReady ? (
        <EmptyState title="Select a period" description="Pick a month, or a complete date range, to run this report." />
      ) : (
        <>
          <StatChips totals={totals} />

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="details">Timesheet Details</TabsTrigger>
              <TabsTrigger value="projects">Project Summary</TabsTrigger>
              <TabsTrigger value="employees">Employee Summary</TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === 'details' && (
            <DataTable
              columns={columns}
              data={records}
              isLoading={isLoading}
              mobileCards
              emptyState={
                isError ? (
                  <div className="p-6 text-center text-sm text-destructive">Unable to load the report. Please try again.</div>
                ) : (
                  <EmptyState title="No timesheet entries for the selected filters." />
                )
              }
              pagination={{ page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? records.length }}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectSummaryTab rows={summary.projects ?? []} isLoading={isLoading && summaryRequested} />
          )}

          {activeTab === 'employees' && (
            <EmployeeSummaryTab rows={summary.employees ?? []} isLoading={isLoading && summaryRequested} />
          )}
        </>
      )}

      <Dialog open={!!moduleTaskRow} onOpenChange={(open) => { if (!open) setModuleTaskRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Module / Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Module</p>
              <p className="mt-0.5 whitespace-pre-wrap">{moduleTaskRow?.module || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Task</p>
              <p className="mt-0.5 whitespace-pre-wrap">{moduleTaskRow?.task || '—'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Project Summary — summary.projects[] is one row per Project + Service PO + Employee; grouped
// visually into Project -> Service PO -> Employee rows rather than shown flat, since a project
// with several Service POs (each with their own team) reads as one indistinct block otherwise.
// Each project group starts collapsed (its header still shows the project's own rolled-up
// totals) and only renders its Service PO / employee tables once expanded — same
// chevron-toggle-a-Set-of-keys pattern EmployeeProjectHoursReport's hierarchy tree already uses.
// Groups are paginated (not the flattened rows) since that's the unit the collapse acts on.
const ProjectSummaryTab = ({ rows, isLoading }) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  const groups = useMemo(() => {
    const byProject = new Map();
    rows.forEach((r) => {
      const projectKey = `${r.client_name ?? ''}|${r.project_name ?? ''}`;
      if (!byProject.has(projectKey)) {
        byProject.set(projectKey, { key: projectKey, client_name: r.client_name, project_name: r.project_name, byPo: new Map() });
      }
      const project = byProject.get(projectKey);
      const poKey = `${r.service_po_code ?? ''}|${r.service_po_name ?? ''}`;
      if (!project.byPo.has(poKey)) {
        project.byPo.set(poKey, { service_po_code: r.service_po_code, service_po_name: r.service_po_name, rows: [] });
      }
      project.byPo.get(poKey).rows.push(r);
    });
    return Array.from(byProject.values()).map((project) => {
      const totals = { logged_hours: 0, approved_hours: 0, pending_hours: 0, rejected_hours: 0 };
      const employees = new Set();
      project.byPo.forEach((po) => po.rows.forEach((r) => {
        totals.logged_hours += Number(r.logged_hours) || 0;
        totals.approved_hours += Number(r.approved_hours) || 0;
        totals.pending_hours += Number(r.pending_hours) || 0;
        totals.rejected_hours += Number(r.rejected_hours) || 0;
        employees.add(r.employee_code ?? r.employee_name);
      }));
      return { ...project, totals, employeeCount: employees.size };
    });
  }, [rows]);

  useEffect(() => { setPage(1); }, [rows.length]);

  const toggleProject = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[clamp(1.875rem,2vw,2.25rem)] w-full" />)}
      </div>
    );
  }
  if (groups.length === 0) {
    return <EmptyState title="No timesheet entries for the selected filters." />;
  }

  const totalPages = Math.max(1, Math.ceil(groups.length / limit));
  const pageGroups = groups.slice((page - 1) * limit, page * limit);

  return (
    // No `flex-1` here (nor on the bordered box below) — matching the `details` tab's own
    // DataTable, which never stretches to fill leftover page height either. Giving this box
    // `flex-1` made it grow to fill all remaining vertical space even for a couple of collapsed
    // project rows, leaving a big blank gap inside the border above the pagination footer.
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-auto rounded-lg border">
        {pageGroups.map((project) => {
          const isOpen = expandedKeys.has(project.key);
          return (
            <div key={project.key} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => toggleProject(project.key)}
                className="flex w-full flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-muted/60"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-semibold">{project.project_name || '—'}</span>
                <span className="text-xs text-muted-foreground">· {project.client_name || '—'}</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{project.employeeCount} employee(s)</span>
                  <span className="font-semibold tabular-nums text-foreground">{formatHours2dp(project.totals.logged_hours)} hrs</span>
                </span>
              </button>
              {isOpen && Array.from(project.byPo.values()).map((po, pi) => (
                <div key={pi} className="pl-4">
                  <div className="bg-muted/15 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    {[po.service_po_name, po.service_po_code].filter(Boolean).join(' - ') || '—'}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-slate-50">
                        <TableHead className="whitespace-nowrap text-xs">Employee</TableHead>
                        <TableHead className="whitespace-nowrap text-right text-xs">Days Logged</TableHead>
                        <TableHead className="whitespace-nowrap text-right text-xs">Logged Hours</TableHead>
                        <TableHead className="whitespace-nowrap text-right text-xs">Approved</TableHead>
                        <TableHead className="whitespace-nowrap text-right text-xs">Pending</TableHead>
                        <TableHead className="whitespace-nowrap text-right text-xs">Rejected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {po.rows.map((r, ri) => (
                        <TableRow key={ri} className="hover:bg-muted/40">
                          <TableCell className="text-xs">
                            {r.employee_name} <span className="font-mono text-muted-foreground">({r.employee_code})</span>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{r.days_logged ?? '—'}</TableCell>
                          <TableCell className="text-right text-xs font-semibold tabular-nums">{formatHours2dp(r.logged_hours)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.approved_hours)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.pending_hours)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.rejected_hours)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <SummaryPaginationFooter
        page={page}
        limit={limit}
        total={groups.length}
        onPageChange={(p) => setPage(Math.min(Math.max(p, 1), totalPages))}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
        itemLabel="project"
      />
    </div>
  );
};

const EmployeeSummaryTab = ({ rows, isLoading }) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => { setPage(1); }, [rows.length]);

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[clamp(1.875rem,2vw,2.25rem)] w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState title="No timesheet entries for the selected filters." />;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const pageRows = rows.slice((page - 1) * limit, page * limit);

  return (
    // See ProjectSummaryTab's identical comment — no `flex-1` so a short page of rows doesn't
    // stretch the bordered box to fill the remaining page height.
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_3px_0_rgb(0,0,0,0.1)]">
            <TableRow className="hover:bg-transparent border-b bg-slate-50">
              <TableHead className="whitespace-nowrap text-xs">Employee</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Days Logged</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Service POs</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Logged Hours</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Leave Hours</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Total Hours</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Approved</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Pending</TableHead>
              <TableHead className="whitespace-nowrap text-right text-xs">Rejected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r, i) => (
              <TableRow key={i} className="hover:bg-muted/40">
                <TableCell className="text-xs">
                  {r.employee_name} <span className="font-mono text-muted-foreground">({r.employee_code})</span>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.days_logged ?? '—'}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.service_po_count ?? '—'}</TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">{formatHours2dp(r.logged_hours)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.leave_hours)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.total_hours)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.approved_hours)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.pending_hours)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatHours2dp(r.rejected_hours)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <SummaryPaginationFooter
        page={page}
        limit={limit}
        total={rows.length}
        onPageChange={(p) => setPage(Math.min(Math.max(p, 1), totalPages))}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
        itemLabel="employee"
      />
    </div>
  );
};

export default ProjectWiseTimesheetReport;
