import { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Bell, Download, RefreshCw, Loader2 } from 'lucide-react';
import { getInitials } from '@/utils/formatters';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/utils/cn';
import dayjs from 'dayjs';
import { reportsApi } from '@/api/reports.api';
import { ROUTES } from '@/constants/routes';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import DataTable from '@/components/common/DataTable';
import SearchInput from '@/components/common/SearchInput';
import SegmentedToggle from '@/components/common/SegmentedToggle';
import SelectionBar from '@/components/common/SelectionBar';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import BulkReminderProgressModal from '@/components/common/BulkReminderProgressModal';
import EmptyState from '@/components/common/EmptyState';
import MobilePagination from '@/components/common/MobilePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DatePicker } from '@/components/ui/date-picker';
import { useNotification } from '@/hooks/useNotification';

const MODE_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' },
];

const columnHelper = createColumnHelper();

// ── Constants ─────────────────────────────────────────────────────────────────

const now = dayjs();
const yesterdayStr = now.subtract(1, 'day').format('YYYY-MM-DD');
const prevMonthDate = now.subtract(1, 'month');
const DEFAULT_MONTH = prevMonthDate.month() + 1; // dayjs month() is 0-indexed
const DEFAULT_YEAR = prevMonthDate.year();

// ── Helpers ───────────────────────────────────────────────────────────────────

const periodLabel = (mode, date, monthYear) => {
  if (mode === 'date') return dayjs(date).format('YYYY-MM-DD');
  return `${dayjs().month(monthYear.month - 1).format('MMMM')}_${monthYear.year}`;
};

const buildPeriodBody = (mode, date, monthYear) =>
  mode === 'date' ? { date } : { month: monthYear.month, year: monthYear.year };

