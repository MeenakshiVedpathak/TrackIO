import { useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { Download } from 'lucide-react';
import { useTeamLeadEmployeeProjectHours, useTeamLeadEmployeeProjectHoursFilterOptions } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { useNotification } from '@/hooks/useNotification';
import { downloadBlob } from '@/utils/download';
import { formatDate } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterPanel from '@/components/common/FilterPanel';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import SearchInput from '@/components/common/SearchInput';
import DataTable from '@/components/common/DataTable';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const now = dayjs();
const columnHelper = createColumnHelper();

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Synced', value: 'synced' },
];

// "Synced" means the entry is approved and already moved into the official timesheet — a
// distinct color from Approved's green (per spec) so the two don't read as the same state.
const STATUS_BADGE_VARIANT = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  synced: 'info',
};

const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  synced: 'Synced',
};

const formatHours2dp = (value) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : n.toFixed(2);
};

const is403 = (err) => err?.response?.status === 403;

const columns = [
  columnHelper.accessor('employee_name', {
    id: 'employee',
    header: 'Employee Name',
    size: 190,
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" title={row.employee_name}>{row.employee_name || '—'}</p>
          <p className="truncate text-[10px] text-muted-foreground">{row.employee_code || '—'}</p>
        </div>
      );
    },
  }),
  columnHelper.accessor('client_name', {
    id: 'client',
    header: 'Client',
    size: 160,
    cell: (info) => <div className="truncate text-xs max-w-[150px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('project_name', {
    id: 'project',
    header: 'Project',
    size: 170,
    cell: (info) => <div className="truncate text-xs max-w-[160px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('spo_name', {
    id: 'spo',
    header: 'SPO',
    size: 170,
    cell: (info) => {
      const row = info.row.original;
      const label = [row.spo_name, row.service_po_code].filter(Boolean).join(' - ');
      return <div className="truncate text-xs max-w-[160px]" title={label}>{row.spo_name || '—'}</div>;
    },
  }),
  columnHelper.accessor('hours_name', {
    id: 'hours_name',
    header: 'Module / Task',
    enableSorting: false,
    size: 160,
    cell: (info) => <div className="truncate text-xs max-w-[150px] text-muted-foreground" title={info.getValue() || ''}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('bu_name', {
    id: 'bu_name',
    header: 'BU Name',
    enableSorting: false,
    size: 150,
    cell: (info) => <div className="truncate text-xs max-w-[140px]" title={info.getValue() || ''}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('sub_bu_name', {
    id: 'sub_bu_name',
    header: 'Sub-BU Name',
    enableSorting: false,
    size: 150,
    cell: (info) => <div className="truncate text-xs max-w-[140px]" title={info.getValue() || ''}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('logged_hours', {
    id: 'hours',
    header: 'Logged Hours',
    meta: { align: 'right' },
    size: 110,
    cell: (info) => <span className="block text-right text-xs font-semibold tabular-nums">{formatHours2dp(info.getValue())}</span>,
  }),
  columnHelper.accessor('work_date', {
    id: 'date',
    header: 'Date',
    size: 110,
    cell: (info) => <span className="whitespace-nowrap text-xs">{info.getValue() ? formatDate(info.getValue(), 'DD-MMM-YYYY') : '—'}</span>,
  }),
  columnHelper.accessor('description', {
    id: 'description',
    header: 'Description',
    enableSorting: false,
    size: 240,
    cell: (info) => (
      <p className="line-clamp-2 max-w-[230px] text-xs" title={info.getValue() || ''}>{info.getValue() || '—'}</p>
    ),
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    size: 110,
    cell: (info) => {
      const status = info.getValue();
      return (
        <Badge variant={STATUS_BADGE_VARIANT[status] ?? 'outline'} className="text-[10px]">
          {STATUS_LABEL[status] ?? status ?? '—'}
        </Badge>
      );
    },
  }),
];

const TeamLeadEmployeeProjectHours = () => {
  const { error: showError } = useNotification();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [periodMode, setPeriodMode] = useState('month'); // 'month' | 'range'
  const [monthYear, setMonthYear] = useState({ month: now.month() + 1, year: now.year() });
  const [dateRange, setDateRange] = useState(null);

  const [employeeIds, setEmployeeIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [servicePoIds, setServicePoIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [subBuIds, setSubBuIds] = useState([]);
  const [statusList, setStatusList] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [sorting, setSorting] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // `buId: 'all'` (not omitted) on both calls below — this report is entirely resolved from the
  // login's own manager mappings, never a BU header, so this always drops X-Company-Id rather
  // than leaving it to whatever happens to be the navbar's globally-active BU (same ALL_BUS
  // convention every other report page's own params object already follows).
  const periodParams = periodMode === 'month'
    ? { month: monthYear.month, year: monthYear.year, buId: 'all' }
    : { startDate: dateRange?.startDate, endDate: dateRange?.endDate, buId: 'all' };

  // Filter options only ever depend on the period — refetched whenever it changes, per spec.
  const {
    data: filterOptionsRes, error: filterOptionsError,
  } = useTeamLeadEmployeeProjectHoursFilterOptions(periodParams);

  const filterOptionsLoaded = !!filterOptionsRes;
  const employees = filterOptionsRes?.data?.employees ?? [];
  const clients = filterOptionsRes?.data?.clients ?? [];
  const projects = filterOptionsRes?.data?.projects ?? [];
  const servicePos = filterOptionsRes?.data?.servicePos ?? [];
  const businessUnits = filterOptionsRes?.data?.businessUnits ?? [];
  const subBusinessUnits = filterOptionsRes?.data?.subBusinessUnits ?? [];

  // Cascades — Project narrows to selected Clients; Sub-BU narrows to selected BUs; SPO narrows
  // to selected Clients/Projects/BU/Sub-BU. All client-side, since these lists are small.
  const projectOptions = useMemo(() => (
    clientIds.length ? projects.filter((p) => clientIds.includes(String(p.client_id))) : projects
  ), [projects, clientIds]);

  const subBuOptions = useMemo(() => (
    buIds.length ? subBusinessUnits.filter((s) => buIds.includes(String(s.parent_business_unit_id))) : subBusinessUnits
  ), [subBusinessUnits, buIds]);

  const servicePoOptions = useMemo(() => servicePos.filter((po) => {
    if (clientIds.length && !clientIds.includes(String(po.client_id))) return false;
    if (projectIds.length && !projectIds.includes(String(po.project_id))) return false;
    if (buIds.length && !buIds.includes(String(po.bu_id))) return false;
    if (subBuIds.length && !subBuIds.includes(String(po.sub_bu_id))) return false;
    return true;
  }), [servicePos, clientIds, projectIds, buIds, subBuIds]);

  // Dropping child selections that no longer fit once a parent filter narrows — same "reset what
  // no longer applies" convention every other cascading filter in this app already follows.
  useEffect(() => {
    const valid = new Set(projectOptions.map((p) => String(p.id)));
    setProjectIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIds]);

  useEffect(() => {
    const valid = new Set(subBuOptions.map((s) => String(s.id)));
    setSubBuIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buIds]);

  useEffect(() => {
    const valid = new Set(servicePoOptions.map((po) => String(po.id)));
    setServicePoIds((prev) => prev.filter((id) => valid.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIds, projectIds, buIds, subBuIds]);

  const employeeOptions = useMemo(() => employees.map((e) => ({
    label: `${e.full_name} (${e.employee_code})${e.mapping_type ? ` · ${e.mapping_type === 'PRIMARY' ? 'Primary' : 'Secondary'}` : ''}`,
    value: String(e.id),
  })), [employees]);
  const clientOptions = useMemo(() => clients.map((c) => ({ label: c.name, value: String(c.id) })), [clients]);
  const projectSelectOptions = useMemo(() => projectOptions.map((p) => ({ label: p.name, value: String(p.id) })), [projectOptions]);
  const servicePoSelectOptions = useMemo(() => servicePoOptions.map((po) => ({
    label: po.code ? `${po.name} (${po.code})` : po.name,
    value: String(po.id),
  })), [servicePoOptions]);
  const buOptions = useMemo(() => businessUnits.map((b) => ({ label: b.name, value: String(b.id) })), [businessUnits]);
  const subBuSelectOptions = useMemo(() => subBuOptions.map((s) => ({ label: s.name, value: String(s.id) })), [subBuOptions]);

  const sortSpec = sorting[0];
  const queryParams = useMemo(() => ({
    ...periodParams,
    ...(employeeIds.length && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length && { clientIds: clientIds.join(',') }),
    ...(projectIds.length && { projectIds: projectIds.join(',') }),
    ...(servicePoIds.length && { servicePoIds: servicePoIds.join(',') }),
    ...(buIds.length && { buIds: buIds.join(',') }),
    ...(subBuIds.length && { subBuIds: subBuIds.join(',') }),
    ...(statusList.length && { status: statusList.join(',') }),
    ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
    ...(sortSpec && { sortBy: sortSpec.id, sortOrder: sortSpec.desc ? 'desc' : 'asc' }),
    page,
    limit,
    // Never a real header-scoping value here — this report is entirely resolved from the login's
    // own manager mappings, never a team-lead/manager id or an active-BU header.
    buId: 'all',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    periodMode, monthYear.month, monthYear.year, dateRange?.startDate, dateRange?.endDate,
    employeeIds, clientIds, projectIds, servicePoIds, buIds, subBuIds, statusList,
    debouncedSearch, sortSpec?.id, sortSpec?.desc, page, limit,
  ]);

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const { data, isLoading, isError, error } = useTeamLeadEmployeeProjectHours(periodReady ? queryParams : undefined);

  const records = data?.data?.records ?? [];
  const summary = data?.data?.summary ?? {};
  const meta = data?.meta ?? {};

  // Reuses the same filters currently shown (minus page/limit/sortBy/sortOrder — the export
  // endpoint returns every matching row in one file, not one page) — same convention
  // ProjectWiseTimesheetReport.jsx's own handleDownload already follows.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { page: _p, limit: _l, sortBy: _sb, sortOrder: _so, ...exportParams } = queryParams;
      const result = await reportsApi.exportTeamLeadEmployeeProjectHours(exportParams);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const activeFilterCount = [
    periodMode !== 'month',
    employeeIds.length > 0,
    clientIds.length > 0,
    projectIds.length > 0,
    servicePoIds.length > 0,
    buIds.length > 0,
    subBuIds.length > 0,
    statusList.length > 0,
  ].filter(Boolean).length;

  const handleReset = () => {
    setPeriodMode('month');
    setMonthYear({ month: now.month() + 1, year: now.year() });
    setDateRange(null);
    setEmployeeIds([]);
    setClientIds([]);
    setProjectIds([]);
    setServicePoIds([]);
    setBuIds([]);
    setSubBuIds([]);
    setStatusList([]);
    setSearch('');
    setSorting([]);
    setPage(1);
  };

  // Every filter (or sort) change resets to page 1 — all filtering/sorting happens on the
  // server, so a stale page number could otherwise land past the end of a newly-narrowed result.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    periodMode, monthYear.month, monthYear.year, dateRange?.startDate, dateRange?.endDate,
    employeeIds, clientIds, projectIds, servicePoIds, buIds, subBuIds, statusList, debouncedSearch,
    sortSpec?.id, sortSpec?.desc,
  ]);

  const noManagerAccess = is403(error) || is403(filterOptionsError);

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Team Lead Employee Project Hours"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or description…"
              className="w-full sm:w-full md:w-64"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {records.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                <Download className="mr-1.5 h-4 w-4" />{isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[620px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[clamp(0.5rem,0.8vw,0.75rem)] w-full"
        onClear={handleReset}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs value={periodMode} onValueChange={setPeriodMode}>
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
              onChange={(v) => { if (v) setMonthYear(v); }}
              clearable={false}
              className="w-full"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              placeholder="Select a date range"
              className="w-full"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <MultiSelect
            options={employeeOptions}
            value={employeeIds}
            onValueChange={setEmployeeIds}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Client</Label>
          <MultiSelect
            options={clientOptions}
            value={clientIds}
            onValueChange={setClientIds}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Project</Label>
          <MultiSelect
            options={projectSelectOptions}
            value={projectIds}
            onValueChange={setProjectIds}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Service PO</Label>
          <MultiSelect
            options={servicePoSelectOptions}
            value={servicePoIds}
            onValueChange={setServicePoIds}
            placeholder="All Service POs"
            searchPlaceholder="Search Service PO..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Business Unit</Label>
          <MultiSelect
            options={buOptions}
            value={buIds}
            onValueChange={setBuIds}
            placeholder="All Business Units"
            searchPlaceholder="Search business unit..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Sub-BU</Label>
          <MultiSelect
            options={subBuSelectOptions}
            value={subBuIds}
            onValueChange={setSubBuIds}
            placeholder="All Sub-BUs"
            searchPlaceholder="Search sub-BU..."
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Status</Label>
          <MultiSelect
            options={STATUS_OPTIONS}
            value={statusList}
            onValueChange={setStatusList}
            placeholder="All Statuses"
            className="w-full"
          />
        </div>
      </FilterPanel>

      {noManagerAccess ? (
        <EmptyState
          title="You don't have manager access for this report."
          description="This report is only available to a Team Lead / Project Manager with employees mapped to them."
        />
      ) : filterOptionsLoaded && employees.length === 0 ? (
        <EmptyState title="No employees are mapped to you as Primary or Secondary Manager." />
      ) : (
        <>
          {summary.total_logged_hours != null && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">Total Hours</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{formatHours2dp(summary.total_logged_hours)}</span>
              {summary.period?.start_date && summary.period?.end_date && (
                <span className="text-xs text-muted-foreground">
                  ({formatDate(summary.period.start_date)} – {formatDate(summary.period.end_date)})
                </span>
              )}
            </div>
          )}

          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            mobileCards
            sorting={sorting}
            onSortingChange={setSorting}
            emptyState={
              isError ? (
                <div className="p-6 text-center text-sm text-destructive">{extractApiError(error)}</div>
              ) : (
                <EmptyState title="No records for the selected filters." />
              )
            }
            pagination={{ page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? records.length }}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
          />
        </>
      )}
    </div>
  );
};

export default TeamLeadEmployeeProjectHours;
