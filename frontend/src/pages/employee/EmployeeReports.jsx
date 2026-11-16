import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { createColumnHelper } from '@tanstack/react-table';
import { CalendarDays, Download, FileText, FolderKanban } from 'lucide-react';
import { employeeReportsApi } from '@/api/employeeReports.api';
import { useEmployeeDailyReport, useEmployeeMonthlyReport, useEmployeeRangeReport } from '@/hooks/useEmployeeReports';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { downloadBlob } from '@/utils/download';
import { formatDate, formatHours, formatMonthYear } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { StatPill } from '@/pages/auditLogs/auditLogsShared';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import ReportTypeToggle from '@/components/common/ReportTypeToggle';
import { useExportConfirm } from '@/components/common/ExportConfirm';

// 'weekly' reuses useEmployeeRangeReport exactly like 'range' does — WeekPicker just snaps
// selection to a Mon-Sat business week instead of two free clicks, writing the same `range` state, so
// every "not daily, not monthly" branch below (the query choice, hasSelection, handleExport)
// already covers it with no separate case needed.
const REPORT_TYPES = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Range', value: 'range' },
];

// Row shape is the same regardless of report type: { date, project, servicePO, hours, description, status }.
const columnHelper = createColumnHelper();

const DateCell = ({ value }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-foreground">
    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    {formatDate(value)}
  </span>
);

const IconText = ({ icon: Icon, tone, children }) => (
  <span className="flex min-w-0 items-center gap-2">
    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
    <span className="truncate text-sm text-foreground" title={typeof children === 'string' ? children : undefined}>{children}</span>
  </span>
);

const HoursChip = ({ value }) => (
  <span className="inline-flex items-center justify-end rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold tabular-nums text-primary">
    {formatHours(Number(value) || 0)}
  </span>
);

const REPORT_COLUMNS = [
  columnHelper.accessor('date', {
    header: 'Date',
    size: 130,
    cell: (info) => <DateCell value={info.getValue()} />,
  }),
  columnHelper.accessor('project', {
    header: 'Project',
    size: 220,
    meta: { sticky: true },
    cell: (info) => <IconText icon={FolderKanban} tone="bg-primary/10 text-primary">{info.getValue() ?? '—'}</IconText>,
  }),
  columnHelper.accessor('servicePO', {
    header: 'Service PO',
    size: 220,
    cell: (info) => <IconText icon={FileText} tone="bg-sky-500/10 text-sky-600">{info.getValue() ?? '—'}</IconText>,
  }),
  columnHelper.accessor('hours', {
    header: 'Hours',
    size: 100,
    meta: { align: 'right' },
    cell: (info) => <span className="flex justify-end"><HoursChip value={info.getValue()} /></span>,
  }),
];

const MobileEntryCard = (row) => (
  <div className="rounded-xl border bg-card p-3 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-semibold text-foreground">{row.project ?? '—'}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
          {row.servicePO ?? '—'}
        </p>
      </div>
      <HoursChip value={row.hours} />
    </div>
    <p className="mt-2 flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
      <CalendarDays className="h-3 w-3" aria-hidden="true" />
      {formatDate(row.date)}
    </p>
  </div>
);

