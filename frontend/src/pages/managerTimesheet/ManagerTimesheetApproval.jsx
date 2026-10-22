import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { BellRing, Download } from 'lucide-react';
import { useMyTeamEmployees, useMyTeamEmployeesAcrossBus, MAX_FANOUT_BUS } from '@/hooks/useMyTeam';
import { myTeamApi } from '@/api/myTeam.api';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { downloadBlob } from '@/utils/download';
import { ROUTES } from '@/constants/routes';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import ManagerAllEmployeesTimesheetView from '@/components/employee/ManagerAllEmployeesTimesheetView';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import WeekendRequestsTable from '@/components/employee/WeekendRequestsTable';
import { useMyTeamOffDayRequests } from '@/hooks/useOffDayRequests';

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

// Converts the BusinessUnitFilter's string value ('all' | '<id>') to the numeric buId this page
// passes to every API call: null for "All Business Units", a Number otherwise.
const toBuId = (filterValue) =>
  !filterValue || filterValue === ALL_BUS ? null : Number(filterValue);

const currentMonthYear = () => ({ month: dayjs().month() + 1, year: dayjs().year() });

// A single {month, year} turns into the [startDate, endDate] range the approval-summary endpoint
// actually takes — Monthly mode shows one bucket per Employee for THIS month, not every month of
// the year, so it needs exactly one month's bounds, the same shape Daily mode's date range already is.
const monthYearToRange = ({ month, year }) => {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  return { startDate: start.format('YYYY-MM-DD'), endDate: start.endOf('month').format('YYYY-MM-DD') };
};

