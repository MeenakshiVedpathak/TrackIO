import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Info, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { useNotification } from '@/hooks/useNotification';
import { downloadBlob } from '@/utils/download';
import { formatDate, formatHours } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import PageHeader from '@/components/common/PageHeader';
import FilterPanel from '@/components/common/FilterPanel';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import EntityFilter from '@/components/common/EntityFilter';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import MobilePagination from '@/components/common/MobilePagination';
import { useExportConfirm } from '@/components/common/ExportConfirm';
import HoursBasisToggle, { HOURS_ADJUSTED, HOURS_ORIGINAL } from '@/components/common/HoursBasisToggle';
import { StatPill, STAT_TONES } from '@/pages/auditLogs/auditLogsShared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect } from '@/components/ui/multi-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const FILTER_CONTROL = 'h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]';
const now = dayjs();

const MAPPING_TYPE_LABEL = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  'PRIMARY, SECONDARY': 'Primary, Secondary',
};

const PAGE_SIZES = [10, 20, 50, 100];

const is403 = (err) => err?.response?.status === 403;

const EMPLOYEE_W = 'clamp(9.5rem,14vw,13.75rem)';
const EMPLOYEE_COL = 'w-[clamp(9.5rem,14vw,13.75rem)] min-w-[clamp(9.5rem,14vw,13.75rem)] max-w-[clamp(9.5rem,14vw,13.75rem)]';
const PO_COL = 'w-[clamp(7rem,9.5vw,9.5rem)] min-w-[clamp(7rem,9.5vw,9.5rem)] max-w-[clamp(7rem,9.5vw,9.5rem)]';
const TOTAL_COL = 'w-[clamp(4.5rem,5.5vw,5.25rem)] min-w-[clamp(4.5rem,5.5vw,5.25rem)] max-w-[clamp(4.5rem,5.5vw,5.25rem)]';

const BAND_H = 'h-[clamp(1.75rem,2vw,2.25rem)]';
const BAND_OFFSET = 'top-[clamp(1.75rem,2vw,2.25rem)]';
const CELL_PAD = 'px-[clamp(0.5rem,0.8vw,1rem)] py-[clamp(0.375rem,0.6vw,0.625rem)]';
const HEAD_TEXT = 'text-[clamp(0.625rem,0.7vw,0.6875rem)] font-semibold uppercase tracking-wider';
const BODY_TEXT = 'text-[clamp(0.6875rem,0.75vw,0.75rem)]';

const STICKY_LEFT = 'sticky left-0 shadow-[2px_0_4px_-2px_rgb(0_0_0/0.12)]';
const STICKY_RIGHT = 'sticky right-0 shadow-[-2px_0_4px_-2px_rgb(0_0_0/0.12)]';

const HoursCell = ({ hours, mapped, isTotals }) => {
  const value = Number(hours) || 0;
  if (value === 0) {
    return <span className={cn('tabular-nums text-muted-foreground/70', isTotals && 'font-semibold')}>0 hrs</span>;
  }
  if (!isTotals && !mapped) {
    return (
      <span
        className="rounded bg-amber-50 px-1.5 py-0.5 font-medium tabular-nums text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        title="Not mapped to this employee"
      >
        {formatHours(value)}
      </span>
    );
  }
  return <span className={cn('tabular-nums', isTotals ? 'font-bold' : 'font-semibold')}>{formatHours(value)}</span>;
};

const PoTooltipBody = ({ po }) => (
  <>
    <p className="font-semibold">{po.service_po_name}</p>
    {po.service_po_code && <p>Code: {po.service_po_code}</p>}
    {po.client_name && <p>Client: {po.client_name}</p>}
    {po.project_name && <p>Project: {po.project_name}</p>}
    <p>BU: {[po.bu_name, po.sub_bu_name].filter(Boolean).join(' › ') || '—'}</p>
    {po.is_centralised && <p className="text-sky-300">Centralised Service PO</p>}
    {po.is_cross_bu && !po.is_centralised && <p className="text-amber-400">Cross-BU Service PO</p>}
  </>
);

const PoHeader = ({ po }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        {po.is_centralised && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-label="Centralised" />
        )}
        {po.is_cross_bu && !po.is_centralised && (
          <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Cross BU
          </span>
        )}
        <span className="truncate">{po.service_po_name || '—'}</span>
      </div>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[280px] space-y-0.5 text-xs">
      <PoTooltipBody po={po} />
    </TooltipContent>
  </Tooltip>
);

