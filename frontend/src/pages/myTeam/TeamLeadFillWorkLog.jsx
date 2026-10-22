import { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, CalendarPlus, Download, Upload } from 'lucide-react';
import {
  useMyTeamEmployees,
  useMyTeamEmployeesAcrossBus,
  useMyTeamEmployeesMonthlyWorkLogTotals,
  MAX_FANOUT_BUS,
} from '@/hooks/useMyTeam';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { useCanWrite } from '@/hooks/usePermissions';
import PageHeader from '@/components/common/PageHeader';
import SearchInput from '@/components/common/SearchInput';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import EmptyState from '@/components/common/EmptyState';
import DataTable from '@/components/common/DataTable';
import TeamLeadFillWorkLogDrawer from '@/components/myTeam/TeamLeadFillWorkLogDrawer';
import TeamLeadFillWorkLogBulkUpload, { downloadTemplate } from '@/components/myTeam/TeamLeadFillWorkLogBulkUpload';
import { formatHoursMinutes } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_LIMIT = 10;

// Defaults to the most recently COMPLETED month — this screen only ever accepts an already-ended
// month, so opening it on the still-in-progress current month would just land on a blocked
// message every time.
const defaultMonthYear = () => {
  const prev = dayjs().subtract(1, 'month');
  return { month: prev.month() + 1, year: prev.year() };
};

// Client-side gate shared by both modes — a definitive backend `eligible` flag only exists
// per-Employee (Manual Entry's GET .../monthly-worklog), and Bulk Upload has no equivalent
// pre-check endpoint, so this is what blocks BOTH modes up front from the shared Month/Year
// picker, before either an Employee is opened or a file is uploaded.
const monthHasEnded = (monthYear) => {
  if (!monthYear) return false;
  const endOfMonth = dayjs(`${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`).endOf('month');
  return dayjs().isAfter(endOfMonth);
};

const columnHelper = createColumnHelper();

// Shared by every free-text column below (Employee, Employee Code, Business Unit, Designation):
// size the column to the longest value actually on the current page instead of a fixed guess, so
// a column doesn't clip a name/title that would've fit while a shorter one sits in wasted space —
// clamped per-column so one outlier can't blow out the whole table (DataTable renders
// `table-fixed`, so every column still needs a real number). Same formula TimesheetList's own
// Business Unit column already uses.
const measureColumnWidth = (rows, getText, { min = 120, max = 320 } = {}) => {
  const longest = rows.reduce((max_, row) => Math.max(max_, String(getText(row) ?? '').length), 0);
  return Math.min(max, Math.max(min, (longest * 7.5) + 40));
};