// Standalone Manager screen — split off (2026-08-23) from the employee selector that used to
// live inside "My Work Log" (EmployeeTimesheet.jsx). Every mapped Employee's timesheet records
// load into one combined table (ManagerAllEmployeesTimesheetView) as soon as the team list is
// in. Every filter that scopes it — Business Unit, Daily/Monthly, the date/month, and Status —
// lives in the standard collapsible FilterPanel (matching every other list/report page); the
// header Search box is a separate, always-visible quick filter over the Employee name/code shown
// in the table (no dedicated "Employee" dropdown — the search box already covers that), independent
// of "Clear filters".
//
// Supports an optional `?employee_id=<id>` query param for deep-linking from the reminder email
// "Go to Approval" button. The param is applied once the manager's team list has loaded and the
// id is confirmed to belong to a mapped employee — unknown ids are silently ignored so a stale
// link can't leave the page in a broken state.
const ManagerTimesheetApproval = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // "Check Pending & Remind" leads to the compliance report's reminder-sending flow, so it's a
  // write action for gating purposes — hidden for a read-only role.
  const canWrite = useCanWrite();
  const { error: showError } = useNotification();
  const [isExporting, setIsExporting] = useState(false);
  const [searchParams] = useSearchParams();
  // Read once on mount — changes to the query string after mount are intentionally ignored so
  // that the manager's manual dropdown selection is never overwritten mid-session.
  const deepLinkEmployeeId = useRef(searchParams.get('employee_id') ?? '');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('timesheets'); // 'timesheets' | 'weekend-requests'

  // Weekend Requests gets its own Search/Entity/Business Unit/Date Range/Status state — same
  // header/FilterPanel slot as the Timesheets tab (see PageHeader `actions` and the filter panel
  // below), just not sharing that tab's own state (different dataset, different meaning for
  // "status", and a weekend request has no Daily/Weekly/Monthly Log Type concept to filter by).
  const [weekendSearch, setWeekendSearch] = useState('');
  const [weekendStatusFilter, setWeekendStatusFilter] = useState('all');
  const [weekendEntityId, setWeekendEntityId] = useState(ALL_ENTITIES);
  const [weekendBuFilterValue, setWeekendBuFilterValue] = useState(ALL_BUS);
  const [weekendDateRange, setWeekendDateRange] = useState(null);
  const weekendBuId = toBuId(weekendBuFilterValue);

  // Picking an Entity here (BU left on "All Business Units") has to fall back to fanning out one
  // call per BU under that Entity and merging client-side — same fix as `needsBuFanOut` below for
  // /my-team/employees, since /my-team/off-day-requests has no single X-Company-Id that means
  // "every BU under this Entity" either (see useMyTeamOffDayRequestsAcrossBus).
  //
  // When the narrowed Entity has exactly ONE Business Unit, fan-out is unnecessary but a header-
  // less call is still wrong: it silently falls back to the caller's WHOLE role reach (every
  // Entity), not just this one Entity's one BU — confirmed live, picking any single-BU Entity
  // fired no new request and showed identical data across every Entity. `weekendEffectiveBuId`
  // fills that gap by scoping explicitly to that one BU whenever the Entity narrowing already
  // determines it, even though the BU dropdown itself is still on "All Business Units".
  const { units: weekendBusinessUnits } = useSelectableBusinessUnits(weekendEntityId);
  const weekendEffectiveBuId = weekendBuId ??
    (weekendEntityId !== ALL_ENTITIES && weekendBusinessUnits.length === 1 ? weekendBusinessUnits[0].id : null);
  const needsWeekendBuFanOut = weekendEffectiveBuId == null && weekendBusinessUnits.length > 1;

  const handleWeekendEntityChange = (v) => {
    setWeekendEntityId(v);
    setWeekendBuFilterValue(ALL_BUS);
  };

  // status: 'pending' — without it this returns every weekend request regardless of status, so
  // the tab badge kept showing already-approved requests instead of clearing once the pending
  // queue was actually empty.
  const { data: weekendReqResponse } = useMyTeamOffDayRequests({ page: 1, limit: 1, status: 'pending' });
  const pendingWeekendCount = weekendReqResponse?.meta?.total ?? (Array.isArray(weekendReqResponse?.data) ? weekendReqResponse.data.length : 0);

  // BusinessUnitFilter drives a string ('all' | '<id>'); the page works with a numeric buId
  // internally (null = all, Number = specific BU) to match every API call's expectations.
  const [filterValue, setFilterValue] = useState(ALL_BUS);
  const selectedBuId = toBuId(filterValue);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);

  // A generation counter increments on every BU change so that results from an earlier
  // selection that arrive after a newer one has already fired can be discarded. Each query key
  // embeds the generation, meaning React Query treats the old and new requests as distinct
  // entries and never merges their results.
  const generationRef = useRef(0);
  const [generation, setGeneration] = useState(0);

  const handleBuChange = (v) => {
    generationRef.current += 1;
    setGeneration(generationRef.current);
    setFilterValue(v);
    setSelectedEmployeeId('');
  };

  // Picking a different Entity can strand a BU (and the selected Employee chained off it) that no
  // longer belongs to the new Entity — reset the whole chain the same way changing BU does above.
  const handleEntityChange = (v) => {
    setEntityId(v);
    handleBuChange(ALL_BUS);
  };

  // ── My-Team employees (primary source) ─────────────────────────────────────────────────────
  // GET /my-team/employees?business_unit_id=<buId>  +  X-Company-Id: <buId>  (specific BU)
  // GET /my-team/employees                                                    (all BUs)
  //
  // "All Business Units" needs special handling whenever there's more than one selectable BU:
  // there's no single request confirmed to mean "every BU this login can see" (see apiClient's
  // explicitBuScope) — a plain no-param call can silently narrow to whichever BU happens to be
  // globally active, or to whatever the backend treats a header-less /my-team/employees call as
  // for this role, and an Employee mapped only under a different BU quietly vanishes from "All
  // Business Units" until that specific BU is picked. Confirmed live: an Employee ("om", mapped
  // under BU "hfds") was missing under "All Business Units" for an Admin login even though
  // Admin/Entity Admin/Platform Admin are nominally "cross-BU" and were assumed to already get
  // full reach from a header-less call — so this fans out per-BU unconditionally rather than
  // trusting that assumption, for ANY login with more than one selectable BU (cross-BU or not).
  // Not needed for a single-BU login (their one BU already IS "all of theirs") or once a specific
  // BU is picked (already correctly scoped via explicitBuScope).
  // Narrowed by entityId so picking an Entity while "All Business Units" stays selected actually
  // limits the fan-out below to that Entity's own BUs, instead of silently spanning every BU this
  // login can reach regardless of the Entity filter (this endpoint has no entity_id concept of its
  // own — same fan-out workaround as TimesheetList.jsx uses for the equivalent gap there).
  const { units: myBusinessUnits } = useSelectableBusinessUnits(entityId);
  // Same gap as Weekend Requests' `weekendEffectiveBuId` above — an Entity narrowed to exactly one
  // BU must still be explicitly scoped to that BU, not fall through to a header-less "whole role
  // reach" call that ignores the Entity filter entirely.
  const effectiveBuId = selectedBuId ??
    (entityId !== ALL_ENTITIES && myBusinessUnits.length === 1 ? myBusinessUnits[0].id : null);
  // Capped at MAX_FANOUT_BUS — see its own doc comment in useMyTeam.js. Beyond that many
  // selectable BUs (a cross-BU login on a system with dozens/hundreds of Business Units),
  // `singleBuQuery` below fires once, header-less, instead of fanning out one request per BU.
  const needsBuFanOut = effectiveBuId == null && myBusinessUnits.length > 1 && myBusinessUnits.length <= MAX_FANOUT_BUS;

  const myTeamParams = useMemo(
    () => (effectiveBuId != null ? { buId: effectiveBuId } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveBuId, generation],
  );

  const singleBuQuery = useMyTeamEmployees(myTeamParams, { enabled: !needsBuFanOut });
  const fannedOutQuery = useMyTeamEmployeesAcrossBus(myBusinessUnits, { enabled: needsBuFanOut });

  // ── Resolve the employee list ───────────────────────────────────────────────────────────────
  // The ONLY valid source is /my-team/employees — this endpoint is manager-scoped, meaning the
  // backend verifies that the selected employee is mapped to the calling user before serving the
  // approval summary. Using any other source (active/list, /employees master) would show employees
  // the logged-in user cannot actually approve — leading to "This Employee is not one of your
  // mapped Employees" errors from the /my-team/timesheets/* endpoints. An Admin or any other role
  // with no team mappings will correctly see an empty dropdown.
  const employeeList = needsBuFanOut ? fannedOutQuery.data : (singleBuQuery.data ?? []);

  const isLoading = needsBuFanOut ? fannedOutQuery.isLoading : singleBuQuery.isLoading;
  const hasError = needsBuFanOut ? fannedOutQuery.isError : singleBuQuery.isError;

  // ── Deep-link Employee narrowing ────────────────────────────────────────────────────────────
  // No visible "Employee" filter control any more — the header Search box covers manual narrowing
  // by name/code — but `?employee_id=` still needs somewhere to land, so this stays purely internal
  // state driven only by the effect below.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const selectedEmployee = employeeList.find((e) => String(e.id) === selectedEmployeeId);

  // Apply the deep-link param exactly once — after the team list has loaded and the param id
  // is confirmed to be one of the manager's mapped employees. Fires on every `employeeList`
  // change but the `deepLinkEmployeeId` ref is cleared after first application so subsequent
  // re-renders (e.g. from BU filter changes) don't override the manager's own selection.
  useEffect(() => {
    if (!deepLinkEmployeeId.current || isLoading || employeeList.length === 0) return;
    const target = String(deepLinkEmployeeId.current);
    const isMapped = employeeList.some((e) => String(e.id) === target);
    if (isMapped) setSelectedEmployeeId(target);
    // Clear regardless — if the employee isn't in the list the link is stale and we don't
    // want to retry on every subsequent list update.
    deepLinkEmployeeId.current = '';
  }, [employeeList, isLoading]);

  // ── Log type / period filter (lifted up so it lives in the same FilterPanel as BU/Employee) ───
  const [logType, setLogType] = useState('daily');
  const [dateRange, setDateRange] = useState(null);
  const [monthYear, setMonthYear] = useState(currentMonthYear);
  const [statusFilter, setStatusFilter] = useState('all');

  // The table always takes a single {startDate, endDate} range regardless of Daily/Weekly/Monthly
  // — for Monthly that range is just always exactly one calendar month wide, never cleared to "no
  // month". Weekly shares Daily's `dateRange` state (WeekPicker just snaps selection to a Mon-Sat business
  // week instead of two free clicks), so only Monthly needs a distinct branch here.
  const effectiveDateRange = logType === 'monthly' ? monthYearToRange(monthYear) : dateRange;

  // `search` is now a real backend filter passed straight to GET
  // /my-team/timesheets/approval-summary/all (matches employee name, employee code, or Service PO
  // name server-side) — it no longer needs to pre-narrow which Employees get fetched.
  const employeesInScope = useMemo(
    () => (selectedEmployee ? [selectedEmployee] : employeeList),
    [selectedEmployee, employeeList],
  );
  const employeeIds = useMemo(() => employeesInScope.map((e) => e.id), [employeesInScope]);

  // Same filters the table itself is showing, minus page/limit/sortBy/sortOrder (export always
  // means "every matching row," not one page) — hits the dedicated export endpoint since the JSON
  // listing endpoint is page/limit-capped and can't return everything in one call.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await myTeamApi.exportApprovalSummaryAll({
        log_type: logType,
        ...(effectiveDateRange?.startDate ? { startDate: effectiveDateRange.startDate, endDate: effectiveDateRange.endDate } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        employee_ids: employeeIds,
        buId: effectiveBuId,
      });
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const timesheetActiveFilterCount =
    (entityId !== ALL_ENTITIES ? 1 : 0)
    + (selectedBuId != null ? 1 : 0)
    + (selectedEmployeeId ? 1 : 0)
    + (logType !== 'daily' ? 1 : 0)
    + (logType !== 'monthly' && dateRange?.startDate ? 1 : 0)
    + (statusFilter !== 'all' ? 1 : 0);
  const weekendActiveFilterCount =
    (weekendEntityId !== ALL_ENTITIES ? 1 : 0)
    + (weekendBuId != null ? 1 : 0)
    + (weekendDateRange?.startDate ? 1 : 0)
    + (weekendStatusFilter !== 'all' ? 1 : 0);
  const activeFilterCount = activeTab === 'weekend-requests' ? weekendActiveFilterCount : timesheetActiveFilterCount;

  const clearTimesheetFilters = () => {
    setEntityId(ALL_ENTITIES);
    handleBuChange(ALL_BUS);
    setLogType('daily');
    setDateRange(null);
    setMonthYear(currentMonthYear());
    setStatusFilter('all');
  };
  const clearWeekendFilters = () => {
    setWeekendEntityId(ALL_ENTITIES);
    setWeekendBuFilterValue(ALL_BUS);
    setWeekendDateRange(null);
    setWeekendStatusFilter('all');
  };
  const clearFilters = activeTab === 'weekend-requests' ? clearWeekendFilters : clearTimesheetFilters;

  // Shared between the desktop inline FilterPanel and the mobile bottom sheet below — same
  // fields, same instant-apply state wiring either way, only the surrounding container differs.
  const filterFields = (
    <>
      <EntityFilter value={entityId} onChange={handleEntityChange} />

      <BusinessUnitFilter value={filterValue} entityId={entityId} onChange={handleBuChange} />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Log Type</Label>
        <Tabs value={logType} onValueChange={setLogType}>
          <TabsList className="w-full">
            <TabsTrigger value="daily" className="flex-1">Daily</TabsTrigger>
            <TabsTrigger value="weekly" className="flex-1">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="flex-1">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Weekly shares Daily's `dateRange` state — WeekPicker just snaps selection to a Mon-Sat business
          week instead of two free clicks, emitting the same {startDate, endDate} shape. */}
      {logType === 'monthly' ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year</Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(v) => setMonthYear(v ?? currentMonthYear())}
            placeholder="Select month"
            className="w-full"
            clearable={false}
          />
        </div>
      ) : logType === 'weekly' ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Week</Label>
          <WeekPicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Select week"
            className="w-full"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Date Range</Label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Select a date range"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Status</Label>
        <SearchableSelect
          options={STATUS_OPTIONS}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="All Statuses"
          className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
        />
      </div>
    </>
  );

  // Weekend Requests' own filter panel content — same collapsible panel, same field set as the
  // Timesheets tab above minus Log Type/Employee (a weekend request has no daily/weekly/monthly
  // concept, and the header Search box already covers narrowing by employee). STATUS_OPTIONS is
  // shared since the value set is identical: all/pending/approved/rejected.
  const weekendFilterFields = (
    <>
      <EntityFilter value={weekendEntityId} onChange={handleWeekendEntityChange} />

      <BusinessUnitFilter value={weekendBuFilterValue} entityId={weekendEntityId} onChange={setWeekendBuFilterValue} />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Work Date Range</Label>
        <DateRangePicker
          value={weekendDateRange}
          onChange={setWeekendDateRange}
          placeholder="Select a date range"
          className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Status</Label>
        <SearchableSelect
          options={STATUS_OPTIONS}
          value={weekendStatusFilter}
          onValueChange={setWeekendStatusFilter}
          placeholder="All Statuses"
          className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
        />
      </div>
    </>
  );

  const isWeekendTab = activeTab === 'weekend-requests';
  const activeSearch = isWeekendTab ? weekendSearch : search;
  const setActiveSearch = isWeekendTab ? setWeekendSearch : setSearch;
  const activeFilterFields = isWeekendTab ? weekendFilterFields : filterFields;
  const searchPlaceholder = isWeekendTab
    ? 'Search employee, Service PO or reason...'
    : 'Search by employee name...';

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      <PageHeader
        title={isWeekendTab ? 'Weekend Requests' : 'Timesheet Approval'}
        description={
          isWeekendTab
            ? 'Review and approve weekend and off-day requests submitted by your team.'
            : ""
        }
        actions={
          <div className="hidden md:flex items-center gap-2">
            <SearchInput
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-[220px]"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            {!isWeekendTab && employeeList.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={isExporting}>
                <Download className="mr-1.5 h-4 w-4" />
                {isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
            {/* Checking who's pending and nudging them is a different job than approving what's
                already logged — handing it off to the Work Log Compliance report (which already
                owns per-employee/bulk "Remind" sending) instead of duplicating that flow here.
                Styled as the same warm, solid CTA as that report's own "Remind All" button so the
                two read as one connected action rather than another outline button among many.
                Timesheets-only — a weekend/off-day request has its own Approve/Reject actions
                right in the table, nothing to "remind" here. */}
            {canWrite && !isWeekendTab && (
            <Button
              size="toolbar"
              className="relative bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:bg-amber-600"
              onClick={() => navigate(ROUTES.REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE)}
            >
              <span className="relative">
                <BellRing className="h-4 w-4" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-white" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-white" />
              </span>
              Check Pending &amp; Remind
            </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center justify-between border-b pb-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="bg-slate-100/90 p-1">
            <TabsTrigger value="timesheets" className="text-xs font-medium">
              Timesheet Approvals
            </TabsTrigger>
            <TabsTrigger value="weekend-requests" className="text-xs font-medium flex items-center gap-1.5">
              Weekend Requests
              {pendingWeekendCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-500 text-white min-w-[18px]">
                  {pendingWeekendCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Mobile toolbar — full-width search, then Filters alongside the same amber "Check
          Pending & Remind" CTA the desktop actions above use (was tucked inside a "More" menu;
          moved front-and-center since it was the menu's only item). `flex-wrap` keeps it from
          ever overflowing the viewport — the CTA drops to its own full-width row on the
          narrowest phones instead of clipping. Reuses the exact same state/handlers as desktop;
          only the layout differs. Shared by both tabs — same as desktop's actions above. */}
      <div className="flex flex-col gap-2 md:hidden">
        <SearchInput
          value={activeSearch}
          onChange={(e) => setActiveSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full"
          inputClassName="bg-white"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={activeFilterCount}
          />
          {!isWeekendTab && employeeList.length > 0 && (
            <Button variant="outline" size="toolbar" onClick={handleExport} disabled={isExporting}>
              <Download className="mr-1.5 h-4 w-4" />
              {isExporting ? 'Exporting…' : 'Export'}
            </Button>
          )}
          {canWrite && !isWeekendTab && (
          <Button
            size="toolbar"
            className="relative flex-1 bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:bg-amber-600"
            onClick={() => navigate(ROUTES.REPORT_EMPLOYEE_WORK_LOG_COMPLIANCE)}
          >
            <span className="relative">
              <BellRing className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-white" />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-white" />
            </span>
            Check Pending &amp; Remind
          </Button>
          )}
        </div>
      </div>

      {isMobile ? (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto py-2">
              {activeFilterFields}
            </div>
            <div className="flex gap-2 border-t pt-3">
              <Button variant="outline" className="flex-1" onClick={clearFilters} disabled={activeFilterCount === 0}>
                Reset
              </Button>
              <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                Done
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <FilterPanel
          isOpen={filtersOpen}
          maxHeightClass="max-h-[200px]"
          onClear={clearFilters}
          showClear={activeFilterCount > 0}
        >
          {activeFilterFields}
        </FilterPanel>
      )}

      {isWeekendTab ? (
        <WeekendRequestsTable
          search={weekendSearch}
          statusFilter={weekendStatusFilter}
          buId={weekendEffectiveBuId}
          buIds={needsWeekendBuFanOut ? weekendBusinessUnits.map((u) => u.id) : null}
          dateRange={weekendDateRange}
        />
      ) : hasError ? (
        <EmptyState title="Failed to load employees. Please refresh the page." />
      ) : isLoading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading employees…
        </div>
      ) : employeeList.length === 0 ? (
        <EmptyState title="No Employees reporting to you yet." />
      ) : (
        <ManagerAllEmployeesTimesheetView
          employeeIds={employeeIds}
          buId={effectiveBuId}
          logType={logType}
          dateRange={effectiveDateRange}
          statusFilter={statusFilter}
          search={search}
        />
      )}
    </div>
  );
};

export default ManagerTimesheetApproval;