const exportToExcel = (rows, mode, date, monthYear) => {
  const header = [
    'Employee Name', 'Employee Code', 'Business Unit',
    'Logged Hours', 'Required Hours', 'Shortfall Hours', 'Status',
  ];
  const dataRows = rows.map((r) => [
    r.employee_name ?? '',
    r.employee_code ?? '',
    r.business_unit ?? '',
    r.logged_hours != null ? Number(r.logged_hours) : '',
    r.required_hours != null ? Number(r.required_hours) : '',
    r.shortfall_hours != null ? Number(r.shortfall_hours) : '',
    r.status ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Work Log Compliance');
  XLSX.writeFile(wb, `WorkLogCompliance_${periodLabel(mode, date, monthYear)}.xlsx`);
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryItem = ({ label, value, negative = false }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${negative ? 'text-destructive' : 'text-foreground'}`}>
      {value}
    </span>
  </div>
);

// ── Column factory (needs meta from table instance) ───────────────────────────
// Defined as a function so the checkbox column can close over nothing — all dynamic
// behaviour is injected via table.options.meta at render time.

const buildColumns = () => [
  // Checkbox column — first
  columnHelper.display({
    id: 'select',
    size: 44,
    header: ({ table }) => {
      const { allFilteredIds, selectedIds, togglePageSelection } = table.options.meta ?? {};
      const allSelected = allFilteredIds?.length > 0 && allFilteredIds.every((id) => selectedIds?.has(id));
      const someSelected = !allSelected && allFilteredIds?.some((id) => selectedIds?.has(id));
      return (
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={() => togglePageSelection?.()}
          aria-label="Select all records"
        />
      );
    },
    cell: ({ row, table }) => {
      const { selectedIds, toggleRow } = table.options.meta ?? {};
      const empId = row.original.employee_id;
      return (
        <Checkbox
          checked={selectedIds?.has(empId) ?? false}
          onCheckedChange={() => toggleRow?.(empId)}
          aria-label={`Select ${row.original.employee_name}`}
        />
      );
    },
  }),

  // Action column — second, icon only
  columnHelper.display({
    id: 'action',
    header: 'Action',
    size: 70,
    cell: ({ row, table }) => {
      const { remindingIds, isBulkSending, handleRemind } = table.options.meta ?? {};
      const empId = row.original.employee_id;
      const isSending = remindingIds?.has(empId);
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          disabled={isSending || isBulkSending}
          title={isSending ? 'Sending…' : 'Send reminder'}
          onClick={() => handleRemind(row.original)}
        >
          {isSending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Bell className="h-3.5 w-3.5" />}
        </Button>
      );
    },
  }),

  columnHelper.accessor('employee_name', {
    header: 'Employee Name',
    size: 200,
    cell: (info) => (
      <div className="truncate max-w-[180px] font-medium text-sm" title={info.getValue()}>
        {info.getValue() || '—'}
      </div>
    ),
  }),

  columnHelper.accessor('business_unit', {
    header: 'BU',
    size: 160,
    cell: (info) => {
      const v = info.getValue();
      return v
        ? <Badge variant="outline" className="text-xs">{v}</Badge>
        : <span className="text-muted-foreground">—</span>;
    },
  }),

  columnHelper.accessor('logged_hours', {
    header: 'Logged',
    size: 110,
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className="tabular-nums font-medium text-sm">
          {v != null ? `${Number(v).toFixed(2)} h` : '—'}
        </span>
      );
    },
  }),

  columnHelper.accessor('required_hours', {
    header: 'Required',
    size: 110,
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className="tabular-nums text-muted-foreground text-sm">
          {v != null ? `${Number(v)} h` : '—'}
        </span>
      );
    },
  }),

  columnHelper.accessor('shortfall_hours', {
    header: 'Shortfall',
    size: 110,
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className="tabular-nums font-semibold text-destructive text-sm">
          {v != null ? `${Number(v).toFixed(2)} h` : '—'}
        </span>
      );
    },
  }),

  columnHelper.accessor('status', {
    header: 'Status',
    size: 110,
    cell: () => <Badge variant="destructive">Incomplete</Badge>,
  }),
];

// Stable column array — created once so DataTable's reference check is satisfied.
const columns = buildColumns();

// ── Main component ────────────────────────────────────────────────────────────

const EmployeeWorkLogComplianceReport = () => {
  const { success: toastSuccess, error: toastError } = useNotification();

  // ── Filter state ──
  const [mode, setMode] = useState('month');  // 'date' | 'month'
  const [date, setDate] = useState(yesterdayStr);
  const [monthYear, setMonthYear] = useState({ month: DEFAULT_MONTH, year: DEFAULT_YEAR });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [buId, setBuId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);

  // ── Pagination state (client-side) ──
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // ── Selection state ──
  const [selectedIds, setSelectedIds] = useState(new Set()); // Set<employee_id>

  // ── Per-row and bulk send state ──
  const [remindingIds, setRemindingIds] = useState(new Set()); // Set<employee_id>
  const [isBulkSending, setIsBulkSending] = useState(false);

  // ── Bulk send progress modal state ──
  const [bulkProgress, setBulkProgress] = useState({ open: false, total: 0, result: null, error: null });
  const closeBulkProgress = useCallback(
    () => setBulkProgress({ open: false, total: 0, result: null, error: null }),
    []
  );

  // ── Helpers to clear dependent state when filters change ──
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleModeChange = (m) => {
    setMode(m);
    setPage(1);
    clearSelection();
  };

  const handleBuChange = (val) => {
    setBuId(val);
    setPage(1);
    clearSelection();
  };

  // Picking a different Entity can strand a BU selection that no longer belongs to it — reset the
  // BU state then do what handleBuChange does, same as changing BU itself.
  const handleEntityChange = (val) => {
    setEntityId(val);
    handleBuChange(ALL_BUS);
  };

  const handleDateChange = (d) => {
    setDate(d);
    setPage(1);
    clearSelection();
  };

  const handleMonthYearChange = (val) => {
    setMonthYear(val);
    setPage(1);
    clearSelection();
  };

  // ── Query params ──
  const reportParams = useMemo(() => {
    const base = {
      ...(buId !== ALL_BUS && { buId }),
      ...(entityId !== ALL_ENTITIES && { entityId }),
    };
    return mode === 'date'
      ? { ...base, date }
      : { ...base, month: monthYear.month, year: monthYear.year };
  }, [mode, date, monthYear, buId, entityId]);

  // ── Data query ──
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['employee-work-log-compliance', reportParams],
    queryFn: () => reportsApi.fetchAllEmployeeWorkLogComplianceRows(reportParams),
  });

  // ── Single remind mutation ──
  const { mutate: sendReminder } = useMutation({
    mutationFn: (body) => reportsApi.sendWorkLogComplianceReminder(body),
    onSuccess: (resData, variables) => {
      const name = resData?.data?.employee?.full_name
        ?? records.find((r) => r.employee_id === variables.employeeId)?.employee_name
        ?? 'employee';
      toastSuccess(`Reminder sent to ${name}.`);
      setRemindingIds((prev) => { const n = new Set(prev); n.delete(variables.employeeId); return n; });
    },
    onError: (err, variables) => {
      toastError(err?.response?.data?.message || 'Failed to send reminder.');
      setRemindingIds((prev) => { const n = new Set(prev); n.delete(variables.employeeId); return n; });
    },
  });

  // ── Bulk remind mutation ──
  const { mutate: sendBulkReminder } = useMutation({
    mutationFn: (body) => reportsApi.sendWorkLogComplianceBulkReminder(body),
    onSuccess: (resData) => {
      setIsBulkSending(false);
      clearSelection();
      setBulkProgress((p) => ({ ...p, result: resData?.data ?? {} }));
    },
    onError: (err) => {
      setIsBulkSending(false);
      setBulkProgress((p) => ({ ...p, error: err?.response?.data?.message || 'Failed to send bulk reminders.' }));
    },
  });

  // ── Derived data ──
  const records = data?.data?.records ?? [];

  // Client-side name/code search — server already filtered by BU/period
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [r.employee_name, r.employee_code].some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [records, search]);

  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);
  const pagedIds = pagedRecords.map((r) => r.employee_id);

  const summary = filteredRecords.length > 0
    ? {
        count: filteredRecords.length,
        avgLogged: filteredRecords.reduce((s, r) => s + (Number(r.logged_hours) || 0), 0) / filteredRecords.length,
        totalShortfall: filteredRecords.reduce((s, r) => s + (Number(r.shortfall_hours) || 0), 0),
      }
    : null;

  const selectedCount = selectedIds.size;
  const hasRecords = filteredRecords.length > 0;

  // ── Selection handlers ──
  const toggleRow = useCallback((empId) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(empId)) n.delete(empId);
      else n.add(empId);
      return n;
    });
  }, []);

  const togglePageSelection = useCallback(() => {
    const allFilteredIds = filteredRecords.map((r) => r.employee_id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
    setSelectedIds(() => {
      if (allSelected) return new Set(); // deselect all
      return new Set(allFilteredIds);    // select every record across all pages
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRecords, selectedIds]);

  // ── Action handlers ──
  const handleRemind = useCallback((row) => {
    const empId = row.employee_id;
    if (remindingIds.has(empId)) return;
    setRemindingIds((prev) => new Set([...prev, empId]));
    sendReminder({ employeeId: empId, ...buildPeriodBody(mode, date, monthYear) });
  }, [remindingIds, sendReminder, mode, date, monthYear]);

  const handleRemindSelected = () => {
    if (isBulkSending || selectedCount === 0) return;
    setIsBulkSending(true);
    setBulkProgress({ open: true, total: selectedCount, result: null, error: null });
    sendBulkReminder({
      employeeIds: Array.from(selectedIds),
      ...buildPeriodBody(mode, date, monthYear),
    });
  };

  const handleRemindAll = () => {
    if (isBulkSending || selectedCount > 0) return;
    setIsBulkSending(true);
    // remindAll ignores the client-side name/code search box, so the total shown here tracks
    // the server's full below-threshold scope (records), not the narrower filteredRecords.
    setBulkProgress({ open: true, total: records.length, result: null, error: null });
    const body = {
      remindAll: true,
      ...buildPeriodBody(mode, date, monthYear),
      ...(buId !== ALL_BUS && { company_id: Number(buId) }),
    };
    sendBulkReminder(body);
  };

  const handleExport = () => exportToExcel(filteredRecords, mode, date, monthYear);

  const emptyMessage = 'No employees found below the required threshold for this period.';

  // Mobile card — one row = one employee record (Master-style: avatar/initials + name +
  // BU/hours/shortfall as the secondary lines + a single action), instead of DataTable's generic
  // label/value fallback card, which had nothing to use as a title here (this report's columns
  // are select/action/name/BU/hours — none tagged `meta: { sticky: true }` — so the fallback
  // picked the "select" checkbox column as the card's bold title and left everything else
  // effectively unreadable).
  const renderMobileCard = (emp) => {
    const isSending = remindingIds.has(emp.employee_id);
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
        <Checkbox
          checked={selectedIds.has(emp.employee_id)}
          onCheckedChange={() => toggleRow(emp.employee_id)}
          aria-label={`Select ${emp.employee_name}`}
          className="shrink-0"
        />
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback>{getInitials(emp.employee_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{emp.employee_name || '—'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {emp.business_unit ? `${emp.business_unit} · ` : ''}
            {emp.logged_hours != null ? Number(emp.logged_hours).toFixed(2) : '0.00'}h logged
            {emp.required_hours != null ? ` / ${Number(emp.required_hours)}h required` : ''}
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-destructive">
            Shortfall: {emp.shortfall_hours != null ? Number(emp.shortfall_hours).toFixed(2) : '0.00'}h
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-10 w-10 shrink-0', isSending && 'text-muted-foreground')}
          disabled={isSending || isBulkSending}
          title={isSending ? 'Sending…' : 'Send reminder'}
          onClick={() => handleRemind(emp)}
        >
          {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bell className="h-5 w-5" />}
        </Button>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Employee Work Log Compliance"
        description="Employees whose total logged hours fall below the required threshold for the selected period."
        // Overrides ReportsLayout's inherited back target — this report is reached from the
        // Manager Timesheet Approval screen's "Remind"/compliance flow, so its own back arrow
        // should return there instead of the generic Reports Center every other report falls
        // back to.
        backTo={ROUTES.MANAGER_TIMESHEET_APPROVAL}
        backLabel="Back to Timesheet Approval"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name or code…"
            />

            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={(entityId !== ALL_ENTITIES ? 1 : 0) + (buId !== ALL_BUS ? 1 : 0)}
            />

            {/* Remind Selected */}
            {selectedCount > 0 && (
              <Button
                variant="outline"
                size="toolbar"
                disabled={isBulkSending}
                onClick={handleRemindSelected}
              >
                {isBulkSending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Bell className="h-4 w-4" />}
                Remind Selected ({selectedCount})
              </Button>
            )}

            {/* Remind All — deliberately its own solid, warm-colored CTA rather than another
                outline button: this is the one action on the page a Manager should actually
                notice and act on, not blend in next to Filters/Export. */}
            {hasRecords && (
              <Button
                size="toolbar"
                className="relative bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:bg-amber-600"
                disabled={isBulkSending || selectedCount > 0}
                onClick={handleRemindAll}
              >
                {isBulkSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="relative">
                    <Bell className="h-4 w-4" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-white" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-white" />
                  </span>
                )}
                Remind All{buId !== ALL_BUS ? ' (This BU)' : ''}
              </Button>
            )}

            {/* Export */}
            {hasRecords && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Collapsible filter panel */}
      <FilterPanel
        isOpen={filtersOpen}
        onClear={() => { setEntityId(ALL_ENTITIES); setBuId(ALL_BUS); clearSelection(); }}
        showClear={entityId !== ALL_ENTITIES || buId !== ALL_BUS}
      >
        <EntityFilter value={entityId} onChange={handleEntityChange} />

        {/* BU filter — renders null automatically when only one BU is available */}
        <BusinessUnitFilter value={buId} entityId={entityId} onChange={handleBuChange} />

        {/* Mode toggle */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Mode</Label>
          <SegmentedToggle options={MODE_OPTIONS} value={mode} onChange={handleModeChange} />
        </div>

        {/* Period picker */}
        {mode === 'date' ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date <span className="text-destructive">*</span></Label>
            <DatePicker
              value={date}
              max={yesterdayStr}
              onChange={handleDateChange}
              className="w-full text-sm"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
            <MonthYearPicker
              value={monthYear}
              onChange={handleMonthYearChange}
              clearable={false}
              className="h-9 w-full text-sm"
            />
          </div>
        )}
      </FilterPanel>

      {/* Error banner */}
      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">
            {error?.response?.data?.message ?? 'Failed to load report. Please try again.'}
          </span>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />Retry
          </Button>
        </div>
      )}

      {/* Selection status bar */}
      {selectedCount > 0 && (
        <SelectionBar count={selectedCount} noun="employee" onClear={clearSelection} />
      )}

      {/* Desktop — unchanged. */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={pagedRecords}
        isLoading={isPending}
        pagination={{ page, limit, total: filteredRecords.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        emptyState={<EmptyState title="No records found" description={emptyMessage} />}
        meta={{ remindingIds, isBulkSending, handleRemind, selectedIds, toggleRow, togglePageSelection, pagedIds, allFilteredIds: filteredRecords.map((r) => r.employee_id) }}
      />

      {/* Mobile — Master-style card list built directly in this page (not DataTable's generic
          `mobileCards`/`mobileCardRenderer`, whose shared `flex-1 min-h-0 overflow-y-auto` region
          only ever rendered one visible card here regardless of what the renderer produced — this
          mirrors the same self-contained pattern already used successfully on the Master pages
          instead of chasing that shared component's layout). */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : pagedRecords.length === 0 ? (
            <EmptyState title="No records found" description={emptyMessage} />
          ) : (
            pagedRecords.map((emp) => (
              <div key={emp.employee_id}>{renderMobileCard(emp)}</div>
            ))
          )}
        </div>

        <MobilePagination
          className="shrink-0"
          page={page}
          totalPages={Math.max(1, Math.ceil(filteredRecords.length / limit))}
          total={filteredRecords.length}
          limit={limit}
          itemLabel="employee"
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
        />
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Summary (all pages)
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Employees below threshold" value={summary.count} />
            <SummaryItem label="Average logged hours" value={`${summary.avgLogged.toFixed(2)} h`} />
            <SummaryItem label="Total shortfall" value={`${summary.totalShortfall.toFixed(2)} h`} negative />
          </div>
        </div>
      )}

      <BulkReminderProgressModal
        open={bulkProgress.open}
        total={bulkProgress.total}
        result={bulkProgress.result}
        error={bulkProgress.error}
        onClose={closeBulkProgress}
      />
    </div>
  );
};

export default EmployeeWorkLogComplianceReport;
