import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search, Inbox, Loader2, MoreVertical, Link2Off, Info } from 'lucide-react';
import { useServicePO } from '@/hooks/useServicePOs';
import { useCompanies } from '@/hooks/useCompanies';
import { useDebounce } from '@/hooks/useDebounce';
import {
  useServicePOEmployeeMappings,
  useServicePOEmployeeOptions,
  useEmployeeServicePOMappingFilterOptions,
  useCreateEmployeeServicePOMapping,
  useSetEmployeeServicePOMappingStatus,
  useDeleteEmployeeServicePOMapping,
  useSetProjectManager,
} from '@/hooks/useEmployeeServicePOMapping';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatProjectManagerAssignmentError } from '@/utils/projectManagerError';
import { ROUTES, buildPath } from '@/constants/routes';
import { getInitials } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import PageHeader from '@/components/common/PageHeader';
import MobilePagination from '@/components/common/MobilePagination';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

// Row shape used by both panels below: { key, name, sub, raw }. Normalizing mapping
// records into this common shape up front means the picker UI itself never has to know
// the raw API shape — it just needs a resolved display name.
const toRow = (key, name, sub, raw) => ({ key, name: name ?? '—', sub, raw });

// The mapping API's response shape for the employee on each row hasn't been consistent —
// sometimes flat (employee_name/employee_code), sometimes nested (employee: {...} or
// Employee: {...}). Check every variant so a shape change on the backend doesn't silently
// blank out the name column again.
const resolveMappingEmployee = (m) => {
  const nested = m.employee ?? m.Employee ?? m.employeeDetails ?? m.Employee_Details ?? {};
  return {
    name: m.employee_name ?? m.full_name ?? m.employeeName ?? nested.full_name ?? nested.employee_name ?? nested.name ?? null,
    code: m.employee_code ?? m.employeeCode ?? nested.employee_code ?? nested.code ?? null,
  };
};

// Only the mapped panel filters client-side — it holds one PO's full mapping list. The select
// panel's search is server-side (see useServicePOEmployeeOptions), since it only ever holds the
// pages it has scrolled through.
const filterRows = (rows, term) => {
  const q = term.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => r.name.toLowerCase().includes(q) || (r.sub ?? '').toLowerCase().includes(q)
  );
};