const isPoMapped = (row, poId) => (row.mapped_po_ids ?? []).some((id) => String(id) === poId);

const EmployeePoMatrix = ({ poColumns, rows, employeeCount, totals, isLoading }) => {
  const poCount = poColumns.length;

  return (
    <div className="relative min-h-0 flex-initial overflow-auto rounded-lg border bg-card">
      <table className={cn('w-max min-w-full border-separate border-spacing-0', BODY_TEXT)}>
        <thead>
          <tr>
            <th
              rowSpan={2}
              className={cn(EMPLOYEE_COL, STICKY_LEFT, CELL_PAD, 'top-0 z-30 border-b border-r bg-slate-100 text-left align-middle dark:bg-slate-800')}
            >
              <span className={cn('flex items-center gap-2 text-slate-700 dark:text-slate-200', HEAD_TEXT)}>
                <Users className="h-[clamp(0.75rem,0.9vw,0.875rem)] w-[clamp(0.75rem,0.9vw,0.875rem)] shrink-0" />
                Employees
                <span className="rounded-full bg-slate-200 px-1.5 tabular-nums dark:bg-slate-700">{employeeCount}</span>
              </span>
            </th>
            {poCount > 0 && (
              <th
                colSpan={poCount}
                className={cn(
                  BAND_H,
                  'sticky top-0 z-20 border-b bg-card px-[clamp(0.5rem,0.8vw,1rem)] text-left',
                  'bg-[linear-gradient(hsl(var(--primary)/0.1),hsl(var(--primary)/0.1))] dark:bg-[linear-gradient(hsl(var(--primary)/0.2),hsl(var(--primary)/0.2))]',
                )}
              >
                <span
                  className={cn('sticky inline-flex items-center gap-2 text-primary', HEAD_TEXT)}
                  style={{ left: `calc(${EMPLOYEE_W} + 0.75rem)` }}
                >
                  <FileText className="h-[clamp(0.75rem,0.9vw,0.875rem)] w-[clamp(0.75rem,0.9vw,0.875rem)] shrink-0" />
                  Service POs
                  <span className="rounded-full bg-primary/15 px-1.5 tabular-nums">{poCount}</span>
                </span>
              </th>
            )}
            <th
              rowSpan={2}
              className={cn(TOTAL_COL, STICKY_RIGHT, CELL_PAD, HEAD_TEXT, 'top-0 z-30 border-b border-l bg-slate-100 text-right align-middle text-slate-700 dark:bg-slate-800 dark:text-slate-200')}
            >
              Total
            </th>
          </tr>
          <tr>
            {poColumns.map((po) => (
              <th
                key={po.service_po_id}
                className={cn(PO_COL, BAND_OFFSET, CELL_PAD, 'sticky z-20 border-b border-r border-r-border/50 bg-slate-50 text-right font-semibold text-foreground last:border-r-0 dark:bg-slate-900')}
              >
                <PoHeader po={po} />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td className={cn(EMPLOYEE_COL, STICKY_LEFT, CELL_PAD, 'z-10 border-b border-r bg-card')}>
                  <Skeleton className="h-4 w-3/4" />
                </td>
                {poColumns.map((po) => (
                  <td key={po.service_po_id} className={cn(PO_COL, CELL_PAD, 'border-b')}><Skeleton className="ml-auto h-4 w-12" /></td>
                ))}
                <td className={cn(TOTAL_COL, STICKY_RIGHT, CELL_PAD, 'z-10 border-b border-l bg-card')}>
                  <Skeleton className="ml-auto h-4 w-10" />
                </td>
              </tr>
            ))
          ) : (
            rows.map((r) => (
              <tr key={r.employee_id} className="group">
                <td className={cn(EMPLOYEE_COL, STICKY_LEFT, CELL_PAD, 'z-10 border-b border-r bg-card group-hover:bg-slate-50 dark:group-hover:bg-slate-800')}>
                  <p className="truncate text-[clamp(0.75rem,0.85vw,0.875rem)] font-medium text-foreground" title={r.employee_name}>
                    {r.employee_name || '—'}
                  </p>
                  {Array.isArray(r.employee_bu_names) && r.employee_bu_names.length > 0 && (
                    <p className="truncate text-[10px] text-muted-foreground" title={r.employee_bu_names.join(', ')}>
                      {r.employee_bu_names.join(', ')}
                    </p>
                  )}
                </td>
                {poColumns.map((po) => {
                  const poId = String(po.service_po_id);
                  return (
                    <td key={poId} className={cn(PO_COL, CELL_PAD, 'border-b text-right group-hover:bg-muted/40')}>
                      <HoursCell hours={r.hours?.[poId]} mapped={isPoMapped(r, poId)} />
                    </td>
                  );
                })}
                <td className={cn(TOTAL_COL, STICKY_RIGHT, CELL_PAD, 'z-10 border-b border-l bg-card text-right font-bold tabular-nums group-hover:bg-slate-50 dark:group-hover:bg-slate-800')}>
                  {formatHours(Number(r.total_hours) || 0)}
                </td>
              </tr>
            ))
          )}
        </tbody>

        {!isLoading && rows.length > 0 && (
          <tfoot>
            <tr>
              <td className={cn(EMPLOYEE_COL, STICKY_LEFT, CELL_PAD, HEAD_TEXT, 'bottom-0 z-30 border-t-2 border-r bg-slate-100 dark:bg-slate-800')}>
                Total
              </td>
              {poColumns.map((po) => (
                <td key={po.service_po_id} className={cn(PO_COL, CELL_PAD, 'sticky bottom-0 z-20 border-t-2 bg-slate-100 text-right dark:bg-slate-800')}>
                  <HoursCell hours={totals.by_po?.[String(po.service_po_id)]} isTotals />
                </td>
              ))}
              <td className={cn(TOTAL_COL, STICKY_RIGHT, CELL_PAD, 'bottom-0 z-30 border-t-2 border-l bg-slate-200 text-right font-bold tabular-nums dark:bg-slate-700')}>
                {formatHours(Number(totals.grand_total) || 0)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

const PoHoursList = ({ poColumns, hours, row, isTotals }) => {
  const sorted = useMemo(
    () => [...poColumns].sort((a, b) => (Number(hours?.[String(b.service_po_id)]) || 0) - (Number(hours?.[String(a.service_po_id)]) || 0)),
    [poColumns, hours]
  );
  return (
    <ul className="divide-y">
      {sorted.map((po) => {
        const poId = String(po.service_po_id);
        return (
          <li key={poId} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {po.is_centralised && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-label="Centralised" />}
              {po.is_cross_bu && !po.is_centralised && (
                <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Cross BU
                </span>
              )}
              <span className="truncate text-foreground">{po.service_po_name || '—'}</span>
            </span>
            <span className="shrink-0 text-xs">
              <HoursCell hours={hours?.[poId]} mapped={isTotals || isPoMapped(row, poId)} isTotals={isTotals} />
            </span>
          </li>
        );
      })}
    </ul>
  );
};

const MobileEmployeeCard = ({ title, subtitle, total, poColumns, hours, row, isTotals, expanded, onToggle }) => (
  <div className={cn('overflow-hidden rounded-lg border', isTotals ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-card')}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex min-h-[44px] w-full items-center justify-between gap-2 p-3.5 text-left active:bg-muted/30"
    >
      <span className="flex min-w-0 items-center gap-2">
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex min-w-0 flex-col">
          <span className={cn('min-w-0 truncate', isTotals ? 'text-xs font-bold uppercase tracking-wide' : 'font-semibold')}>{title}</span>
          {subtitle && <span className="truncate text-[10px] text-muted-foreground">{subtitle}</span>}
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">{formatHours(Number(total) || 0)}</span>
    </button>
    {expanded && (
      <div className="border-t px-3.5 pb-1 text-sm">
        <p className="pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary">Service POs</p>
        <PoHoursList poColumns={poColumns} hours={hours} row={row} isTotals={isTotals} />
      </div>
    )}
  </div>
);

const MobileEmployeeCards = ({ poColumns, rows, totals, isLoading }) => {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (isLoading) {
    return (
      <div className="flex-1 space-y-2 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto md:hidden">
      {rows.map((r) => (
        <MobileEmployeeCard
          key={r.employee_id}
          title={r.employee_name || '—'}
          subtitle={Array.isArray(r.employee_bu_names) && r.employee_bu_names.length > 0 ? r.employee_bu_names.join(', ') : null}
          total={r.total_hours}
          poColumns={poColumns}
          hours={r.hours}
          row={r}
          expanded={expanded.has(r.employee_id)}
          onToggle={() => toggle(r.employee_id)}
        />
      ))}
      {rows.length > 0 && (
        <MobileEmployeeCard
          title="Total (all employees)"
          total={totals.grand_total}
          poColumns={poColumns}
          hours={totals.by_po}
          isTotals
          expanded={expanded.has('__totals__')}
          onToggle={() => toggle('__totals__')}
        />
      )}
    </div>
  );
};

const DesktopPagination = ({ page, limit, total, onPageChange, onLimitChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="hidden shrink-0 items-center justify-between gap-3 pt-3 text-sm md:flex">
      <p className="text-[clamp(0.6875rem,0.75vw,0.75rem)] text-muted-foreground">
        Showing {from}–{to} of {total} employees
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[clamp(0.6875rem,0.75vw,0.75rem)] text-muted-foreground">Rows per page</span>
          <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
            <SelectTrigger className="h-[clamp(1.5rem,1.6vw,1.75rem)] w-[clamp(3.25rem,4vw,4rem)] bg-white text-[clamp(0.6875rem,0.75vw,0.75rem)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-[clamp(0.6875rem,0.75vw,0.75rem)] text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const MobileSummaryTile = ({ label, value, tone, className }) => (
  <div className={cn('rounded-lg border px-3 py-2', STAT_TONES[tone], className)}>
    <p className="text-xs">{label}</p>
    <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
  </div>
);

const EmployeePoHoursMatrixReport = ({
  title,
  useReport,
  useFilterOptions,
  exportReport,
  noAccessTitle = "You don't have access for this report.",
  noAccessDescription = 'You do not have permission to view this report.',
  noEmployeesTitle = 'No employees found.',
  noPoColumnsTitle,
  noPoColumnsDescription,
  emptyRecordsTitle = 'No records for the selected filters.',
  // Adds a single-select BU scope (sent as X-Company-Id) that narrows the EMPLOYEES; the
  // buIds/subBuIds multi-selects only ever narrow the PO columns.
  showEmployeeBuScope = false,
}) => {
  const { error: showError } = useNotification();
  const confirmExport = useExportConfirm();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [periodMode, setPeriodMode] = useState('month'); // 'month' | 'range'
  const [monthYear, setMonthYear] = useState({ month: now.month() + 1, year: now.year() });
  const [dateRange, setDateRange] = useState(null);
  const [hoursBasis, setHoursBasis] = useState('original');

  const [scopeBuId, setScopeBuId] = useState(ALL_BUS);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [subBuIds, setSubBuIds] = useState([]);
  const [clientIds, setClientIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [servicePoIds, setServicePoIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const periodParams = periodMode === 'month'
    ? { month: monthYear.month, year: monthYear.year, buId: scopeBuId }
    : { startDate: dateRange?.startDate, endDate: dateRange?.endDate, buId: scopeBuId };
  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const { data: filterOptionsRes, error: filterOptionsError } = useFilterOptions(periodReady ? periodParams : undefined);

  const filterOptionsLoaded = !!filterOptionsRes;
  const filterOptionsLoading = !filterOptionsRes && !filterOptionsError;
  const employees = filterOptionsRes?.data?.employees ?? [];
  const clients = filterOptionsRes?.data?.clients ?? [];
  const projects = filterOptionsRes?.data?.projects ?? [];
  const servicePos = filterOptionsRes?.data?.servicePos ?? [];
  const businessUnits = filterOptionsRes?.data?.businessUnits ?? [];
  const subBusinessUnits = filterOptionsRes?.data?.subBusinessUnits ?? [];

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
    label: `${e.full_name} (${e.employee_code})${e.mapping_type ? ` · ${MAPPING_TYPE_LABEL[e.mapping_type] ?? e.mapping_type}` : ''}`,
    value: String(e.id),
  })), [employees]);
  const clientOptions = useMemo(() => clients.map((c) => ({ label: c.name, value: String(c.id) })), [clients]);
  const projectSelectOptions = useMemo(() => projectOptions.map((p) => ({ label: p.name, value: String(p.id) })), [projectOptions]);
  const servicePoSelectOptions = useMemo(() => servicePoOptions.map((po) => {
    const baseLabel = po.code ? `${po.name} (${po.code})` : po.name;
    const isCrossBu = po.is_cross_bu && !po.is_centralised;
    return {
      label: isCrossBu ? `${baseLabel} (Cross BU)` : baseLabel,
      value: String(po.id),
    };
  }), [servicePoOptions]);
  const buOptions = useMemo(() => businessUnits.map((b) => ({ label: b.name, value: String(b.id) })), [businessUnits]);
  const subBuSelectOptions = useMemo(() => subBuOptions.map((s) => ({ label: s.name, value: String(s.id) })), [subBuOptions]);

  const queryParams = useMemo(() => ({
    ...periodParams,
    hoursBasis,
    ...(employeeIds.length && { employeeIds: employeeIds.join(',') }),
    ...(clientIds.length && { clientIds: clientIds.join(',') }),
    ...(projectIds.length && { projectIds: projectIds.join(',') }),
    ...(servicePoIds.length && { servicePoIds: servicePoIds.join(',') }),
    ...(entityIds.length && { entityIds: entityIds.join(',') }),
    ...(buIds.length && { buIds: buIds.join(',') }),
    ...(subBuIds.length && { subBuIds: subBuIds.join(',') }),
    ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
  }), [
    periodMode, monthYear.month, monthYear.year, dateRange?.startDate, dateRange?.endDate, scopeBuId, hoursBasis, employeeIds, clientIds, projectIds, servicePoIds,
    entityIds, buIds, subBuIds, debouncedSearch,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  const { data, isLoading, isError, error } = useReport(periodReady ? queryParams : undefined);

  const report = data?.data ?? {};
  const poColumns = useMemo(() => report.columns ?? [], [report.columns]);
  const rows = useMemo(() => report.data ?? [], [report.data]);
  const totals = report.totals ?? {};
  const showSyncBanner = report.hours_basis === 'adjusted' && report.sync_available === false && !!report.message;

  useEffect(() => {
    setPage(1);
  }, [queryParams]);

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const pagedRows = useMemo(() => rows.slice((page - 1) * limit, page * limit), [rows, page, limit]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportReport(queryParams);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const activeFilterCount = [
    periodMode !== 'month',
    hoursBasis !== 'original',
    scopeBuId !== ALL_BUS,
    entityIds.length > 0,
    buIds.length > 0,
    subBuIds.length > 0,
    clientIds.length > 0,
    projectIds.length > 0,
    servicePoIds.length > 0,
    employeeIds.length > 0,
  ].filter(Boolean).length;

  const handleReset = () => {
    setPeriodMode('month');
    setMonthYear({ month: now.month() + 1, year: now.year() });
    setDateRange(null);
    setHoursBasis('original');
    setScopeBuId(ALL_BUS);
    setEntityIds([]);
    setBuIds([]);
    setSubBuIds([]);
    setClientIds([]);
    setProjectIds([]);
    setServicePoIds([]);
    setEmployeeIds([]);
    setSearch('');
    setPage(1);
  };

  const noManagerAccess = is403(error) || is403(filterOptionsError);
  const basisLabel = (report.hours_basis ?? hoursBasis) === 'adjusted' ? 'Adjusted' : 'Original';
  const periodLabel = report.period?.start_date && report.period?.end_date
    ? `${formatDate(report.period.start_date)} – ${formatDate(report.period.end_date)}`
    : periodMode === 'month'
      ? dayjs(`${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`).format('MMM YYYY')
      : dateRange?.startDate && dateRange?.endDate
        ? `${formatDate(dateRange.startDate)} – ${formatDate(dateRange.endDate)}`
        : '—';
  const totalHoursLabel = formatHours(Number(totals.grand_total) || 0);
  const employeeCount = totals.employee_count ?? rows.length;
  const poCount = totals.po_count ?? poColumns.length;

  return (
    <div className="flex h-full min-h-0 flex-col space-y-[clamp(0.75rem,1.2vw,1rem)]">
      <PageHeader
        title={title}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee name or code…"
              className="w-full sm:w-full md:w-64"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
            />
            {rows.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={() => confirmExport(handleExport)} disabled={isExporting}>
                <Download />{isExporting ? 'Exporting…' : 'Export Excel'}
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

        <HoursBasisToggle
          value={hoursBasis === 'adjusted' ? HOURS_ADJUSTED : HOURS_ORIGINAL}
          onChange={(v) => setHoursBasis(v === HOURS_ADJUSTED ? 'adjusted' : 'original')}
          labelClassName={FILTER_LABEL}
        />

        <EntityFilter multiple value={entityIds} onChange={setEntityIds} labelClassName={FILTER_LABEL} />

        {showEmployeeBuScope && (
          <BusinessUnitFilter
            label="Employee Business Unit"
            value={scopeBuId}
            onChange={(v) => {
              setScopeBuId(v);
              setBuIds([]);
              setSubBuIds([]);
              setClientIds([]);
              setProjectIds([]);
              setServicePoIds([]);
              setEmployeeIds([]);
            }}
            className={FILTER_CONTROL}
            labelClassName={FILTER_LABEL}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>{showEmployeeBuScope ? 'Service PO Business Unit' : 'Business Unit'}</Label>
          <MultiSelect
            options={buOptions}
            value={buIds}
            onValueChange={setBuIds}
            placeholder="All Business Units"
            searchPlaceholder="Search business unit..."
            loading={filterOptionsLoading}
            className={FILTER_CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>{showEmployeeBuScope ? 'Service PO Sub-BU' : 'Sub-BU'}</Label>
          <MultiSelect
            options={subBuSelectOptions}
            value={subBuIds}
            onValueChange={setSubBuIds}
            placeholder="All Sub-BUs"
            searchPlaceholder="Search sub-BU..."
            loading={filterOptionsLoading}
            className={FILTER_CONTROL}
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
            loading={filterOptionsLoading}
            className={FILTER_CONTROL}
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
            loading={filterOptionsLoading}
            className={FILTER_CONTROL}
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
            loading={filterOptionsLoading}
            className={FILTER_CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <MultiSelect
            options={employeeOptions}
            value={employeeIds}
            onValueChange={setEmployeeIds}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            loading={filterOptionsLoading}
            className={FILTER_CONTROL}
          />
        </div>
      </FilterPanel>

      {noManagerAccess ? (
        <EmptyState
          title={noAccessTitle}
          description={noAccessDescription}
        />
      ) : filterOptionsLoaded && employees.length === 0 ? (
        <EmptyState title={noEmployeesTitle} />
      ) : !isLoading && !isError && poColumns.length === 0 && noPoColumnsTitle ? (
        <EmptyState title={noPoColumnsTitle} description={noPoColumnsDescription} />
      ) : (
        <>
          {!isLoading && (
            <>
              <div className="hidden shrink-0 flex-wrap gap-[clamp(0.4rem,0.7vw,0.75rem)] md:flex">
                <StatPill tone="blue" label="Total Hours" value={totalHoursLabel} />
                <StatPill tone="violet" label="Employees" value={employeeCount} />
                <StatPill tone="emerald" label="Service POs" value={poCount} />
                <StatPill tone="slate" label="Period" value={periodLabel} />
                <StatPill tone={basisLabel === 'Adjusted' ? 'rose' : 'blue'} label="Basis" value={basisLabel} />
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 md:hidden">
                <MobileSummaryTile tone="blue" label="Total Hours" value={totalHoursLabel} />
                <MobileSummaryTile tone="violet" label="Employees" value={employeeCount} />
                <MobileSummaryTile tone="emerald" label="Service POs" value={poCount} />
                <MobileSummaryTile tone={basisLabel === 'Adjusted' ? 'rose' : 'blue'} label="Basis" value={basisLabel} />
                <MobileSummaryTile tone="slate" label="Period" value={periodLabel} className="col-span-2" />
              </div>
            </>
          )}

          {showSyncBanner && (
            <Alert variant="info" className="shrink-0">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-[clamp(0.75rem,0.85vw,0.875rem)]">{report.message}</AlertDescription>
            </Alert>
          )}

          {isError ? (
            <div className="rounded-lg border p-6 text-center text-sm text-destructive">{extractApiError(error)}</div>
          ) : !isLoading && rows.length === 0 ? (
            <div className="rounded-lg border">
              <EmptyState title={emptyRecordsTitle} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="hidden min-h-0 flex-initial flex-col md:flex">
                <EmployeePoMatrix
                  poColumns={poColumns}
                  rows={pagedRows}
                  employeeCount={employeeCount}
                  totals={totals}
                  isLoading={isLoading}
                />
              </div>
              <MobileEmployeeCards poColumns={poColumns} rows={pagedRows} totals={totals} isLoading={isLoading} />

              {!isLoading && (
                <>
                  <DesktopPagination
                    page={page}
                    limit={limit}
                    total={rows.length}
                    onPageChange={setPage}
                    onLimitChange={(n) => { setLimit(n); setPage(1); }}
                  />
                  <MobilePagination
                    className="mt-3 shrink-0 md:hidden"
                    page={page}
                    totalPages={totalPages}
                    total={rows.length}
                    limit={limit}
                    itemLabel="employee"
                    onPrev={() => setPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EmployeePoHoursMatrixReport;