// Team Lead self-service, net-new — a Team Lead fills a mapped Employee's monthly work log hours
// on their behalf, either one Employee at a time (Manual Entry) or many at once via an Excel/CSV
// file (Bulk Upload). Distinct from Timesheet Approval (TeamLeadTimesheetApproval.jsx), which only
// approves/rejects entries the Employee submitted themself: everything saved here is created
// already-approved, so this is a different action entirely, not another way to reach the same
// review queue.
const TeamLeadFillWorkLog = () => {
  const [monthYear, setMonthYear] = useState(defaultMonthYear);
  const [mode, setMode] = useState('manual');
  const [search, setSearch] = useState('');
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buFilter, setBuFilter] = useState(ALL_BUS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [monthPromptOpen, setMonthPromptOpen] = useState(false);
  // Bulk upload writes work-log entries, so it's hidden for a read-only role even if that role
  // has somehow been granted this form.
  const canWrite = useCanWrite();

  const selectedBuId = buFilter !== ALL_BUS ? Number(buFilter) : null;

  // "All Business Units" has no single request confirmed to mean "every BU this login can see"
  // (same gap/workaround as TeamLeadTimesheetApproval.jsx) — fan out one GET /my-team/employees
  // call per BU whenever more than one is selectable, narrowed by the Entity filter (this
  // endpoint has no entity_id concept of its own).
  const { units: myBusinessUnits } = useSelectableBusinessUnits(entityId);
  // Capped at MAX_FANOUT_BUS — see its own doc comment in useMyTeam.js.
  const needsBuFanOut = selectedBuId == null && myBusinessUnits.length > 1 && myBusinessUnits.length <= MAX_FANOUT_BUS;

  const myTeamParams = useMemo(
    () => (selectedBuId != null ? { buId: selectedBuId } : {}),
    [selectedBuId],
  );

  const singleBuQuery = useMyTeamEmployees(myTeamParams, { enabled: !needsBuFanOut });
  const fannedOutQuery = useMyTeamEmployeesAcrossBus(myBusinessUnits, { enabled: needsBuFanOut });

  const myEmployees = needsBuFanOut ? (fannedOutQuery.data ?? []) : (singleBuQuery.data ?? []);
  const isLoadingEmployees = needsBuFanOut ? fannedOutQuery.isLoading : singleBuQuery.isLoading;

  const { entities: myEntities } = useSelectableEntities();
  const entityNameById = useMemo(
    () => new Map(myEntities.map((e) => [String(e.id), e.name])),
    [myEntities],
  );

  // BU name lookup: seeds from myBusinessUnits (BU filter options) and enriches with any
  // embedded business_units returned directly on employee objects from GET /my-team/employees
  const buNameById = useMemo(() => {
    const map = new Map(myBusinessUnits.map((bu) => [String(bu.id), bu.name]));
    myEmployees.forEach((emp) => {
      (emp.business_units ?? []).forEach((bu) => {
        const name = bu.name || bu.company_name;
        if (bu.id && name && !map.has(String(bu.id))) {
          map.set(String(bu.id), name);
        }
      });
    });
    return map;
  }, [myBusinessUnits, myEmployees]);

  // Entity name lookup per BU: seeds from myBusinessUnits + useSelectableEntities, and enriches
  // with any embedded business_units (carrying entity_name / entity_id) returned directly on employee
  // objects from GET /my-team/employees
  const entityNameByBuId = useMemo(() => {
    const map = new Map(
      myBusinessUnits.map((bu) => [String(bu.id), entityNameById.get(String(bu.entityId)) ?? null])
    );
    myEmployees.forEach((emp) => {
      (emp.business_units ?? []).forEach((bu) => {
        const entityName =
          bu.entity_name ??
          bu.entity?.entity_name ??
          (bu.entity_id ? entityNameById.get(String(bu.entity_id)) : null);
        if (bu.id && entityName) {
          map.set(String(bu.id), entityName);
        }
      });
    });
    return map;
  }, [myBusinessUnits, entityNameById, myEmployees]);

  // Entity and BU name resolvers: prefer employee.business_units sent by GET /my-team/employees,
  // falling back to bu-map lookups if not directly embedded.
  const getEmployeeEntityNames = useCallback(
    (employee) => {
      if (employee.entity_name) return [employee.entity_name];
      if (Array.isArray(employee.entity_names) && employee.entity_names.length > 0) {
        return [...new Set(employee.entity_names.filter(Boolean))];
      }
      if (Array.isArray(employee.business_units) && employee.business_units.length > 0) {
        const names = [
          ...new Set(
            employee.business_units
              .map(
                (bu) =>
                  bu.entity_name ??
                  bu.entity?.entity_name ??
                  (bu.entity_id ? entityNameById.get(String(bu.entity_id)) : null) ??
                  entityNameByBuId.get(String(bu.id))
              )
              .filter(Boolean)
          ),
        ];
        if (names.length > 0) return names;
      }
      return [
        ...new Set(
          (employee.business_unit_ids ?? [])
            .map((id) => entityNameByBuId.get(String(id)))
            .filter(Boolean)
        ),
      ];
    },
    [entityNameByBuId, entityNameById],
  );

  const getEmployeeBuNames = useCallback(
    (employee) => {
      if (Array.isArray(employee.business_units) && employee.business_units.length > 0) {
        const names = [
          ...new Set(
            employee.business_units
              .map((bu) => bu.name ?? bu.company_name ?? buNameById.get(String(bu.id)))
              .filter(Boolean)
          ),
        ];
        if (names.length > 0) return names;
      }
      return (employee.business_unit_ids ?? [])
        .map((id) => buNameById.get(String(id)))
        .filter(Boolean);
    },
    [buNameById],
  );

  // Sub-BU name lookup, purely client-side off the same BU list — only Sub-BUs (units carrying a
  // non-null parentId) get an entry, so an id belonging to a top-level Parent BU falls through to
  // '—' in the Sub BU column instead of misreporting a Parent BU as its own Sub-BU.
  const subBuNameById = useMemo(
    () => new Map(
      myBusinessUnits.filter((bu) => bu.parentId != null).map((bu) => [String(bu.id), bu.name]),
    ),
    [myBusinessUnits],
  );

  // Mirrors getEmployeeBuNames, but resolved through subBuNameById so a Parent BU id (no Sub-BU
  // match) is silently dropped rather than rendered as its own Sub-BU.
  const getEmployeeSubBuNames = useCallback(
    (employee) => {
      if (Array.isArray(employee.business_units) && employee.business_units.length > 0) {
        const names = [
          ...new Set(
            employee.business_units
              .map((bu) => subBuNameById.get(String(bu.id)))
              .filter(Boolean)
          ),
        ];
        if (names.length > 0) return names;
      }
      return (employee.business_unit_ids ?? [])
        .map((id) => subBuNameById.get(String(id)))
        .filter(Boolean);
    },
    [subBuNameById],
  );

  const ended = monthHasEnded(monthYear);

  // Fanned out off the full roster (not the search/page-narrowed rows) so typing in Search or
  // turning a page never re-triggers these fetches — each Employee's total is cached under the
  // same key the drawer uses, so it's fetched at most once per Employee/Month regardless of
  // which view asks first.
  const workLogTotals = useMyTeamEmployeesMonthlyWorkLogTotals(myEmployees, monthYear, { enabled: ended });

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return myEmployees;
    return myEmployees.filter((e) =>
      e.employee_code?.toLowerCase().includes(term) ||
      e.full_name?.toLowerCase().includes(term) ||
      e.designation?.toLowerCase().includes(term) ||
      getEmployeeEntityNames(e).some((name) => name.toLowerCase().includes(term)) ||
      getEmployeeBuNames(e).some((name) => name.toLowerCase().includes(term))
    );
  }, [myEmployees, search, getEmployeeEntityNames, getEmployeeBuNames]);

  // Client-side pagination — the roster is already fully loaded (My Team has no server-side
  // paging of its own), so DataTable is just handed the current page's slice plus a `{page,
  // limit, total}` describing the full filtered set.
  const pagedEmployees = useMemo(
    () => filteredEmployees.slice((page - 1) * limit, page * limit),
    [filteredEmployees, page, limit],
  );

  // Employee/Employee Code/Designation all had flat sizes (200/140/240) tuned for a "typical"
  // value — real rosters routinely have a full legal name or a compound designation ("Sr.
  // Director Sales & Marketing(D&B and AI/ML/Atlassian Sales)") that runs well past that,
  // which clipped without ellipsizing and visually bled into the next column. Size each to what's
  // actually on the current page instead.
  const employeeNameColumnWidth = useMemo(
    () => measureColumnWidth(pagedEmployees, (e) => e.full_name, { min: 160, max: 280 }),
    [pagedEmployees],
  );
  const employeeCodeColumnWidth = useMemo(
    () => measureColumnWidth(pagedEmployees, (e) => e.employee_code, { min: 110, max: 180 }),
    [pagedEmployees],
  );
  const designationColumnWidth = useMemo(
    () => measureColumnWidth(pagedEmployees, (e) => e.designation, { min: 150, max: 320 }),
    [pagedEmployees],
  );
  // An Employee mapped to several BUs renders them comma-joined in one cell, which routinely runs
  // longer than any single BU name would.
  const businessUnitColumnWidth = useMemo(
    () =>
      measureColumnWidth(
        pagedEmployees,
        (e) => getEmployeeBuNames(e).join(', '),
        { min: 150, max: 320 },
      ),
    [pagedEmployees, getEmployeeBuNames],
  );
  const entityColumnWidth = useMemo(
    () =>
      measureColumnWidth(
        pagedEmployees,
        (e) => getEmployeeEntityNames(e).join(', '),
        { min: 120, max: 260 },
      ),
    [pagedEmployees, getEmployeeEntityNames],
  );
  // Same shape as businessUnitColumnWidth, but measuring only Sub-BU names — an Employee mapped to
  // several Sub-BUs renders them comma-joined the same way.
  const subBuColumnWidth = useMemo(
    () =>
      measureColumnWidth(
        pagedEmployees,
        (e) => getEmployeeSubBuNames(e).join(', '),
        { min: 120, max: 280 },
      ),
    [pagedEmployees, getEmployeeSubBuNames],
  );

  const handleMonthYearChange = (v) => setMonthYear(v ?? defaultMonthYear());

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  // Picking a different Entity can strand a BU that no longer belongs to it — reset the BU
  // filter the same way TeamLeadTimesheetApproval.jsx does for the same reason.
  const handleEntityChange = (v) => {
    setEntityId(v);
    setBuFilter(ALL_BUS);
    setPage(1);
  };

  const handleBuChange = (v) => {
    setBuFilter(v);
    setPage(1);
  };

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuFilter(ALL_BUS);
    setPage(1);
  };

  const activeFilterCount = (entityId !== ALL_ENTITIES ? 1 : 0) + (selectedBuId != null ? 1 : 0);

  const handleRowClick = (employee) => {
    setActiveEmployee(employee);
    setDrawerOpen(true);
  };

  const monthLabel = monthYear ? `${MONTH_FULL[monthYear.month - 1]} ${monthYear.year}` : 'this month';

  const columns = [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 90,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => (
        <Button
          size="sm"
          title="Fill Work Log"
          onClick={(e) => { e.stopPropagation(); handleRowClick(row.original); }}
          className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
        </Button>
      ),
    }),
    columnHelper.accessor('full_name', {
      header: 'Employee',
      size: employeeNameColumnWidth,
      meta: { sticky: true, left: 90 },
      cell: ({ row }) => (
        <span className="block truncate text-sm font-medium" title={row.original.full_name}>{row.original.full_name}</span>
      ),
    }),
    columnHelper.accessor('employee_code', {
      header: 'Employee Code',
      size: employeeCodeColumnWidth,
      cell: (info) => {
        const value = info.getValue() ?? '—';
        return <span className="block truncate text-sm text-muted-foreground" title={value}>{value}</span>;
      },
    }),
    columnHelper.display({
      id: 'entity',
      header: 'Entity',
      size: entityColumnWidth,
      cell: ({ row }) => {
        const names = getEmployeeEntityNames(row.original);
        const joined = names.length ? names.join(', ') : '—';
        return <span className="block truncate text-sm text-muted-foreground" title={joined}>{joined}</span>;
      },
    }),
    columnHelper.display({
      id: 'business_unit',
      header: 'Business Unit',
      size: businessUnitColumnWidth,
      cell: ({ row }) => {
        const names = getEmployeeBuNames(row.original);
        const joined = names.length ? names.join(', ') : '—';
        // `truncate` (not `whitespace-nowrap` alone) so a name list that still outgrows the
        // clamped column width ellipsizes in place instead of visually overflowing into the next
        // cell — the `title` surfaces the full list on hover either way.
        return <span className="block truncate text-sm text-muted-foreground" title={joined}>{joined}</span>;
      },
    }),
    columnHelper.display({
      id: 'sub_bu_name',
      header: 'Sub BU',
      size: subBuColumnWidth,
      cell: ({ row }) => {
        const names = getEmployeeSubBuNames(row.original);
        const joined = names.length ? names.join(', ') : '—';
        return <span className="block truncate text-sm text-muted-foreground" title={joined}>{joined}</span>;
      },
    }),
    columnHelper.accessor('designation', {
      header: 'Designation',
      size: designationColumnWidth,
      cell: (info) => {
        const value = info.getValue() ?? '—';
        return <span className="block truncate text-sm text-muted-foreground" title={value}>{value}</span>;
      },
    }),
    columnHelper.display({
      id: 'total_hours',
      header: 'Total Hours',
      size: 140,
      cell: ({ row }) => {
        const total = workLogTotals.get(row.original.id);
        return total?.isLoading ? (
          <Skeleton className="h-4 w-14" />
        ) : (
          <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            {formatHoursMinutes(total?.totalHours ?? 0)}
          </span>
        );
      },
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Log Work for My Team"
        description=""
        actions={
          mode === 'bulk' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode('manual')}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                placeholder="Search by code, name, designation…"
                value={search}
                onChange={handleSearchChange}
                className="w-[250px]"
                inputClassName="bg-white"
              />
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {canWrite && (
                <>
                  <Button variant="outline" size="sm" className="bg-white" onClick={downloadTemplate}>
                    <Download className="mr-1.5 h-4 w-4" /> Download Sample
                  </Button>
                  <Button type="button" size="sm" onClick={() => setMonthPromptOpen(true)}>
                    <Upload className="mr-1.5 h-4 w-4" /> Import Excel
                  </Button>
                </>
              )}
            </div>
          )
        }
      />

      {mode === 'manual' && (
        <FilterPanel isOpen={filtersOpen} onClear={clearFilters} showClear={activeFilterCount > 0}>
          <EntityFilter value={entityId} onChange={handleEntityChange} />
          <BusinessUnitFilter value={buFilter} entityId={entityId} onChange={handleBuChange} />
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month &amp; Year</Label>
            <MonthYearPicker
              value={monthYear}
              onChange={handleMonthYearChange}
              placeholder="Select month"
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white"
              clearable={false}
            />
          </div>
        </FilterPanel>
      )}

      {!ended ? (
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          {monthLabel} hasn&apos;t ended yet — work log hours can only be filled in once a month is complete.
          Pick an earlier month to continue.
        </div>
      ) : mode === 'manual' ? (
        <DataTable
          columns={columns}
          data={pagedEmployees}
          isLoading={isLoadingEmployees}
          onRowClick={handleRowClick}
          pagination={filteredEmployees.length > 0 ? { page, limit, total: filteredEmployees.length } : undefined}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setLimit(size); setPage(1); }}
          emptyState={
            <EmptyState
              title={myEmployees.length === 0 ? 'No Employees reporting to you yet.' : 'No Employees match your search/filter.'}
            />
          }
        />
      ) : (
        <TeamLeadFillWorkLogBulkUpload monthYear={monthYear} monthLabel={monthLabel} />
      )}

      {activeEmployee && (
        <TeamLeadFillWorkLogDrawer
          key={activeEmployee.id}
          employee={activeEmployee}
          monthYear={monthYear}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      )}

      {/* Gates entry into Import Excel — the month has to be picked and confirmed here FIRST;
          the upload panel (and its file drop zone) only appears once this is confirmed, instead
          of showing up front with a month silently defaulted in the background. */}
      <Dialog open={monthPromptOpen} onOpenChange={setMonthPromptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Select Month &amp; Year</DialogTitle>
            <DialogDescription>Which month&apos;s work log do you want to bulk-upload?</DialogDescription>
          </DialogHeader>
          <MonthYearPicker
            value={monthYear}
            onChange={handleMonthYearChange}
            placeholder="Select month"
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white"
            clearable={false}
          />
          {!ended && (
            <p className="text-xs text-destructive">
              {monthLabel} hasn&apos;t ended yet — pick an earlier, already-completed month.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setMonthPromptOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!ended}
              onClick={() => { setMonthPromptOpen(false); setMode('bulk'); }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamLeadFillWorkLog;