// Pulls the next page as soon as the end of the list scrolls into view. An observer rather than a
// scroll-offset handler because already-mapped employees are subtracted client-side: a full page
// from the server can leave few or even zero visible rows, and that state produces no scroll event
// to hang a handler off. The sentinel simply stays in view and keeps pulling until the panel fills
// or the server runs out.
const useLoadMoreOnVisible = ({ hasMore, isLoading, onLoadMore }) => {
  const [sentinel, setSentinel] = useState(null);

  useEffect(() => {
    if (!sentinel || !hasMore || isLoading) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '120px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, isLoading, onLoadMore]);

  return setSentinel;
};

const EmptyState = ({ message = 'No Data' }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
    <Inbox className="h-8 w-8 opacity-40" />
    <span className="text-sm">{message}</span>
  </div>
);

// `hasMore` renders the count as "50+": the select panel only knows what it has paged in so far,
// so an exact total would be a lie until the last page lands.
const PanelSearchBar = ({ count, hasMore, search, onSearchChange, disabled, children }) => (
  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
    <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
      Total Record(s): {count}{hasMore ? '+' : ''}
    </span>
    {children}
    <div className="relative ml-auto w-[160px]">
      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search…"
        disabled={disabled}
        className="h-7 pl-7 text-xs"
      />
    </div>
  </div>
);

// Left-hand panel: a searchable checklist of employees not yet mapped. `rows` holds only the pages
// paged in so far — search is applied server-side, and scrolling to the bottom pulls the next page.
// `needsFilterSelection` is true before the Entity/BU filter above has been narrowed to one BU — the
// panel deliberately shows a prompt instead of any employee data until then (see EntityBuFilterBar):
// this endpoint's full "every employee in the caller's scope" result is expensive and rarely what an
// admin wants to browse unfiltered.
const SelectPanel = ({
  rows, search, onSearchChange, selectedKeys, onToggle, onToggleAll,
  hasMore, isLoadingMore, onLoadMore, error, needsFilterSelection, filterPromptMessage,
}) => {
  // Select All spans the rows currently loaded, which is all this panel can speak for — scrolling
  // further in and ticking it again extends the selection rather than replacing it.
  const allChecked = rows.length > 0 && rows.every((r) => selectedKeys.includes(r.key));
  const sentinelRef = useLoadMoreOnVisible({ hasMore, isLoading: isLoadingMore, onLoadMore });

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
      <PanelSearchBar
        count={rows.length}
        hasMore={hasMore}
        search={search}
        onSearchChange={onSearchChange}
        disabled={needsFilterSelection}
      />
      <div className="h-[20rem] overflow-y-auto">
        {/* The options endpoint 403s a caller without Service PO mapping authority and 404s a PO
            outside their scope — both would otherwise read as an innocuous "No Data". */}
        {error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <Inbox className="h-8 w-8 opacity-40 text-muted-foreground" />
            <span className="text-sm text-destructive">{extractApiError(error)}</span>
          </div>
        ) : needsFilterSelection ? (
          <EmptyState message={filterPromptMessage} />
        ) : rows.length === 0 && !isLoadingMore ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="w-28 px-3 py-2">
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => onToggleAll(rows.map((r) => r.key), !!v)}
                    />
                    Select All
                  </label>
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Employee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selectedKeys.includes(row.key)}
                      onCheckedChange={() => onToggle(row.key)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <p className="text-sm font-medium leading-none">{row.name}</p>
                    {row.sub && <p className="mt-0.5 text-xs text-muted-foreground">{row.sub}</p>}
                  </td>
                </tr>
              ))}
              {(hasMore || isLoadingMore) && (
                <tr ref={sentinelRef}>
                  <td colSpan={2} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading more…
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// Already-mapped employees arrive from the server as one full list (that endpoint has no
// page/limit support), so this panel windows it client-side instead: only the first page of
// rows renders, and scrolling to the bottom reveals the next page, the same "load more as you
// scroll" feel as the left panel without adding extra round trips.
const MAPPED_PANEL_PAGE_SIZE = 10;

// Right-hand panel: employees already mapped, each with an "Is Mapped?" toggle
// (deactivate), a "PM" toggle (is_project_manager) and a remove (delete) action.
const MappedPanel = ({ rows, search, onSearchChange, renderToggle, renderPm, selectAll }) => {
  const filtered = filterRows(rows, search);
  const [visibleCount, setVisibleCount] = useState(MAPPED_PANEL_PAGE_SIZE);

  // Re-narrowing the search (or the mapping list itself changing) should start back at one page,
  // not keep whatever count scrolling had reached for the previous list.
  useEffect(() => {
    setVisibleCount(MAPPED_PANEL_PAGE_SIZE);
  }, [search, rows]);

  const visibleRows = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const sentinelRef = useLoadMoreOnVisible({
    hasMore,
    isLoading: false,
    onLoadMore: () => setVisibleCount((c) => c + MAPPED_PANEL_PAGE_SIZE),
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
      <PanelSearchBar count={filtered.length} search={search} onSearchChange={onSearchChange}>
        {selectAll && (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground">
            Select All
            <Switch checked={selectAll.checked} disabled={selectAll.disabled} onCheckedChange={selectAll.onCheckedChange} />
          </label>
        )}
      </PanelSearchBar>
      <div className="h-[20rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="w-28 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Is Mapped?</th>
                {renderPm && <th className="w-20 px-2 py-2 text-left text-xs font-medium text-muted-foreground">PM</th>}
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Employee</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {renderToggle(row)}
                  </td>
                  {renderPm && (
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      {renderPm(row)}
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <p className="text-sm font-medium leading-none">{row.name}</p>
                    {row.sub && <p className="mt-0.5 text-xs text-muted-foreground">{row.sub}</p>}
                  </td>
                </tr>
              ))}
              {hasMore && (
                <tr ref={sentinelRef}>
                  <td colSpan={renderPm ? 3 : 2} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading more…
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// Splits the flat `businessUnits` list (each optionally carrying a `parentBuId` — see
// ServicePOMapping's own `businessUnitOptions` enrichment) into a Business Unit + Sub BU cascade,
// exactly mirroring components/common/BusinessUnitFilter's own multi-select logic (same reasoning
// throughout, including the emitted-id de-duplication — a Parent whose own Sub-BU is specifically
// selected must not also send its own wider id, or the two together silently re-widen right back
// to the whole Parent server-side). Kept local to this screen rather than reusing that shared
// component because the data source differs: it reads GET /companies via
// useSelectableBusinessUnits, while this screen deliberately uses its own
// employee-servicepo-mapping/filter-options endpoint instead (some roles this screen serves — BU
// Admin, Service PO Admin, Delivery Head — 403 or get a narrower result from GET /companies; see
// businessUnitOptions' own comment).
const computeBuCascade = (businessUnits, buIds, onBuIdsChange) => {
  const rootIds = new Set(businessUnits.filter((bu) => bu.parentBuId == null).map((bu) => String(bu.id)));
  const roots = businessUnits.filter((bu) => rootIds.has(String(bu.id)));
  const selectedParentIds = buIds.filter((id) => rootIds.has(id));
  const selectedChildIds = buIds.filter((id) => !rootIds.has(id));

  const childParentIds = new Set(
    selectedChildIds
      .map((cid) => businessUnits.find((bu) => String(bu.id) === cid)?.parentBuId)
      .filter((pid) => pid != null)
      .map(String)
  );
  const effectiveParentIds = Array.from(new Set([...selectedParentIds, ...childParentIds]));

  const subBuOptions = effectiveParentIds.flatMap((pid) => businessUnits.filter((bu) => String(bu.parentBuId) === pid));
  const showSubBu = subBuOptions.length > 0;

  const emit = (parentIds, childIds) => {
    const parentIdsWithChildSelected = new Set(
      childIds
        .map((cid) => businessUnits.find((bu) => String(bu.id) === cid)?.parentBuId)
        .filter((pid) => pid != null)
        .map(String)
    );
    const scopedParentIds = parentIds.filter((pid) => !parentIdsWithChildSelected.has(pid));
    onBuIdsChange([...scopedParentIds, ...childIds]);
  };

  const handleParentChange = (nextParentIds) => {
    const stillValidChildIds = selectedChildIds.filter((cid) => {
      const child = businessUnits.find((bu) => String(bu.id) === cid);
      return child && nextParentIds.includes(String(child.parentBuId));
    });
    emit(nextParentIds, stillValidChildIds);
  };

  const handleChildChange = (nextChildIds) => emit(effectiveParentIds, nextChildIds);

  return { roots, effectiveParentIds, subBuOptions, showSubBu, selectedChildIds, handleParentChange, handleChildChange };
};

// Left panel's own Entity → BU → Sub BU cascade: picking an Entity narrows the BU dropdown's
// options (client-side, from that Entity's own BUs); picking one or more BUs (or Sub-BUs) is what
// actually re-queries the left panel's employee list, scoped server-side (see
// useServicePOEmployeeOptions — the backend only filters by one BU per call, so multiple selected
// BUs are fetched in turn and merged there). Neither dropdown touches the right panel or the
// caller's ambient selected BU.
const EntityBuFilterBar = ({
  entities, entityId, onEntityChange,
  businessUnits, isLoading, buIds, onBuIdsChange,
}) => {
  const { roots, effectiveParentIds, subBuOptions, showSubBu, selectedChildIds, handleParentChange, handleChildChange } =
    computeBuCascade(businessUnits, buIds, onBuIdsChange);

  return (
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <div className="flex w-56 flex-col gap-1.5">
        <Label className="text-xs">Entity</Label>
        <SearchableSelect
          options={entities.map((e) => ({ label: e.entity_name ?? e.name, value: String(e.id) }))}
          value={entityId}
          onValueChange={onEntityChange}
          placeholder={isLoading ? 'Loading…' : 'Select Entity'}
          searchPlaceholder="Search entity..."
          className="bg-white"
          clearable
          clearValue="all"
        />
      </div>
      <div className="flex w-56 flex-col gap-1.5">
        <Label className="text-xs">Business Unit</Label>
        <MultiSelect
          options={roots.map((bu) => ({ label: bu.company_name, value: String(bu.id) }))}
          value={effectiveParentIds}
          onValueChange={handleParentChange}
          disabled={entityId === 'all'}
          placeholder={
            entityId === 'all' ? 'Select an Entity first' : isLoading ? 'Loading…' : 'Select Business Unit'
          }
          searchPlaceholder="Search business unit..."
          className="bg-white"
        />
      </div>
      {showSubBu && (
        <div className="flex w-56 flex-col gap-1.5">
          <Label className="text-xs">Sub BU</Label>
          <MultiSelect
            options={subBuOptions.map((bu) => ({ label: bu.company_name, value: String(bu.id) }))}
            value={selectedChildIds}
            onValueChange={handleChildChange}
            placeholder="All Sub BUs"
            searchPlaceholder="Search sub BU..."
            className="bg-white"
          />
        </div>
      )}
    </div>
  );
};

const MoveButton = ({ disabled, onClick, title }) => (
  <div className="flex h-[20rem] items-center justify-center">
    <Button
      type="button"
      size="icon"
      className="h-9 w-9 shrink-0 rounded-full"
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      <ChevronRight className="h-4 w-4" />
    </Button>
  </div>
);

const MappingSkeleton = () => (
  <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
    <Skeleton className="h-[20rem] w-full" />
    <div className="flex h-[20rem] items-center justify-center px-2">
      <Skeleton className="h-9 w-9 rounded-full" />
    </div>
    <Skeleton className="h-[20rem] w-full" />
  </div>
);

// Maps employees to a Service PO for timesheet entry — this is what feeds the employee's
// Project dropdown in My Timesheet. (Resource allocation/planning used to live in a second
// tab here; removed since it wasn't backed by real data.)
const ServicePOMapping = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: showError } = useNotification();
  const canManageResources = useCanWrite();

  // Back returns to whichever screen linked here — the PO list's "Map Employees" row action or the
  // PO detail page's button, both of which pass their own path as `state.from`. It used to hardcode
  // the detail page, so coming from the list dropped the user on a screen they'd never opened.
  // The fallback covers a direct URL / bookmark, where there is no origin to return to: the list is
  // this screen's canonical parent, and no history entry is assumed (a `navigate(-1)` here could
  // walk out of the app).
  const backTo = location.state?.from ?? ROUTES.SERVICE_POS;

  const [selectedForMapping, setSelectedForMapping] = useState([]);
  const [searchLeft, setSearchLeft] = useState('');
  const [searchRight, setSearchRight] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [buFilters, setBuFilters] = useState([]); // multi-select: array of BU id strings

  // Mobile — single combined list (see below) instead of the desktop two-panel transfer list.
  // Reuses `searchLeft` as its own search box (the same server-side search that already narrows
  // the "available" query) rather than introducing a second, parallel search state.
  const MOBILE_PAGE_SIZE = 10;
  const [mobilePage, setMobilePage] = useState(1);
  const [mobileMappingId, setMobileMappingId] = useState(null); // employee id currently being mapped (per-row spinner)
  const [mobileBulkMapping, setMobileBulkMapping] = useState(false);
  const [mobileActionRow, setMobileActionRow] = useState(null); // mapped row whose "⋮" opened the action sheet
  const [mobileRemovingId, setMobileRemovingId] = useState(null); // mapping id currently being removed

  const { data: servicePO, isPending: isLoadingPO } = useServicePO(id);
  // Entity → BU filter dropdowns above the left panel (see EntityBuFilterBar). One call returns
  // every Entity/Business Unit within the caller's own authorized "Map Employees" scope — NOT
  // GET /entities or GET /companies, which either 403 a BU Admin/Service PO Admin/Delivery Head or
  // (for a BU Admin) silently return a narrower set than this screen is actually scoped to (see
  // useEmployeeServicePOMappingFilterOptions' doc comment). Both dropdowns filter this single
  // result client-side; only the BU choice (one or more) is ever sent to the server, as
  // `business_unit_id` — one call per selected BU, see useServicePOEmployeeOptions.
  const { data: filterOptions, isLoading: isLoadingFilterOptions } = useEmployeeServicePOMappingFilterOptions(canManageResources);
  const entities = filterOptions?.entities ?? [];
  const selectedEntityId = entityFilter !== 'all' ? Number(entityFilter) : null;
  // The mapping-scoped filter-options endpoint's own `business_units` rows don't carry
  // parent_business_unit_id, so a Sub-BU can't be told apart from a top-level Parent from that
  // response alone. Enriched here against GET /companies purely for that one field (id ->
  // parent_business_unit_id) — never as the source of the BU list itself, which stays
  // filter-options' own authorized-scope result. This degrades safely: a login this 403s for (a
  // narrower BU-scoped role) just gets every parentBuId as undefined below, which the cascade
  // below reads the same as "no Sub-BU exists" — i.e. today's flat single-dropdown behavior,
  // never a crash or a wrong split.
  const { data: companiesForParentLookup } = useCompanies({ status: 'active', limit: 500 }, { staleTime: 1000 * 60 * 10 });
  const parentBuIdByCompanyId = new Map(
    (companiesForParentLookup?.data ?? []).map((c) => [String(c.id), c.parent_business_unit_id ?? c.parent?.id ?? null])
  );
  const businessUnitOptions = (selectedEntityId
    ? (filterOptions?.business_units ?? []).filter((bu) => bu.entity_id === selectedEntityId)
    : []
  ).map((bu) => ({ ...bu, parentBuId: parentBuIdByCompanyId.get(String(bu.id)) ?? null }));
  // Mobile's own inline block (below, in the JSX) can't call the desktop EntityBuFilterBar
  // component as-is — different layout (stacked, not flex-wrap) — so it computes the same cascade
  // here and renders it itself instead.
  const mobileBuCascade = computeBuCascade(businessUnitOptions, buFilters, setBuFilters);
  const selectedBusinessUnitIds = buFilters.map(Number);

  const handleEntityFilterChange = (v) => {
    setEntityFilter(v);
    setBuFilters([]);
  };
  // The PO's own eligibility endpoint, NOT a generic employee list: those scope to the caller's own
  // team or their currently-selected BU, which is why this panel used to show 4 of 18. This one is
  // scoped server-side to the caller's entire authorized Admin/company scope — every BU they manage
  // — so nothing here may re-narrow it by the caller's *ambient* selected BU. `selectedBusinessUnitIds`
  // is different: the panel's own explicit Entity → BU filter dropdowns, opted into here the same way
  // `search` is. Arrives a page at a time as the panel scrolls; search is debounced because it is a
  // request, not a client-side filter.
  //
  // Deliberately NOT fetched until at least one Business Unit is actually picked
  // (`needsFilterSelection` below) — the unfiltered result is every employee in the caller's whole
  // scope, which is both expensive and rarely what an admin opening this screen wants to browse.
  // The left panel shows a prompt instead (see SelectPanel) until then.
  const debouncedSearchLeft = useDebounce(searchLeft, 400);
  const needsFilterSelection = selectedBusinessUnitIds.length === 0;
  const shouldLoadEligibleEmployees = canManageResources && !needsFilterSelection;
  const filterPromptMessage = entityFilter === 'all'
    ? 'Select an Entity and Business Unit to view employees.'
    : 'Select a Business Unit to view employees.';
  const {
    data: employeeOptions,
    isPending: isLoadingEmployees,
    error: employeeOptionsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useServicePOEmployeeOptions(shouldLoadEligibleEmployees ? id : null, debouncedSearchLeft, selectedBusinessUnitIds);
  const eligibleEmployees = employeeOptions?.employees ?? [];

  // Multi-BU fan-out: when BU[0] returns 0 eligible employees the scroll sentinel inside
  // SelectPanel never renders (it lives inside the table, which is replaced by EmptyState
  // when rows.length === 0). Without this, fetchNextPage is never called and BU[1..n]
  // employees are silently skipped. Auto-advance as soon as the empty page settles.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoadingEmployees && eligibleEmployees.length === 0 && shouldLoadEligibleEmployees) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoadingEmployees, eligibleEmployees.length, shouldLoadEligibleEmployees, fetchNextPage]);

  const { data: mappings = [], isPending: isLoadingMappings } = useServicePOEmployeeMappings(id);

  const createMappingMutation = useCreateEmployeeServicePOMapping();
  const mappingStatusMutation = useSetEmployeeServicePOMappingStatus();
  const deleteMappingMutation = useDeleteEmployeeServicePOMapping();
  const setPmMutation = useSetProjectManager();

  // Pure flag flip, no mapping create/delete/status change. The 400 an employee who doesn't
  // currently hold the Project Manager role gets back is a server-side backstop (there's no
  // reliable client-side role signal on this screen — the generic employee list this could
  // otherwise consult scopes to the caller's own team/BU, not this PO's actual mapped set), so
  // this just surfaces whatever message comes back rather than pre-disabling the switch.
  const handleTogglePm = async (mappingId, checked) => {
    try {
      await setPmMutation.mutateAsync({ id: mappingId, isProjectManager: checked });
    } catch (err) {
      showError(formatProjectManagerAssignmentError(err));
    }
  };

  // `eligible_employees` includes employees already mapped, so this two-panel transfer list moves
  // those to the right and takes them off the left. Keyed off the PO's mapping records ALONE — the
  // documented source of truth, and the same rows the right panel renders, so the two panels can
  // never disagree about who is mapped. It covers deactivated mappings too: an employee toggled off
  // still owns a mapping row and must not reappear as available, or mapping them again would 409.
  // The response's own mapped_employee_ids is deliberately not consulted (see
  // useServicePOEmployeeOptions).
  //
  // This is mapped-state filtering only — it never re-narrows by Business Unit itself. Any BU
  // narrowing already happened server-side, via the explicit Entity/BU filter above, not by
  // silently reapplying the caller's own scope (which is what would restore the bug).
  const mappedEmployeeIds = new Set(mappings.map((m) => Number(m.employee_id)));
  const availableForMapping = eligibleEmployees.filter((e) => !mappedEmployeeIds.has(Number(e.id)));

  const employeeSub = (e) => [e.employee_code ?? e.code, e.designation].filter(Boolean).join(' · ');
  const leftRows = availableForMapping.map((e) =>
    toRow(e.id, e.full_name ?? e.employee_name ?? e.name, employeeSub(e), e)
  );
  const rightRows = mappings.map((m) => {
    const { name, code } = resolveMappingEmployee(m);
    return toRow(m.id, name, code, m);
  });

  const toggleMappingSelection = (empId) => {
    setSelectedForMapping((prev) =>
      prev.includes(empId) ? prev.filter((x) => x !== empId) : [...prev, empId]
    );
  };

  const toggleAllMappingSelection = (keys, checked) => {
    setSelectedForMapping((prev) =>
      checked ? Array.from(new Set([...prev, ...keys])) : prev.filter((k) => !keys.includes(k))
    );
  };

  const handleMapSelected = async () => {
    if (selectedForMapping.length === 0) return;
    try {
      await Promise.all(
        selectedForMapping.map((empId) =>
          createMappingMutation.mutateAsync({ employeeId: empId, servicePOId: id })
        )
      );
      success('Employees mapped for timesheet entry.');
      setSelectedForMapping([]);
    } catch (err) {
      showError(extractApiError(err));
    }
  };

  // Bulk-flip every currently-visible mapping's active status in one go (the
  // "Select All" switch above the mapped list).
  const allMappingsActive = rightRows.length > 0 && rightRows.every((r) => (r.raw.status ?? 'active') === 'active');
  const handleToggleAllMappings = async (checked) => {
    const toChange = rightRows.filter((r) => ((r.raw.status ?? 'active') === 'active') !== checked);
    if (toChange.length === 0) return;
    try {
      await Promise.all(
        toChange.map((r) => mappingStatusMutation.mutateAsync({ id: r.key, active: checked }))
      );
    } catch (err) {
      showError(extractApiError(err));
    }
  };

  // Mobile — one combined, searchable list instead of the desktop transfer-list panels. Built
  // from the exact same `leftRows`/`rightRows` (no separate fetch/business logic), each tagged
  // with its mapped state so a single row renderer can show "Mapped" + a "⋮" action sheet or a
  // "+ Map" button. `leftRows` already excludes anyone in `rightRows` (see `availableForMapping`
  // above), so the two never overlap.
  const mobileRows = [
    ...filterRows(rightRows, searchRight || searchLeft).map((r) => ({ ...r, mapped: true })),
    ...leftRows.map((r) => ({ ...r, mapped: false })),
  ];
  const mobileTotalPages = Math.max(1, Math.ceil(mobileRows.length / MOBILE_PAGE_SIZE));
  const pagedMobileRows = mobileRows.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE);

  useEffect(() => {
    if (mobilePage > mobileTotalPages) setMobilePage(mobileTotalPages);
  }, [mobileTotalPages, mobilePage]);

  const handleMobileNext = () => {
    // The "available" side is a paged server query — if the next mobile page needs rows past
    // what's loaded so far and the server has more, pull them in too.
    if (mobilePage * MOBILE_PAGE_SIZE >= mobileRows.length && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
    setMobilePage((p) => p + 1);
  };

  const handleMobileMap = async (employeeId) => {
    setMobileMappingId(employeeId);
    try {
      await createMappingMutation.mutateAsync({ employeeId, servicePOId: id });
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setMobileMappingId(null);
    }
  };

  const handleMobileSelectAll = async (checked) => {
    if (!checked || leftRows.length === 0) return;
    setMobileBulkMapping(true);
    try {
      await Promise.all(
        leftRows.map((r) => createMappingMutation.mutateAsync({ employeeId: r.key, servicePOId: id }))
      );
      success('Employees mapped for timesheet entry.');
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setMobileBulkMapping(false);
    }
  };

  const handleMobileRemoveMapping = async (row) => {
    setMobileRemovingId(row.key);
    try {
      await deleteMappingMutation.mutateAsync(row.key);
      success('Mapping removed.');
      setMobileActionRow(null);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setMobileRemovingId(null);
    }
  };

  const handleMobileViewDetails = (row) => {
    setMobileActionRow(null);
    const employeeId = row.raw?.employee_id;
    if (employeeId != null) navigate(buildPath(ROUTES.EMPLOYEE_EDIT, { id: employeeId }));
  };

  if (!isLoadingPO && !servicePO) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Service PO not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(ROUTES.SERVICE_POS)}>
          Back to Service POs
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Map Employees"
        description={
          isLoadingPO ? undefined : (
            <>
              {servicePO?.service_po_name ?? servicePO?.service_po_code}
              {servicePO?.service_po_code && servicePO?.service_po_name && (
                <span className="font-mono text-xs"> · {servicePO.service_po_code}</span>
              )}
            </>
          )
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(backTo)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
        }
      />

      {/* <p className="text-xs text-muted-foreground">
        Employees mapped here see this Service PO in their Timesheet's Project dropdown.
        {rightRows.length > 0 && (
          <Badge variant="secondary" className="ml-2 text-xs">{rightRows.length} mapped</Badge>
        )}
      </p> */}

      {canManageResources && !isLoadingPO && (
        <>
          {/* Desktop — same grid template as the two-panel row below (grid-cols-[1fr_auto_1fr]),
              so this filter bar's own width lines up with just the Select panel's column instead
              of spanning both panels; it only ever drives the left panel's own employee list, so
              stretching across the Mapped panel too read as if it filtered that side as well. */}
          <div className="hidden md:grid grid-cols-[1fr_auto_1fr] gap-2">
            <EntityBuFilterBar
              entities={entities}
              entityId={entityFilter}
              onEntityChange={handleEntityFilterChange}
              businessUnits={businessUnitOptions}
              isLoading={isLoadingFilterOptions}
              buIds={buFilters}
              onBuIdsChange={setBuFilters}
            />
          </div>
          {/* Mobile — same Entity → BU → Sub BU cascade, stacked full-width instead of an inline row. */}
          <div className="mb-3 grid grid-cols-1 gap-3 md:hidden">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Entity</Label>
              <SearchableSelect
                options={entities.map((e) => ({ label: e.entity_name ?? e.name, value: String(e.id) }))}
                value={entityFilter}
                onValueChange={handleEntityFilterChange}
                placeholder={isLoadingFilterOptions ? 'Loading…' : 'Select Entity'}
                searchPlaceholder="Search entity..."
                className="h-11 bg-white"
                clearable
                clearValue="all"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Business Unit</Label>
              <MultiSelect
                options={mobileBuCascade.roots.map((bu) => ({ label: bu.company_name, value: String(bu.id) }))}
                value={mobileBuCascade.effectiveParentIds}
                onValueChange={mobileBuCascade.handleParentChange}
                disabled={entityFilter === 'all'}
                placeholder={
                  entityFilter === 'all' ? 'Select an Entity first' : isLoadingFilterOptions ? 'Loading…' : 'Select Business Unit'
                }
                searchPlaceholder="Search business unit..."
                className="h-11 bg-white"
              />
            </div>
            {mobileBuCascade.showSubBu && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Sub BU</Label>
                <MultiSelect
                  options={mobileBuCascade.subBuOptions.map((bu) => ({ label: bu.company_name, value: String(bu.id) }))}
                  value={mobileBuCascade.selectedChildIds}
                  onValueChange={mobileBuCascade.handleChildChange}
                  placeholder="All Sub BUs"
                  searchPlaceholder="Search sub BU..."
                  className="h-11 bg-white"
                />
              </div>
            )}
          </div>
        </>
      )}

      {isLoadingPO || isLoadingMappings || (shouldLoadEligibleEmployees && isLoadingEmployees) ? (
        <>
          <div className="hidden md:block"><MappingSkeleton /></div>
          <div className="flex flex-col gap-2 md:hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
        <div className={cn('hidden md:grid gap-2 items-start', canManageResources ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-1')}>
          {canManageResources && (
            <>
              <SelectPanel
                rows={leftRows}
                search={searchLeft}
                onSearchChange={setSearchLeft}
                selectedKeys={selectedForMapping}
                onToggle={toggleMappingSelection}
                onToggleAll={toggleAllMappingSelection}
                needsFilterSelection={needsFilterSelection}
                filterPromptMessage={filterPromptMessage}
                hasMore={!!hasNextPage}
                isLoadingMore={isFetchingNextPage}
                onLoadMore={fetchNextPage}
                error={employeeOptionsError}
              />
              <MoveButton
                title={createMappingMutation.isPending ? 'Mapping…' : 'Map selected'}
                disabled={selectedForMapping.length === 0 || createMappingMutation.isPending}
                onClick={handleMapSelected}
              />
            </>
          )}
          <MappedPanel
            rows={rightRows}
            search={searchRight}
            onSearchChange={setSearchRight}
            selectAll={canManageResources ? {
              checked: allMappingsActive,
              disabled: mappingStatusMutation.isPending,
              onCheckedChange: handleToggleAllMappings,
            } : undefined}
            renderToggle={(row) => {
              const isMappingActive = (row.raw.status ?? 'active') === 'active';
              return (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isMappingActive}
                    disabled={mappingStatusMutation.isPending}
                    onCheckedChange={(checked) =>
                      mappingStatusMutation.mutate({ id: row.key, active: checked })
                    }
                  />
                  <span className={cn('text-[11px] font-medium', isMappingActive ? 'text-green-600' : 'text-slate-400')}>
                    {isMappingActive ? 'Yes' : 'No'}
                  </span>
                </div>
              );
            }}
            // Centralised Service POs don't get a PM at all — every employee auto-mapped to one is
            // a plain member, never "the PM" for it — so the whole column is omitted rather than
            // rendered disabled, matching how the create/bulk-map flow already skips PM entirely
            // for this screen.
            renderPm={servicePO?.is_centralised ? undefined : (row) => {
              const isMappingActive = (row.raw.status ?? 'active') === 'active';
              const isPm = !!row.raw.is_project_manager;
              return (
                <div className="flex items-center gap-2" title={!isMappingActive ? 'Reactivate this mapping to change PM status' : undefined}>
                  <Switch
                    checked={isPm}
                    disabled={!isMappingActive || setPmMutation.isPending}
                    onCheckedChange={(checked) => handleTogglePm(row.key, checked)}
                  />
                  <span className={cn('text-[11px] font-medium', isPm ? 'text-blue-600' : 'text-slate-400')}>
                    {isPm ? 'Yes' : 'No'}
                  </span>
                </div>
              );
            }}
          />
        </div>

        {/* Mobile — one combined, searchable list (see mobileRows above) instead of the desktop
            transfer-list panels: each row shows its own state ("Mapped" + a "⋮" action sheet, or
            a "+ Map" button) rather than a separate select-then-move step. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {mobileRows.length}{hasNextPage ? '+' : ''} employee{mobileRows.length === 1 && !hasNextPage ? '' : 's'}
            </p>
            {canManageResources && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                Select All
                <Switch
                  checked={mobileBulkMapping}
                  disabled={mobileBulkMapping || leftRows.length === 0}
                  onCheckedChange={handleMobileSelectAll}
                />
              </label>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
            <Input
              value={searchLeft}
              onChange={(e) => setSearchLeft(e.target.value)}
              placeholder="Search employees..."
              className="h-11 pl-9 bg-white"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {needsFilterSelection && canManageResources ? (
              <EmptyState message={filterPromptMessage} />
            ) : pagedMobileRows.length === 0 ? (
              <EmptyState />
            ) : (
              pagedMobileRows.map((row) => (
                <div key={`${row.mapped ? 'm' : 'a'}-${row.key}`} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                    {row.sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.sub}</p>}
                  </div>
                  {row.mapped ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="success" className="font-normal">Mapped</Badge>
                      {!servicePO?.is_centralised && row.raw?.is_project_manager && (
                        <Badge variant="secondary" className="font-normal">PM</Badge>
                      )}
                      {canManageResources && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          aria-label="Actions"
                          onClick={() => setMobileActionRow(row)}
                        >
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  ) : canManageResources ? (
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={mobileMappingId === row.key || createMappingMutation.isPending}
                      onClick={() => handleMobileMap(row.key)}
                    >
                      {mobileMappingId === row.key ? <Loader2 className="h-4 w-4 animate-spin" /> : '+ Map'}
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <MobilePagination
            className="shrink-0 border-t pt-3"
            page={mobilePage}
            totalPages={mobileTotalPages}
            total={mobileRows.length}
            limit={MOBILE_PAGE_SIZE}
            itemLabel="employee"
            onPrev={() => setMobilePage((p) => Math.max(1, p - 1))}
            onNext={handleMobileNext}
          />
        </div>

        {/* Mobile row actions — mirrors the desktop mapped-row Switch (deactivate) as a Remove,
            since this list has no separate active/inactive state of its own on mobile. */}
        <Sheet open={!!mobileActionRow} onOpenChange={(open) => !open && setMobileActionRow(null)}>
          <SheetContent side="bottom" className="rounded-t-2xl md:hidden">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-3 text-base">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{getInitials(mobileActionRow?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate">{mobileActionRow?.name}</p>
                  {mobileActionRow?.sub && (
                    <p className="truncate text-xs font-normal text-muted-foreground">{mobileActionRow.sub}</p>
                  )}
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col py-2">
              {canManageResources && (
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive/5 disabled:pointer-events-none disabled:opacity-60"
                  disabled={mobileRemovingId === mobileActionRow?.key}
                  onClick={() => handleMobileRemoveMapping(mobileActionRow)}
                >
                  {mobileRemovingId === mobileActionRow?.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2Off className="h-4 w-4" />
                  )}
                  Remove Mapping
                </button>
              )}
              <button
                type="button"
                className="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-sm font-medium hover:bg-muted/50"
                onClick={() => handleMobileViewDetails(mobileActionRow)}
              >
                <Info className="h-4 w-4" />
                View Employee Details
              </button>
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setMobileActionRow(null)}>
                Cancel
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        </>
      )}
    </div>
  );
};

export default ServicePOMapping;
