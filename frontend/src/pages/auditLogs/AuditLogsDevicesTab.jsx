import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuditDevices } from '@/hooks/useAuditLogs';
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
import SearchInput from '@/components/common/SearchInput';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { getDefaultDateRange, shortId, splitBuValues } from './auditLogsShared.jsx';

const columnHelper = createColumnHelper();

// Row click hands `{ deviceId, search, nonce }` up to AuditLogs.jsx, which switches to the
// Activity tab and forwards it as `preset` — `search` carries the actor's code so Activity
// narrows to that one user (it has no dedicated actor_id filter of its own) alongside device_id.
const AuditLogsDevicesTab = ({ onOpenDevice, toolbarSlot }) => {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [actorBuValues, setActorBuValues] = useState([]);
  const [actorIds, setActorIds] = useState([]);
  const [search, setSearch] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const debouncedSearch = useDebounce(search, 400);
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
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(debouncedDeviceId && { device_id: debouncedDeviceId }),
    page,
    limit,
    buId: ALL_BUS,
  };

  const { data, isPending, isFetching, isError, error, refetch } = useAuditDevices(params);
  const errorMessage = isError ? extractApiError(error) : null;
  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    !isDateDefault,
    actorIds.length > 0,
    actorBuValues.length > 0,
    deviceId.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setDateRange(getDefaultDateRange());
    setActorIds([]);
    setActorBuValues([]);
    setDeviceId('');
    setSearch('');
    setPage(1);
  };

  const handleRowClick = (row) => {
    onOpenDevice({
      deviceId: row.device_id,
      actorId: row.actor_id,
      search: row.actor_code || row.actor_name || '',
    });
  };

  const columns = useMemo(() => [
    columnHelper.accessor('actor_name', {
      header: 'User',
      size: 170,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-1.5 min-w-0 max-w-[160px]">
            <div className="flex flex-col min-w-0">
              <span className="truncate font-medium text-foreground text-xs" title={r.actor_name}>{r.actor_name || '—'}</span>
              {r.actor_code && <span className="truncate text-[11px] text-muted-foreground" title={r.actor_code}>{r.actor_code}</span>}
            </div>
            {r.person_devices > 1 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground" title={`${r.person_devices} devices used by this person`}>
                {r.person_devices} devices
              </span>
            )}
          </div>
        );
      },
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
      size: 170,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.device_id) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-0">
            {r.device_name && <div className="truncate text-xs font-medium text-foreground" title={r.device_name}>{r.device_name}</div>}
            <span className="font-mono text-[11px] text-muted-foreground" title={r.device_id}>{shortId(r.device_id)}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('browser', {
      header: 'Browser',
      size: 130,
      cell: (info) => <span className="truncate max-w-[120px] text-xs text-muted-foreground" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('first_seen', {
      header: 'First Seen',
      size: 140,
      cell: (info) => <span className="whitespace-nowrap text-xs text-muted-foreground">{info.getValue() ? formatDateTime(info.getValue()) : '—'}</span>,
    }),
    columnHelper.accessor('last_seen', {
      header: 'Last Seen',
      size: 140,
      cell: (info) => <span className="whitespace-nowrap text-xs text-muted-foreground">{info.getValue() ? formatDateTime(info.getValue()) : '—'}</span>,
    }),
    columnHelper.accessor('login_count', {
      header: 'Logins',
      size: 90,
      meta: { align: 'right' },
      cell: (info) => <span className="tabular-nums text-xs">{info.getValue() ?? 0}</span>,
    }),
    columnHelper.accessor('last_login_ip', {
      header: 'Last Login IP',
      size: 120,
      cell: (info) => <span className="font-mono text-[11px] text-muted-foreground">{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('activity_count', {
      header: 'Activity',
      size: 90,
      meta: { align: 'right' },
      cell: (info) => <span className="tabular-nums text-xs">{info.getValue() ?? 0}</span>,
    }),
    columnHelper.accessor('sessions_count', {
      header: 'Sessions',
      size: 90,
      meta: { align: 'right' },
      cell: (info) => <span className="tabular-nums text-xs">{info.getValue() ?? 0}</span>,
    }),
  ], []);

  const toolbarContent = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search user name or code…"
        className="w-full sm:w-60"
      />
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
        emptyState={<EmptyState title="No devices for these filters." description="Try adjusting your date range or filter options." />}
        pagination={meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default AuditLogsDevicesTab;
