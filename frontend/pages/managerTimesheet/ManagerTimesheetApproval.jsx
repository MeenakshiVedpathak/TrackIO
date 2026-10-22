import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { BellRing } from 'lucide-react';
import { useMyTeamEmployees, useMyTeamEmployeesAcrossBus } from '@/hooks/useMyTeam';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useIsMobile } from '@/hooks/useMediaQuery';
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
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

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
  const [searchParams] = useSearchParams();
  // Read once on mount — changes to the query string after mount are intentionally ignored so
  // that the manager's manual dropdown selection is never overwritten mid-session.
  const deepLinkEmployeeId = useRef(searchParams.get('employee_id') ?? '');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');

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
  const needsBuFanOut = selectedBuId == null && myBusinessUnits.length > 1;

  const myTeamParams = useMemo(
    () => (selectedBuId != null ? { buId: selectedBuId } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedBuId, generation],
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

  // The table always takes a single {startDate, endDate} range regardless of Daily/Monthly — for
  // Monthly that range is just always exactly one calendar month wide, never cleared to "no month".
  const effectiveDateRange = logType === 'daily' ? dateRange : monthYearToRange(monthYear);

  const employeesInScope = useMemo(() => {
    const base = selectedEmployee ? [selectedEmployee] : employeeList;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((e) =>
      (e.full_name || e.name || '').toLowerCase().includes(q)
      || (e.employee_code || '').toLowerCase().includes(q));
  }, [selectedEmployee, employeeList, search]);

  const activeFilterCount =
    (entityId !== ALL_ENTITIES ? 1 : 0)
    + (selectedBuId != null ? 1 : 0)
    + (selectedEmployeeId ? 1 : 0)
    + (logType !== 'daily' ? 1 : 0)
    + (logType === 'daily' && dateRange?.startDate ? 1 : 0)
    + (statusFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    handleBuChange(ALL_BUS);
    setLogType('daily');
    setDateRange(null);
    setMonthYear(currentMonthYear());
    setStatusFilter('all');
  };

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
            <TabsTrigger value="monthly" className="flex-1">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {logType === 'daily' ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Date Range</Label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Select a date range"
            className="h-9 w-full text-sm bg-white"
          />
        </div>
      ) : (
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
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Status</Label>
        <SearchableSelect
          options={STATUS_OPTIONS}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="All Statuses"
          className="h-9 w-full text-sm bg-white"
        />
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      <PageHeader
        title="Timesheet Approval"
        description=""
        actions={
          // Desktop only — on mobile this whole row would overflow the viewport (a fixed-width
          // search box plus two more buttons never fits), so it moves into the dedicated
          // `md:hidden` toolbar row below instead, the same split every other Master/Report
          // toolbar in the app already uses (see e.g. ClientList.jsx).
          <div className="hidden md:flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee name..."
              className="w-[220px]"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            {/* Checking who's pending and nudging them is a different job than approving what's
                already logged — handing it off to the Work Log Compliance report (which already
                owns per-employee/bulk "Remind" sending) instead of duplicating that flow here.
                Styled as the same warm, solid CTA as that report's own "Remind All" button so the
                two read as one connected action rather than another outline button among many. */}
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
          </div>
        }
      />

      {/* Mobile toolbar — full-width search, then Filters alongside the same amber "Check
          Pending & Remind" CTA the desktop actions above use (was tucked inside a "More" menu;
          moved front-and-center since it was the menu's only item). `flex-wrap` keeps it from
          ever overflowing the viewport — the CTA drops to its own full-width row on the
          narrowest phones instead of clipping. Reuses the exact same state/handlers as desktop;
          only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by employee name..."
          className="w-full"
          inputClassName="bg-white"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={activeFilterCount}
          />
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
        </div>
      </div>

      {isMobile ? (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto py-2">
              {filterFields}
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
          {filterFields}
        </FilterPanel>
      )}

      {hasError ? (
        <EmptyState title="Failed to load employees. Please refresh the page." />
      ) : isLoading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading employees…
        </div>
      ) : employeeList.length === 0 ? (
        <EmptyState title="No Employees reporting to you yet." />
      ) : employeesInScope.length === 0 ? (
        <EmptyState title="No employees match your search." />
      ) : (
        <ManagerAllEmployeesTimesheetView
          employees={employeesInScope}
          logType={logType}
          dateRange={effectiveDateRange}
          statusFilter={statusFilter}
        />
      )}
    </div>
  );
};

export default ManagerTimesheetApproval;
