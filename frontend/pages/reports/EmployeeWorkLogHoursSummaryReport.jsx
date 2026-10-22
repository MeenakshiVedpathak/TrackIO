import { useState, useMemo, useEffect } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import {
  User, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { useEmployeeWorkLogHoursSummary, useEmployeeWorkLogHoursSummaryDetails } from '@/hooks/useReports';
import { useEmployees } from '@/hooks/useEmployees';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatHoursMinutes, formatHourMinuteValue, getStatusColor } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterPanel from '@/components/common/FilterPanel';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import DataTable from '@/components/common/DataTable';
import SearchInput from '@/components/common/SearchInput';
import MobilePagination from '@/components/common/MobilePagination';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';

// Filter labels read as uppercase micro-labels, echoing the data table's own column headers so
// the panel and the table below it look like one surface (same treatment as ClientWiseAnalytics).
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const now = dayjs();
const columnHelper = createColumnHelper();

const formatClock = (value) => {
  if (!value) return '';
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return String(value);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12).padStart(2, '0')}:${m ?? '00'} ${suffix}`;
};

const exportToExcel = (records, periodLabel) => {
  const header = ['Employee Name', 'Employee Code', 'Period', 'Total Hours (Decimal)', 'Total Hours (Formatted)'];
  const aoa = [
    ['Employee Work Log Hours Summary Report'],
    [periodLabel ? `Period: ${periodLabel}` : ''],
    [],
    header,
  ];

  records.forEach((emp) => {
    aoa.push([
      emp.employee_name ?? '—',
      emp.employee_code ?? '—',
      periodLabel,
      Number(emp.total_hours) || 0,
      formatHoursMinutes(emp.total_hours),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 24 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hours Summary');
  XLSX.writeFile(wb, `Employee_Work_Log_Hours_Summary_${periodLabel.replace(/\s+/g, '_')}.xlsx`);
};

// Employee Work Log Details Modal
const EmployeeDetailModal = ({
  open,
  onOpenChange,
  employeeId,
  periodParams,
  companyId,
  periodLabel,
  summaryRowTotal,
}) => {
  const [detailPage, setDetailPage] = useState(1);
  const detailLimit = 10;

  const apiParams = useMemo(() => {
    const params = {
      page: detailPage,
      limit: detailLimit,
    };
    if (periodParams.periodMode === 'date') {
      params.date = periodParams.date;
    } else {
      params.month = periodParams.monthYear.month;
      params.year = periodParams.monthYear.year;
    }
    if (companyId && companyId !== ALL_BUS) {
      params.company_id = companyId;
    }
    return params;
  }, [periodParams, companyId, detailPage]);

  const { data: detailRes, isLoading, isError } = useEmployeeWorkLogHoursSummaryDetails(
    employeeId,
    apiParams,
    open
  );

  const detailData = detailRes?.data ?? {};
  const entries = detailData.entries ?? [];
  const meta = detailRes?.meta ?? {};
  const employeeInfo = detailData.employee ?? {};
  const totalHours = detailData.total_hours ?? summaryRowTotal ?? 0;
  const workLogCount = detailData.work_log_count ?? meta.total ?? entries.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-6">
        <DialogHeader className="pb-3 border-b shrink-0">
          <DialogTitle className="text-lg font-bold flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <span>{employeeInfo.full_name || 'Employee Work Log Details'}</span>
              {employeeInfo.employee_code && (
                <Badge variant="outline" className="font-mono text-xs">
                  {employeeInfo.employee_code}
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Detailed work log entries for {periodLabel}
          </DialogDescription>
        </DialogHeader>

        {/* Stats summary bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3 shrink-0">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Period</p>
            <p className="text-sm font-semibold mt-0.5">{periodLabel}</p>
          </div>
          <div className="rounded-lg border bg-primary/5 p-3">
            <p className="text-xs text-primary/80 font-medium">Total Hours</p>
            <p className="text-lg font-bold text-primary mt-0.5 tabular-nums">
              {formatHoursMinutes(totalHours)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Work Log Entries</p>
            <p className="text-sm font-semibold mt-0.5 tabular-nums">{workLogCount}</p>
          </div>
        </div>

        {/* Entries Table */}
        <div className="flex-1 overflow-y-auto min-h-0 border rounded-lg bg-white">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-sm text-destructive">
              Unable to load work log details.
            </div>
          ) : entries.length === 0 ? (
            <EmptyState title="No work log entries found for this period." />
          ) : (
            <>
              <Table className="hidden md:table">
                <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_3px_0_rgb(0,0,0,0.1)]">
                  <TableRow className="hover:bg-transparent border-b bg-slate-50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Service PO</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Project</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Module / Task</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Time Slot</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Hours</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, idx) => {
                    const hasTimes = entry.start_time && entry.end_time;
                    const timeSlot = hasTimes
                      ? `${formatClock(entry.start_time)} - ${formatClock(entry.end_time)}`
                      : '—';
                    const hierarchy = [entry.module, entry.hierarchy_task].filter(Boolean).join(' > ');
                    const poLabel = [entry.service_po_code, entry.service_po_name].filter(Boolean).join(' - ');
                    const projLabel = [entry.project_code, entry.project_name].filter(Boolean).join(' - ');

                    return (
                      <TableRow key={entry.work_log_id || idx} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {formatDate(entry.date)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={poLabel}>
                          {poLabel || '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={projLabel}>
                          {projLabel || '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[130px] truncate" title={hierarchy}>
                          {hierarchy || '—'}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {timeSlot}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-right tabular-nums">
                          {formatHourMinuteValue(entry.hours)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                            {entry.entry_type || 'HOURLY'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.status ? (
                            <Badge variant={getStatusColor(entry.status)} className="text-[10px]">
                              {entry.status}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Mobile: same `entries` data as the desktop table above, as a card list. */}
              <div className="space-y-2 p-3 md:hidden">
                {entries.map((entry, idx) => {
                  const hasTimes = entry.start_time && entry.end_time;
                  const timeSlot = hasTimes
                    ? `${formatClock(entry.start_time)} - ${formatClock(entry.end_time)}`
                    : '—';
                  const hierarchy = [entry.module, entry.hierarchy_task].filter(Boolean).join(' > ');
                  const poLabel = [entry.service_po_code, entry.service_po_name].filter(Boolean).join(' - ');
                  const projLabel = [entry.project_code, entry.project_name].filter(Boolean).join(' - ');

                  return (
                    <div key={entry.work_log_id || idx} className="rounded-lg border bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium">{formatDate(entry.date)}</p>
                        <p className="text-xs font-semibold tabular-nums">{formatHourMinuteValue(entry.hours)}h</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={poLabel}>{poLabel || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground" title={projLabel}>{projLabel || '—'}</p>
                      {hierarchy && <p className="truncate text-xs text-muted-foreground" title={hierarchy}>{hierarchy}</p>}
                      <p className="text-xs text-muted-foreground">{timeSlot}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {entry.entry_type || 'HOURLY'}
                        </Badge>
                        {entry.status && (
                          <Badge variant={getStatusColor(entry.status)} className="text-[10px]">
                            {entry.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Modal Pagination (desktop) */}
        <div className="hidden items-center justify-between border-t pt-3 mt-3 shrink-0 text-xs text-muted-foreground md:flex">
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
              disabled={!meta.hasPrev && detailPage <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailPage((p) => p + 1)}
              disabled={!meta.hasNext && detailPage >= meta.totalPages}
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
        <MobilePagination
          className="shrink-0 mt-3 border-t pt-3 md:hidden"
          page={detailPage}
          totalPages={meta.totalPages ?? 1}
          total={meta.total}
          limit={10}
          itemLabel="entry"
          onPrev={() => setDetailPage((p) => Math.max(1, p - 1))}
          onNext={() => setDetailPage((p) => p + 1)}
        />
      </DialogContent>
    </Dialog>
  );
};

const EmployeeWorkLogHoursSummaryReport = () => {
  const [showFilters, setShowFilters] = useState(false);
  const [periodMode, setPeriodMode] = useState('date'); // 'date' | 'month'
  const [selectedDate, setSelectedDate] = useState(now.format('YYYY-MM-DD'));
  const [monthYear, setMonthYear] = useState({
    month: now.month() + 1,
    year: now.year(),
  });
  const [companyId, setCompanyId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  const [sorting, setSorting] = useState([{ id: 'employee_name', desc: false }]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Selected row for detail modal
  const [modalState, setModalState] = useState({
    open: false,
    employeeId: null,
    summaryTotalHours: 0,
  });

  // BU-wise employee dropdown fetching
  const activeEmployeeParams = useMemo(() => {
    const params = { status: 'active', limit: 1000 };
    if (companyId && companyId !== ALL_BUS) {
      params.business_unit_id = companyId;
      params.company_id = companyId;
    }
    return params;
  }, [companyId]);

  const { data: employeesRes } = useEmployees(activeEmployeeParams);

  const activeEmployees = useMemo(() => {
    if (Array.isArray(employeesRes?.data)) return employeesRes.data;
    if (Array.isArray(employeesRes)) return employeesRes;
    return [];
  }, [employeesRes]);

  const employeeOptions = useMemo(
    () => [
      { label: 'All Employees', value: '' },
      ...activeEmployees.map((emp) => ({
        label: `${emp.full_name || emp.name} (${emp.employee_code || emp.code || emp.id})`,
        value: String(emp.id),
      })),
    ],
    [activeEmployees]
  );

  // Reset selected employee if no longer present in selected BU
  useEffect(() => {
    if (selectedEmployeeId && activeEmployees.length > 0) {
      const exists = activeEmployees.some((emp) => String(emp.id) === String(selectedEmployeeId));
      if (!exists) {
        setSelectedEmployeeId('');
      }
    }
  }, [companyId, activeEmployees, selectedEmployeeId]);

  const sortBy = sorting[0]?.id || 'employee_name';
  const sortOrder = sorting[0]?.desc ? 'DESC' : 'ASC';

  const queryParams = useMemo(() => {
    const params = {
      page,
      limit,
      sortBy,
      sortOrder,
    };
    if (periodMode === 'date') {
      params.date = selectedDate;
    } else {
      params.month = monthYear.month;
      params.year = monthYear.year;
    }
    if (companyId && companyId !== ALL_BUS) {
      params.company_id = companyId;
    }
    if (entityId && entityId !== ALL_ENTITIES) {
      params.entity_id = entityId;
    }
    if (selectedEmployeeId) {
      params.employeeId = selectedEmployeeId;
    }
    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    }
    return params;
  }, [periodMode, selectedDate, monthYear, companyId, entityId, selectedEmployeeId, debouncedSearch, sortBy, sortOrder, page, limit]);

  const { data: summaryRes, isLoading, isError } = useEmployeeWorkLogHoursSummary(queryParams);

  const records = summaryRes?.data?.records ?? [];
  const meta = summaryRes?.meta ?? {};

  const periodLabel = useMemo(() => {
    if (periodMode === 'date') {
      return formatDate(selectedDate, 'DD MMMM YYYY');
    }
    return formatDate(`${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`, 'MMMM YYYY');
  }, [periodMode, selectedDate, monthYear]);

  const activeFilterCount = [
    periodMode !== 'date',
    entityId !== ALL_ENTITIES,
    companyId !== ALL_BUS,
    selectedEmployeeId !== '',
  ].filter(Boolean).length;

  const handleSortingChange = (updater) => {
    const nextSorting = typeof updater === 'function' ? updater(sorting) : updater;
    setSorting(nextSorting.length ? nextSorting : [{ id: 'employee_name', desc: false }]);
    setPage(1);
  };

  const handleResetFilters = () => {
    setPeriodMode('date');
    setSelectedDate(now.format('YYYY-MM-DD'));
    setMonthYear({ month: now.month() + 1, year: now.year() });
    setEntityId(ALL_ENTITIES);
    setCompanyId(ALL_BUS);
    setSelectedEmployeeId('');
    setSearchInput('');
    setSorting([{ id: 'employee_name', desc: false }]);
    setPage(1);
  };

  const handleRowClick = (emp) => {
    setModalState({
      open: true,
      employeeId: emp.employee_id,
      summaryTotalHours: emp.total_hours,
    });
  };

  // Standard DataTable Column Definitions
  const columns = useMemo(
    () => [
      columnHelper.accessor('employee_name', {
        header: 'Employee Name',
        size: 240,
        cell: (info) => (
          <span className="font-medium text-xs text-foreground">
            {info.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('employee_code', {
        header: 'Employee Code',
        size: 160,
        cell: (info) => (
          <span className="text-xs font-mono text-muted-foreground">
            {info.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('period', {
        header: `Period (${periodMode === 'date' ? 'Date' : 'Month'})`,
        enableSorting: false,
        size: 180,
        cell: () => (
          <span className="text-xs text-muted-foreground">
            {periodLabel}
          </span>
        ),
      }),
      columnHelper.accessor('total_hours', {
        header: 'Total Hours',
        meta: { align: 'right' },
        size: 140,
        cell: (info) => (
          <span className="text-right text-xs font-semibold tabular-nums block text-foreground">
            {formatHoursMinutes(info.getValue())}
          </span>
        ),
      }),
    ],
    [periodMode, periodLabel]
  );

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Employee Work Log Hours Summary"
        description="Aggregated work log hours per employee for the selected date or month."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or code..."
              className="w-full sm:w-full md:w-64"
              inputClassName="bg-white"
            />
            <FilterToggleButton
              isOpen={showFilters}
              onToggle={() => setShowFilters((prev) => !prev)}
              activeCount={activeFilterCount}
              className="h-9"
            />
            {records.length > 0 && (
              <Button
                variant="outline"
                size="toolbar"
                onClick={() => exportToExcel(records, periodLabel)}
              >
                <Download className="h-4 w-4" /> Export Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Standard Collapsible Filter Panel */}
      <FilterPanel
        isOpen={showFilters}
        maxHeightClass="max-h-[240px]"
        gridClassName="items-end gap-x-4 gap-y-5 rounded-xl border-slate-200/80 bg-slate-50/70 p-5 shadow-sm"
        onClear={handleResetFilters}
        showClear={activeFilterCount > 0}
      >
        {/* Period mode — kept in its own grid cell (rather than sharing one wide cell with the
            picker) so all four filters line up on the same column rhythm at every width. */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Period</Label>
          <Tabs
            value={periodMode}
            onValueChange={(value) => {
              setPeriodMode(value);
              setPage(1);
            }}
          >
            <TabsList className="grid w-full grid-cols-2 border border-input bg-slate-100">
              <TabsTrigger value="date" className="text-xs font-semibold data-[state=active]:bg-white">
                Single Date
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs font-semibold data-[state=active]:bg-white">
                Month / Year
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Period value — picker swapped to match the selected mode, label names the granularity */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>{periodMode === 'date' ? 'Date' : 'Month & Year'}</Label>
          {periodMode === 'date' ? (
            <DatePicker
              value={selectedDate}
              onChange={(d) => {
                if (d) {
                  setSelectedDate(d);
                  setPage(1);
                }
              }}
              className="w-full text-sm"
            />
          ) : (
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => {
                if (val) {
                  setMonthYear(val);
                  setPage(1);
                }
              }}
              placeholder="Select month"
              clearable={false}
              className="w-full text-sm"
            />
          )}
        </div>

        <EntityFilter
          labelClassName={FILTER_LABEL}
          value={entityId}
          onChange={(val) => {
            setEntityId(val);
            setCompanyId(ALL_BUS);
            setPage(1);
          }}
        />

        {/* Business Unit Selector */}
        <BusinessUnitFilter
          labelClassName={FILTER_LABEL}
          value={companyId}
          entityId={entityId}
          onChange={(val) => {
            setCompanyId(val);
            setPage(1);
          }}
        />

        {/* Employee Dropdown Selector (BU-filtered) */}
        <div className="flex flex-col gap-1.5">
          <Label className={FILTER_LABEL}>Employee</Label>
          <SearchableSelect
            options={employeeOptions}
            value={selectedEmployeeId}
            onValueChange={(val) => {
              setSelectedEmployeeId(val);
              setPage(1);
            }}
            placeholder="All Employees"
            searchPlaceholder="Search employee..."
            className="h-9 w-full text-sm bg-white"
          />
        </div>
      </FilterPanel>

      {/* Shared DataTable Component */}
      <DataTable
        columns={columns}
        data={records}
        isLoading={isLoading}
        mobileCards
        sorting={sorting}
        onSortingChange={handleSortingChange}
        emptyState={
          isError ? (
            <div className="p-6 text-center text-sm text-destructive">
              Unable to load employee work log hours summary. Please try again.
            </div>
          ) : (
            <EmptyState title="No employee work log records found for the selected criteria." />
          )
        }
        pagination={{
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total ?? records.length,
        }}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setLimit(s);
          setPage(1);
        }}
        onRowClick={handleRowClick}
      />

      {/* Detail Drill-Down Modal */}
      <EmployeeDetailModal
        open={modalState.open}
        onOpenChange={(isOpen) =>
          setModalState((prev) => ({ ...prev, open: isOpen }))
        }
        employeeId={modalState.employeeId}
        periodParams={{ periodMode, date: selectedDate, monthYear }}
        companyId={companyId}
        periodLabel={periodLabel}
        summaryRowTotal={modalState.summaryTotalHours}
      />
    </div>
  );
};

export default EmployeeWorkLogHoursSummaryReport;