const EmployeeReports = () => {
  const confirmExport = useExportConfirm();
  const { error: showError } = useNotification();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [reportType, setReportType] = useState('monthly');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [monthYear, setMonthYear] = useState({ month: dayjs().month() + 1, year: dayjs().year() });
  const [range, setRange] = useState(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  useEffect(() => {
    setPage(1);
  }, [reportType, date, monthYear, range]);
  const paging = useMemo(() => ({ page, limit }), [page, limit]);

  // Only the active report type's params are passed for real — the other two hooks stay
  // disabled (their `enabled` flags require truthy params), so only one query fetches at a time.
  const daily = useEmployeeDailyReport(reportType === 'daily' ? date : undefined, paging);
  const monthly = useEmployeeMonthlyReport(
    reportType === 'monthly' ? monthYear?.month : undefined,
    reportType === 'monthly' ? monthYear?.year : undefined,
    paging
  );
  const rangeQuery = useEmployeeRangeReport(
    reportType === 'range' || reportType === 'weekly' ? range?.startDate : undefined,
    reportType === 'range' || reportType === 'weekly' ? range?.endDate : undefined,
    paging
  );

  const { data, isLoading, isError } =
    reportType === 'daily' ? daily : reportType === 'monthly' ? monthly : rangeQuery;

  const hasSelection = (reportType !== 'range' && reportType !== 'weekly') || !!range;
  const rows = useMemo(() => (hasSelection ? (data?.rows ?? []) : []), [hasSelection, data]);

  // Server-paginated once the backend returns `pagination`; until then it still sends every row
  // and the page is sliced here, so both backends render the same.
  const serverPaging = data?.pagination;
  const totalCount = hasSelection ? (serverPaging?.total ?? rows.length) : 0;
  const pagedRows = useMemo(
    () => (serverPaging ? rows : rows.slice((page - 1) * limit, page * limit)),
    [serverPaging, rows, page, limit]
  );

  // A paginated response only carries one page of rows, so period-wide counts must come from
  // the backend's `summary`; the row-based counts are the fallback for the unpaginated API.
  const stats = useMemo(() => {
    const summary = data?.summary;
    return {
      entries: summary?.totalEntries ?? totalCount,
      projects: summary?.projectCount ?? new Set(rows.map((r) => r.project).filter(Boolean)).size,
      servicePOs: summary?.servicePoCount ?? new Set(rows.map((r) => r.servicePO).filter(Boolean)).size,
    };
  }, [data, rows, totalCount]);

  const periodText =
    reportType === 'daily'
      ? formatDate(date)
      : reportType === 'monthly'
        ? formatMonthYear(monthYear?.month, monthYear?.year)
        : range?.startDate && range?.endDate
          ? `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`
          : '—';

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let result;
      if (reportType === 'daily') {
        result = await employeeReportsApi.getDaily({ date, format: 'excel' });
      } else if (reportType === 'monthly') {
        result = await employeeReportsApi.getMonthly({ month: monthYear.month, year: monthYear.year, format: 'excel' });
      } else {
        if (!range) return;
        result = await employeeReportsApi.getRange({ startDate: range.startDate, endDate: range.endDate, format: 'excel' });
      }
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="PO Wise Report"
        actions={
          <div className="flex items-center gap-3">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
            />
            {/* Always visible so it's discoverable; disabled (with the reason on hover) until the
                selected period actually has rows to export. */}
            <span title={totalCount === 0 ? 'No entries to export for the selected period' : undefined}>
              <Button
                variant="outline"
                size="toolbar"
                disabled={isExporting || totalCount === 0 || isLoading}
                onClick={() => confirmExport(handleExport)}
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            </span>
          </div>
        }
      />

      {/* Collapsible filter panel */}
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[160px]">
          <ReportTypeToggle options={REPORT_TYPES} value={reportType} onChange={setReportType} />

          {reportType === 'daily' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Date</Label>
              <DatePicker
                value={date}
                max={dayjs().format('YYYY-MM-DD')}
                onChange={setDate}
                className="w-full bg-white"
              />
            </div>
          )}

          {reportType === 'monthly' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Month</Label>
              <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white" />
            </div>
          )}

          {reportType === 'weekly' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Week</Label>
              <WeekPicker value={range} onChange={setRange} placeholder="Select a week" className="w-full" />
            </div>
          )}

          {reportType === 'range' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Date Range</Label>
              <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white" clearable />
            </div>
          )}
      </FilterPanel>

      {hasSelection && isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load report data. Please try again.
        </div>
      )}

      {hasSelection && !isLoading && totalCount > 0 && (
        <div className="flex shrink-0 flex-wrap gap-[clamp(0.4rem,0.7vw,0.75rem)]">
          <StatPill tone="blue" label="Total Hours" value={formatHours(Number(data?.totalHours) || 0)} />
          <StatPill tone="violet" label="Entries" value={stats.entries} />
          <StatPill tone="emerald" label="Projects" value={stats.projects} />
          <StatPill tone="rose" label="Service POs" value={stats.servicePOs} />
          <StatPill tone="slate" label="Period" value={periodText} />
        </div>
      )}

      <DataTable
        columns={REPORT_COLUMNS}
        data={pagedRows}
        isLoading={hasSelection && isLoading}
        toolbar={null}
        tableContainerClassName="rounded-xl shadow-sm"
        mobileCards
        mobileCardRenderer={MobileEntryCard}
        pagination={totalCount > 0 ? { page, limit, total: totalCount } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setLimit(size); setPage(1); }}
        emptyState={
          <EmptyState
            title={hasSelection ? 'No work log entries for this period.' : 'Select a date range to view your work log report.'}
          />
        }
      />
    </div>
  );
};

export default EmployeeReports;
