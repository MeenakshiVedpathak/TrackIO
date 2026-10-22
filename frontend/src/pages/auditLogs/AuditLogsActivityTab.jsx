import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, AlertCircle, Download, X, RefreshCw } from 'lucide-react';
import { auditLogsApi } from '@/api/auditLogs.api';
import { downloadBlob } from '@/utils/download';
import { useNotification } from '@/hooks/useNotification';
import { Button } from '@/components/ui/button';
import { useAuditLogs, useAuditLogFilterOptions } from '@/hooks/useAuditLogs';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { formatDateTime, formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import SearchInput from '@/components/common/SearchInput';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { cn } from '@/utils/cn';
import AuditLogDetailDrawer, { getActionBadgeClass } from './AuditLogDetailDrawer.jsx';
import {
  getDefaultDateRange, toOptions, ACTION_LABEL_OVERRIDES, STAT_TONES, StatPill,
  shortId, NewDeviceBadge, splitBuValues,
} from './auditLogsShared.jsx';

const columnHelper = createColumnHelper();

// `preset` (from the Sessions/Devices tabs' row clicks, via AuditLogs.jsx) arrives as
// { sessionId?, deviceId?, actorIds?, search?, nonce } — `nonce` changes on every click so the same
// session/device can be re-applied even if it's already the active filter.
const AuditLogsActivityTab = ({ preset, toolbarSlot }) => {
  const { error: notifyError, success: notifySuccess } = useNotification();

  // Filters state
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [actorIds, setActorIds] = useState([]);
  const [actorBuValues, setActorBuValues] = useState([]);
  const [recordBuValues, setRecordBuValues] = useState([]);
  const [actionValues, setActionValues] = useState([]);
  const [entityTypeValues, setEntityTypeValues] = useState([]);
  const [roleValues, setRoleValues] = useState([]);
  const [search, setSearch] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Pagination & Sorting state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState('newest'); // 'newest' | 'oldest'

  // Export & Drawer state
  const [isExporting, setIsExporting] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const debouncedDeviceId = useDebounce(deviceId, 400);

  // Applies a preset pushed down from the Sessions/Devices tabs (a row click there switches to
  // this tab and hands over a session_id, or a device_id + user) — keyed on `preset.nonce`
  // so clicking the exact same session/device row twice still re-applies it.
  useEffect(() => {
    if (!preset) return;
    if (preset.sessionId !== undefined) setSessionId(preset.sessionId);
    if (preset.deviceId !== undefined) setDeviceId(preset.deviceId ?? '');
    if (preset.actorIds !== undefined) setActorIds(preset.actorIds ?? []);
    if (preset.search !== undefined) setSearch(preset.search ?? '');
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  const { data: activeEmployees = [] } = useActiveEmployees();

  // Filter options from API
  const { data: filterOptionsRes } = useAuditLogFilterOptions();
  const filterOptions = filterOptionsRes?.data ?? filterOptionsRes ?? {};
  const actionOptions = useMemo(() => toOptions(filterOptions.actions, ACTION_LABEL_OVERRIDES), [filterOptions.actions]);
  const entityTypeOptions = useMemo(() => toOptions(filterOptions.entity_types), [filterOptions.entity_types]);
  const roleOptions = useMemo(() => toOptions(filterOptions.roles), [filterOptions.roles]);

  // Unit lookup to partition parent BU and sub-BU for the actor
  const { units = [] } = useSelectableBusinessUnits();
  const { parentIds: parentActorBuIds, subIds: subActorBuIds } = useMemo(
    () => splitBuValues(actorBuValues, units),
    [actorBuValues, units]
  );

  // Query parameters
  const params = {
    ...(dateRange?.startDate && { start_date: dateRange.startDate }),
    ...(dateRange?.endDate && { end_date: dateRange.endDate }),
    ...(actorIds.length > 0 && { actor_ids: actorIds.join(',') }),
    ...(parentActorBuIds.length > 0 && { actor_bu_ids: parentActorBuIds.join(',') }),
    ...(subActorBuIds.length > 0 && { actor_sub_bu_ids: subActorBuIds.join(',') }),
    ...(recordBuValues.length > 0 && { record_bu_ids: recordBuValues.join(',') }),
    ...(actionValues.length > 0 && { actions: actionValues.join(',') }),
    ...(entityTypeValues.length > 0 && { entity_types: entityTypeValues.join(',') }),
    ...(roleValues.length > 0 && { roles: roleValues.join(',') }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(debouncedDeviceId && { device_id: debouncedDeviceId }),
    ...(sessionId && { session_id: sessionId }),
    sort,
    page,
    limit,
    buId: ALL_BUS,
  };

  const { data, isPending, isFetching, isError, error, refetch } = useAuditLogs(params);
  const errorMessage = isError ? extractApiError(error) : null;

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const summary = data?.data?.summary ?? null;
  const period = data?.data?.period ?? null;
  const meta = data?.meta ?? {};

  const periodLabel = period?.start_date && period?.end_date
    ? `${formatDate(period.start_date)} - ${formatDate(period.end_date)}`
    : dateRange?.startDate && dateRange?.endDate
    ? `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`
    : null;

  const defaultRange = getDefaultDateRange();
  const isDateDefault = dateRange?.startDate === defaultRange.startDate && dateRange?.endDate === defaultRange.endDate;

  const activeFilterCount = [
    !isDateDefault,
    actorIds.length > 0,
    actorBuValues.length > 0,
    recordBuValues.length > 0,
    actionValues.length > 0,
    entityTypeValues.length > 0,
    roleValues.length > 0,
    deviceId.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setDateRange(getDefaultDateRange());
    setActorIds([]);
    setActorBuValues([]);
    setRecordBuValues([]);
    setActionValues([]);
    setEntityTypeValues([]);
    setRoleValues([]);
    setDeviceId('');
    setSearch('');
    setSessionId(null);
    setPage(1);
  };

  const handleToggleSort = () => {
    setSort((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
    setPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { page: _p, limit: _l, ...exportParams } = params;
      const result = await auditLogsApi.download(exportParams, 'excel');
      downloadBlob(result.blob, result.filename);
      notifySuccess('Audit logs exported successfully');
    } catch (err) {
      notifyError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleRowClick = (row) => {
    setSelectedRecord(row);
    setDrawerOpen(true);
  };

  // Clicking a Session cell/chip (in the table or the drawer) filters this same tab by that
  // session — no tab switch needed since we're already on Activity.
  const filterBySession = (id) => {
    setSessionId(id);
    setPage(1);
  };

  // Columns specification
  const columns = useMemo(() => [
    columnHelper.accessor('when', {
      header: () => (
        <button
          type="button"
          onClick={handleToggleSort}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-medium"
        >
          <span>When</span>
          {sort === 'newest' ? (
            <ChevronDown className="h-3 w-3 text-primary" />
          ) : (
            <ChevronUp className="h-3 w-3 text-primary" />
          )}
        </button>
      ),
      size: 170,
      enableSorting: false,
      cell: (info) => (
        <div className="whitespace-nowrap font-medium text-xs">
          {formatDateTime(info.getValue())}
        </div>
      ),
    }),
    columnHelper.accessor('actor_name', {
      header: 'User',
      size: 160,
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col min-w-0 max-w-[150px]">
            <span className="truncate font-medium text-foreground text-xs" title={row.actor_name}>
              {row.actor_name || '—'}
            </span>
            {row.actor_code && (
              <span className="truncate text-[11px] text-muted-foreground" title={row.actor_code}>
                {row.actor_code}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('actor_role', {
      header: 'Role',
      size: 130,
      cell: (info) => (
        <span className="truncate max-w-[120px] text-xs" title={info.getValue()}>
          {info.getValue() || '—'}
        </span>
      ),
    }),
    columnHelper.accessor('actor_bu', {
      header: "User's BU / Sub-BU",
      size: 180,
      cell: (info) => {
        const row = info.row.original;
        const bu = row.actor_bu;
        const subBu = row.actor_sub_bu;
        if (!bu && !subBu) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col min-w-0 max-w-[170px]">
            <span className="truncate font-medium text-xs text-foreground" title={bu}>
              {bu || '—'}
            </span>
            {subBu && (
              <span className="truncate text-[11px] text-muted-foreground" title={subBu}>
                {subBu}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('action', {
      header: 'Action',
      size: 130,
      cell: (info) => {
        const row = info.row.original;
        const action = info.getValue();
        const label = row.action_label || action;
        if (!label) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap', getActionBadgeClass(action))}>
              {label}
            </span>
            {row.new_device && <NewDeviceBadge text="Signed in from a NEW device" />}
          </div>
        );
      },
    }),
    columnHelper.accessor('entity_type', {
      header: 'Record',
      size: 180,
      cell: (info) => {
        const row = info.row.original;
        const typeLabel = row.entity_type_label || row.entity_type;
        const name = row.entity_name;
        if (!typeLabel && !name) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col min-w-0 max-w-[170px]">
            <span className="truncate font-medium text-xs text-foreground" title={typeLabel}>
              {typeLabel || '—'}
            </span>
            {name && (
              <span className="truncate text-[11px] text-muted-foreground" title={name}>
                {name}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('record_bu', {
      header: "Record's BU / Sub-BU",
      size: 180,
      cell: (info) => {
        const row = info.row.original;
        const bu = row.record_bu;
        const subBu = row.record_sub_bu;
        if (!bu && !subBu) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col min-w-0 max-w-[170px]">
            <span className="truncate font-medium text-xs text-foreground" title={bu}>
              {bu || '—'}
            </span>
            {subBu && (
              <span className="truncate text-[11px] text-muted-foreground" title={subBu}>
                {subBu}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('summary', {
      header: 'What happened',
      size: 220,
      cell: (info) => {
        const value = info.getValue();
        if (!value) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="truncate max-w-[210px] text-xs text-muted-foreground" title={value}>
            {value}
          </div>
        );
      },
    }),
    columnHelper.accessor('device_id', {
      header: 'Device',
      size: 150,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.device_id) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-0">
            {r.device_name && (
              <div className="truncate text-xs font-medium text-foreground" title={r.device_name}>
                {r.device_name}
              </div>
            )}
            <span className="font-mono text-[11px] text-muted-foreground cursor-default" title={r.device_id}>
              {shortId(r.device_id)}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('session_id', {
      header: 'Session',
      size: 100,
      cell: (info) => {
        const value = info.getValue();
        if (!value) return <span className="text-muted-foreground">—</span>;
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); filterBySession(value); }}
            className="font-mono text-[11px] text-primary hover:underline"
            title={`Filter by session ${value}`}
          >
            {shortId(value)}
          </button>
        );
      },
    }),
    columnHelper.accessor('login_ip', {
      header: 'Login IP',
      size: 120,
      cell: (info) => <span className="font-mono text-[11px] text-muted-foreground">{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('login_browser', {
      header: 'Browser',
      size: 130,
      cell: (info) => (
        <span className="truncate max-w-[120px] text-xs text-muted-foreground" title={info.getValue()}>
          {info.getValue() || '—'}
        </span>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [sort]);

  const toolbarContent = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search user, record name/type…"
        className="w-full sm:w-60"
      />
      {sessionId && (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium">
          Session: <span className="font-mono">{shortId(sessionId)}</span>
          <button type="button" onClick={() => { setSessionId(null); setPage(1); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      {deviceId && (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium">
          Device: <span className="font-mono">{shortId(deviceId)}</span>
          <button type="button" onClick={() => { setDeviceId(''); setPage(1); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      <Button variant="outline" size="toolbar" onClick={() => refetch()} disabled={isFetching}>
        <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        Refresh
      </Button>
      {records.length > 0 && (
        <Button variant="outline" size="toolbar" onClick={handleExport} disabled={isExporting}>
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting…' : 'Export Excel'}
        </Button>
      )}
      <FilterToggleButton
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen((prev) => !prev)}
        activeCount={activeFilterCount}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbarSlot ? createPortal(toolbarContent, toolbarSlot) : (
        <div className="mb-3">
          {toolbarContent}
        </div>
      )}

      {/* Error banner on 403, 400 or any failure */}
      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filters Panel */}
      <FilterPanel isOpen={filtersOpen} onClear={clearFilters} showClear={activeFilterCount > 0}>
        {/* Date range filter */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            Date Range <span className="text-destructive">*</span>
          </Label>
          <DateRangePicker
            value={dateRange}
            onChange={(val) => { setDateRange(val); setPage(1); }}
            placeholder="Select date range"
            className="w-full"
          />
        </div>

        {/* User filter */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">User</Label>
          <MultiSelect
            options={activeEmployees.map((e) => ({ label: `${e.full_name} (${e.employee_code})`, value: String(e.id) }))}
            value={actorIds}
            onValueChange={(v) => { setActorIds(v); setPage(1); }}
            placeholder="All Users"
            searchPlaceholder="Search user..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        {/* User's BU & Sub-BU Filter */}
        <BusinessUnitFilter
          multiple
          label="User's BU"
          value={actorBuValues}
          onChange={(v) => { setActorBuValues(v); setPage(1); }}
        />

        {/* Record's BU Filter (completely independent from User's BU) */}
        <BusinessUnitFilter
          multiple
          label="Record's BU"
          value={recordBuValues}
          onChange={(v) => { setRecordBuValues(v); setPage(1); }}
        />

        {/* Action filter */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Action</Label>
          <MultiSelect
            options={actionOptions}
            value={actionValues}
            onValueChange={(v) => { setActionValues(v); setPage(1); }}
            placeholder="All Actions"
            searchPlaceholder="Search actions..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        {/* Record Type (entity_types) filter */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Record Type</Label>
          <MultiSelect
            options={entityTypeOptions}
            value={entityTypeValues}
            onValueChange={(v) => { setEntityTypeValues(v); setPage(1); }}
            placeholder="All Record Types"
            searchPlaceholder="Search record types..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        {/* Role filter */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Role</Label>
          <MultiSelect
            options={roleOptions}
            value={roleValues}
            onValueChange={(v) => { setRoleValues(v); setPage(1); }}
            placeholder="All Roles"
            searchPlaceholder="Search roles..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        {/* Device filter */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Device</Label>
          <Input
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
            placeholder="Filter by device name or ID..."
            className="bg-white"
          />
        </div>
      </FilterPanel>

      {/* Summary chips */}
      {summary && (
        <div className="mb-4 flex flex-wrap gap-[clamp(0.4rem,0.7vw,0.75rem)]">
          <StatPill tone="blue" label="Total Events" value={summary.total_events ?? 0} />
          <StatPill tone="violet" label="Distinct Users" value={summary.distinct_users ?? 0} />
          <StatPill tone="emerald" label="Created" value={summary.creates ?? 0} />
          <StatPill tone="blue" label="Updated" value={summary.updates ?? 0} />
          <StatPill tone="rose" label="Deleted" value={summary.deletes ?? 0} />
          <StatPill tone="slate" label="Logins" value={summary.logins ?? 0} />
        </div>
      )}

      {/* Server-paginated DataTable */}
      <DataTable
        mobileCards
        columns={columns}
        data={records}
        isLoading={isPending}
        onRowClick={handleRowClick}
        emptyState={
          <EmptyState
            title="No activity for these filters."
            description="Try adjusting your date range, search query, or filter options."
          />
        }
        pagination={meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {/* Detail Drawer */}
      <AuditLogDetailDrawer
        logId={selectedRecord?.id}
        initialRecord={selectedRecord}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedRecord(null);
        }}
        onFilterBySession={(id) => {
          setDrawerOpen(false);
          setSelectedRecord(null);
          filterBySession(id);
        }}
      />
    </div>
  );
};

export default AuditLogsActivityTab;
