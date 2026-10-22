import { useState } from 'react';
import dayjs from 'dayjs';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { employeeReportsApi } from '@/api/employeeReports.api';
import { useEmployeeDailyReport, useEmployeeMonthlyReport, useEmployeeRangeReport } from '@/hooks/useEmployeeReports';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { downloadBlob } from '@/utils/download';
import { formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';

const REPORT_TYPES = [
  { label: 'Daily', value: 'daily' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Range', value: 'range' },
];

// Row shape is the same regardless of report type: { date, project, servicePO, hours, description, status }.
const columnHelper = createColumnHelper();
const REPORT_COLUMNS = [
  columnHelper.accessor('date', {
    header: 'Date',
    size: 110,
    cell: (info) => <span className="whitespace-nowrap text-sm">{formatDate(info.getValue())}</span>,
  }),
  columnHelper.accessor('project', {
    header: 'Project',
    size: 200,
    cell: (info) => <span className="text-sm">{info.getValue() ?? '—'}</span>,
  }),
  columnHelper.accessor('servicePO', {
    header: 'Service PO',
    size: 200,
    cell: (info) => <span className="text-sm">{info.getValue() ?? '—'}</span>,
  }),
  columnHelper.accessor('hours', {
    header: 'Hours',
    size: 90,
    cell: (info) => <span className="text-sm font-medium tabular-nums">{info.getValue()}</span>,
  }),
];

const TotalHoursBar = ({ totalHours }) => (
  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
    <span className="text-sm font-medium">Total Hours</span>
    <span className="text-sm font-semibold tabular-nums">{totalHours ?? 0} hrs</span>
  </div>
);

const EmployeeReports = () => {
  const { error: showError } = useNotification();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [reportType, setReportType] = useState('daily');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const prevMonth = dayjs().subtract(1, 'month');
  const [monthYear, setMonthYear] = useState({ month: prevMonth.month() + 1, year: prevMonth.year() });
  const [range, setRange] = useState(null);

  // Only the active report type's params are passed for real — the other two hooks stay
  // disabled (their `enabled` flags require truthy params), so only one query fetches at a time.
  const daily = useEmployeeDailyReport(reportType === 'daily' ? date : undefined);
  const monthly = useEmployeeMonthlyReport(
    reportType === 'monthly' ? monthYear?.month : undefined,
    reportType === 'monthly' ? monthYear?.year : undefined
  );
  const rangeQuery = useEmployeeRangeReport(
    reportType === 'range' ? range?.startDate : undefined,
    reportType === 'range' ? range?.endDate : undefined
  );

  const { data, isLoading, isError } =
    reportType === 'daily' ? daily : reportType === 'monthly' ? monthly : rangeQuery;

  const hasSelection = reportType !== 'range' || !!range;
  const rows = hasSelection ? (data?.rows ?? []) : [];

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
            {rows.length > 0 && (
              <Button variant="outline" size="toolbar" disabled={isExporting} onClick={handleExport}>
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      {/* Collapsible filter panel */}
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[160px]">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Report Type</Label>
            <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
              {REPORT_TYPES.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setReportType(value)}
                  className={cn(
                    'flex-1 px-3 h-full font-medium text-center whitespace-nowrap transition-colors border-r last:border-r-0',
                    reportType === value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {reportType === 'daily' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Date</Label>
              <DatePicker
                value={date}
                max={dayjs().format('YYYY-MM-DD')}
                onChange={setDate}
                className="w-full bg-white text-sm"
              />
            </div>
          )}

          {reportType === 'monthly' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Month</Label>
              <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-9 w-full text-sm bg-white" />
            </div>
          )}

          {reportType === 'range' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Date Range</Label>
              <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-9 w-full text-sm bg-white" clearable />
            </div>
          )}
      </FilterPanel>

      {hasSelection && isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load report data. Please try again.
        </div>
      )}
      <DataTable
        columns={REPORT_COLUMNS}
        data={rows}
        isLoading={hasSelection && isLoading}
        toolbar={null}
        emptyState={
          <EmptyState
            title={hasSelection ? 'No work log entries for this period.' : 'Select a date range to view your work log report.'}
          />
        }
      />
      {hasSelection && rows.length > 0 && <TotalHoursBar totalHours={data?.totalHours} />}
    </div>
  );
};

export default EmployeeReports;
