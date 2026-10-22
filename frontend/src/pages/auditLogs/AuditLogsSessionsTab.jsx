import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuditSessions } from '@/hooks/useAuditLogs';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { formatDateTime } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Switch } from '@/components/ui/switch';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { getDefaultDateRange, shortId, NewDeviceBadge, splitBuValues } from './auditLogsShared.jsx';

const columnHelper = createColumnHelper();

// Row click hands `{ sessionId, nonce }` up to AuditLogs.jsx, which switches to the Activity tab
// and forwards it to AuditLogsActivityTab as its `preset` prop.
const AuditLogsSessionsTab = ({ onOpenSession, toolbarSlot }) => {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [actorBuValues, setActorBuValues] = useState([]);
  const [actorIds, setActorIds] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [newDeviceOnly, setNewDeviceOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const debouncedDeviceId = useDebounce(deviceId, 400);

  const { data: activeEmployees = [] } = useActiveEmployees();

  const { units = [] } = useSelectableBusinessUnits();
  const { parentIds: parentActorBuIds, subIds: subActorBuIds } = useMemo(
    () => splitBuValues(actorBuValues, units),
    [actorBuValues, units]
  );

  const defaultRange = getDefaultDateRange();
  const isDateDefault = dateRange?.startDate === defaultRange.startDate && dateRange?.endDate === defaultRange.endDate;

  const params = {
    ...(dateRange?.startDate && { start_date: dateRange.startDate }),
    ...(dateRange?.endDate && { end_date: dateRange.endDate }),
    ...(actorIds.length > 0 && { actor_ids: actorIds.join(',') }),
    ...(parentActorBuIds.length > 0 && { actor_bu_ids: parentActorBuIds.join(',') }),
    ...(subActorBuIds.length > 0 && { actor_sub_bu_ids: subActorBuIds.join(',') }),
    ...(debouncedDeviceId && { device_id: debouncedDeviceId }),
    ...(newDeviceOnly && { new_device_only: true }),
    page,
    limit,
    buId: ALL_BUS,
  };

  const { data, isPending, isFetching, isError, error, refetch } = useAuditSessions(params);
  const errorMessage = isError ? extractApiError(error) : null;
  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    !isDateDefault,
    actorIds.length > 0,
    actorBuValues.length > 0,
    deviceId.trim() !== '',
    newDeviceOnly,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setDateRange(getDefaultDateRange());
    setActorIds([]);
    setActorBuValues([]);
    setDeviceId('');
    setNewDeviceOnly(false);
    setPage(1);
  };

  const handleRowClick = (row) => {
    onOpenSession(row.session_id);
  };

  const columns = useMemo(() => [
    columnHelper.accessor('login_at', {
      header: 'Login Time',
      size: 170,
      cell: (info) => <div className="whitespace-nowrap font-medium text-xs">{formatDateTime(info.getValue())}</div>,
    }),
    columnHelper.accessor('actor_name', {
      header: 'User',
      size: 160,
      cell: ({ row }) => (
        <div className="flex flex-col min-w-0 max-w-[150px]">
          <span className="truncate font-medium text-foreground text-xs" title={row.original.actor_name}>
            {row.original.actor_name || '—'}
          </span>
          {row.original.actor_code && (
            <span className="truncate text-[11px] text-muted-foreground" title={row.original.actor_code}>
              {row.original.actor_code}
            </span>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('actor_role', {
      header: 'Role',
      size: 120,
      cell: (info) => <span className="truncate max-w-[110px] text-xs" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('actor_bu', {
      header: "User's BU / Sub-BU",
      size: 170,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.actor_bu && !r.actor_sub_bu) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col min-w-0 max-w-[160px]">
            <span className="truncate font-medium text-xs text-foreground" title={r.actor_bu}>{r.actor_bu || '—'}</span>
            {r.actor_sub_bu && <span className="truncate text-[11px] text-muted-foreground" title={r.actor_sub_bu}>{r.actor_sub_bu}</span>}
          </div>
        );
      },
    }),
    columnHelper.accessor('device_id', {
      header: 'Device',
      size: 160,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.device_id && !r.device_name) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-0 space-y-0.5">
            {r.device_name && <div className="truncate text-xs font-medium text-foreground" title={r.device_name}>{r.device_name}</div>}
            {r.device_id && <span className="font-mono text-[11px] text-muted-foreground" title={r.device_id}>{shortId(r.device_id)}</span>}
          </div>
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
      cell: (info) => <span className="truncate max-w-[120px] text-xs text-muted-foreground" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('new_device', {
      header: 'New Device',
      size: 110,
      cell: (info) => (info.getValue() ? <NewDeviceBadge text="New device" /> : <span className="text-muted-foreground">—</span>),
    }),
    columnHelper.accessor('actions_count', {
      header: 'Actions',
      size: 90,
      meta: { align: 'right' },
      cell: (info) => <span className="tabular-nums text-xs">{info.getValue() ?? 0}</span>,
    }),
    columnHelper.accessor('last_activity', {
      header: 'Last Activity',
      size: 160,
      cell: (info) => <span className="whitespace-nowrap text-xs text-muted-foreground">{info.getValue() ? formatDateTime(info.getValue()) : '—'}</span>,
    }),
  ], []);

  const toolbarContent = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Switch checked={newDeviceOnly} onCheckedChange={(v) => { setNewDeviceOnly(v); setPage(1); }} />
        New device logins only
      </label>
      <Button variant="outline" size="toolbar" onClick={() => refetch()} disabled={isFetching}>
        <RefreshCw className={`h-4 w-4${isFetching ? ' animate-spin' : ''}`} />
        Refresh
      </Button>
      <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((p) => !p)} activeCount={activeFilterCount} />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbarSlot ? createPortal(toolbarContent, toolbarSlot) : (
        <div className="mb-3">
          {toolbarContent}
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <FilterPanel isOpen={filtersOpen} onClear={clearFilters} showClear={activeFilterCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Date Range <span className="text-destructive">*</span></Label>
          <DateRangePicker value={dateRange} onChange={(v) => { setDateRange(v); setPage(1); }} placeholder="Select date range" className="w-full" />
        </div>

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

        <BusinessUnitFilter multiple label="User's BU" value={actorBuValues} onChange={(v) => { setActorBuValues(v); setPage(1); }} />

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

      <DataTable
        mobileCards
        columns={columns}
        data={records}
        isLoading={isPending}
        onRowClick={handleRowClick}
        emptyState={<EmptyState title="No sessions for these filters." description="Try adjusting your date range or filter options." />}
        pagination={meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default AuditLogsSessionsTab;
