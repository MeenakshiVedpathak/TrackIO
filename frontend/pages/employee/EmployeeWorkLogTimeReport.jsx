import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, ChevronDown } from 'lucide-react';
import { employeeReportsApi } from '@/api/employeeReports.api';
import { useEmployeeWorkLogTimeReport } from '@/hooks/useEmployeeReports';
import { useEmployeeProjectHoursFilterTree } from '@/hooks/useEmployeeProjectHoursReport';
import { useAuth } from '@/hooks/useAuth';
import { useMyTeamEmployees } from '@/hooks/useMyTeam';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';

const PERIOD_TYPES = [
  { label: 'Daily', value: 'daily' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Range', value: 'range' },
];

const EXPORT_FORMATS = [
  { label: 'Excel', value: 'excel' },
  { label: 'CSV', value: 'csv' },
  { label: 'PDF', value: 'pdf' },
];

// Same tree the Project Hours Report's filter uses (structure-only, cached for the session) —
// only project_id/service_po_id are filterable per the API, Parent/Child hierarchy nodes never
// appear in this dropdown.
const buildFilterOptions = (tree) => {
  const options = [{ label: 'All Projects & Service POs', value: 'all', searchValue: 'all' }];
  tree.forEach((project) => {
    options.push({
      label: <span className="font-medium">{project.project_name}</span>,
      searchValue: project.project_name,
      value: `project:${project.project_id}`,
    });
    (project.service_pos ?? []).forEach((po) => {
      options.push({
        label: (
          <span className="flex items-baseline gap-1.5" style={{ paddingLeft: 20 }}>
            <span className="text-muted-foreground">└</span>
            <span>{po.service_po_name}</span>
          </span>
        ),
        searchValue: `${project.project_name} ${po.service_po_name}`,
        value: `servicePO:${po.service_po_id}`,
      });
    });
  });
  return options;
};

const columnHelper = createColumnHelper();

const TotalHoursBar = ({ totalHours }) => (
  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
    <span className="text-sm font-medium">Total Hours</span>
    <span className="text-sm font-semibold tabular-nums">{totalHours ?? 0} hrs</span>
  </div>
);

// One row per work-log entry, expanded one row per time segment when an entry has time_entries
// (Date/Project/Module/Task repeated across those rows, Start/End specific to that segment) —
// an entry with no time_entries still returns exactly one row (nulls for start/end). See
// GET /employee-reports/work-log-time. startTime/endTime come back null for older/plain-hours
// entries, and `module` is null when no hierarchy node was tagged at all — both shown as "—"
// rather than fabricated. `combinedHours`/`combinedHoursLabel` repeat the same
// Module/Task/date-level total (e.g. "1 hr 50 mins") across every one of that entry's segment
// rows, distinct from `totalHours` which is that one segment's own duration. A Manager
// additionally gets an employee picker (own team, or "My Work Log" for just themselves) and an
// Employee column; a plain Employee only ever sees their own rows so that column is redundant
// and left out.
const EmployeeWorkLogTimeReport = () => {
  const { error: showError } = useNotification();
  const { hasRole } = useAuth();
  const isManager = hasRole('Manager');
  const { data: mappedEmployees = [] } = useMyTeamEmployees({ enabled: isManager });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const employeeOptions = [
    { value: '', label: 'My Work Log' },
    ...mappedEmployees.map((e) => ({ value: String(e.id), label: e.full_name })),
  ];

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [periodType, setPeriodType] = useState('daily');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const prevMonth = dayjs().subtract(1, 'month');
  const [monthYear, setMonthYear] = useState({ month: prevMonth.month() + 1, year: prevMonth.year() });
  const [range, setRange] = useState(null);
  const [filterValue, setFilterValue] = useState('all');

  const { data: filterTree = [] } = useEmployeeProjectHoursFilterTree();
  const filterOptions = useMemo(() => buildFilterOptions(filterTree), [filterTree]);

  const hasSelection = periodType !== 'range' || !!range;

  const periodParams =
    periodType === 'daily'
      ? { startDate: date, endDate: date }
      : periodType === 'monthly'
        ? { month: monthYear?.month, year: monthYear?.year }
        : { startDate: range?.startDate, endDate: range?.endDate };

  const [filterKind, filterId] = filterValue.split(':');
  const filterParams =
    filterKind === 'project'
      ? { project_id: filterId }
      : filterKind === 'servicePO'
        ? { service_po_id: filterId }
        : {};

  const params = {
    ...periodParams,
    ...filterParams,
    ...(isManager && selectedEmployeeId ? { employee_id: selectedEmployeeId } : {}),
  };

  const { data, isLoading, isError } = useEmployeeWorkLogTimeReport(params, hasSelection);
  const rows = hasSelection ? (data?.rows ?? []) : [];

  const columns = useMemo(() => {
    const cols = [
      columnHelper.accessor('date', {
        header: 'Date',
        size: 100,
        cell: (info) => <span className="whitespace-nowrap text-sm">{formatDate(info.getValue())}</span>,
      }),
    ];
    if (isManager) {
      cols.push(
        columnHelper.accessor('name', {
          header: 'Employee',
          size: 160,
          cell: (info) => (
            <div className="text-sm">
              <div>{info.getValue() ?? '—'}</div>
              <div className="text-xs text-muted-foreground">{info.row.original.employeeCode ?? ''}</div>
            </div>
          ),
        })
      );
    }
    cols.push(
      columnHelper.accessor('project', {
        header: 'Project',
        size: 160,
        cell: (info) => <span className="text-sm">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('module', {
        header: 'Module',
        size: 140,
        cell: (info) => <span className="text-sm">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('task', {
        header: 'Task',
        size: 200,
        cell: (info) => <span className="text-sm">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('startTime', {
        header: 'Start Time',
        size: 100,
        cell: (info) => <span className="whitespace-nowrap text-sm tabular-nums">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('endTime', {
        header: 'End Time',
        size: 100,
        cell: (info) => <span className="whitespace-nowrap text-sm tabular-nums">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('totalHours', {
        header: 'Hours',
        size: 80,
        cell: (info) => <span className="text-sm font-medium tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.accessor('combinedHoursLabel', {
        header: 'Total',
        size: 110,
        cell: (info) => <span className="whitespace-nowrap text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
      })
    );
    return cols;
  }, [isManager]);

  const handleExport = async (format) => {
    if (!hasSelection) return;
    setIsExporting(true);
    try {
      const result = await employeeReportsApi.getWorkLogTime({ ...params, format });
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const activeFilterCount = (filterValue !== 'all' ? 1 : 0) + (selectedEmployeeId ? 1 : 0);

  const clearFilters = () => {
    setFilterValue('all');
    setSelectedEmployeeId('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Work Log Time Report"
        description="Individual time-stamped work log entries — one row per entry, never aggregated."
        actions={
          <div className="flex items-center gap-3">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            {rows.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="toolbar" disabled={isExporting}>
                    <Download className="h-4 w-4" />
                    {isExporting ? 'Exporting…' : 'Export'}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {EXPORT_FORMATS.map(({ label, value }) => (
                    <DropdownMenuItem key={value} onClick={() => handleExport(value)} className="cursor-pointer">
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[260px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        {isManager && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
            <SearchableSelect
              options={employeeOptions}
              value={selectedEmployeeId}
              onValueChange={setSelectedEmployeeId}
              placeholder="My Work Log"
              searchPlaceholder="Search…"
              className="h-9 w-full text-sm bg-white"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Period</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
            {PERIOD_TYPES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriodType(value)}
                className={cn(
                  'flex-1 px-3 h-full font-medium text-center whitespace-nowrap transition-colors border-r last:border-r-0',
                  periodType === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {periodType === 'daily' && (
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

        {periodType === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month</Label>
            <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-9 w-full text-sm bg-white" />
          </div>
        )}

        {periodType === 'range' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date Range</Label>
            <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-9 w-full text-sm bg-white" clearable />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Project / Service PO</Label>
          <SearchableSelect
            options={filterOptions}
            value={filterValue}
            onValueChange={(v) => v && setFilterValue(v)}
            placeholder="All Projects & Service POs"
            searchPlaceholder="Search project or Service PO..."
            className="h-9 w-full text-sm bg-white"
          />
        </div>
      </FilterPanel>

      {hasSelection && isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load the work log time report. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={hasSelection && isLoading}
        toolbar={null}
        emptyState={
          <EmptyState
            title={hasSelection ? 'No work log entries for this period.' : 'Select a date range to view the report.'}
          />
        }
      />
      {hasSelection && rows.length > 0 && <TotalHoursBar totalHours={data?.totalHours} />}
    </div>
  );
};

export default EmployeeWorkLogTimeReport;
