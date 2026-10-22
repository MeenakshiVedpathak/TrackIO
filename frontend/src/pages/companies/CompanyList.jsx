import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Outlet } from 'react-router-dom';
import { Plus, Pencil, Power, PowerOff, MoreVertical, ChevronDown, ChevronRight, Network, ArrowUpDown, Check, ChevronLeft } from 'lucide-react';
import { useCompanies, useUpdateCompany } from '@/hooks/useCompanies';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { useCanManageBusinessUnits } from '@/hooks/usePermissions';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import MobilePagination from '@/components/common/MobilePagination';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

const ALL = 'all';

// Mobile-only client-side re-ordering of the already-fetched/filtered root list — the desktop
// table has no sort control of its own (just the backend's default company_name ASC), so this
// doesn't change or need to match anything server-side; it only reorders `roots`, never
// `children` (each Sub-BU stays under its own Parent, in its existing order).
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name_asc', label: 'BU Name (A–Z)' },
  { value: 'name_desc', label: 'BU Name (Z–A)' },
  { value: 'status_active_first', label: 'Status — Active first' },
  { value: 'status_inactive_first', label: 'Status — Inactive first' },
];

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn('text-sm truncate', className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

const CompanyList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entityIdParam = searchParams.get('entity_id');
  const { success, error: showError } = useNotification();
  // BU Master is now reachable read-only by the BU-scoped senior tier (BU Admin / BU Head), who
  // need to see the BUs they map employees against but may never add, rename or deactivate one —
  // that stays with Admin / Entity Admin (see useCanManageBusinessUnits and the route guards on
  // COMPANY_NEW / COMPANY_EDIT). For them this whole screen is a plain list: no Actions column,
  // no "Add BU", and no click-through to the edit form.
  const canManage = useCanManageBusinessUnits();

  const [search, setSearch] = useState('');
  const [statusTarget, setStatusTarget] = useState(null); // { company, nextStatus }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(ALL);
  // Only meaningful when there's no entityIdParam — a BU list already scoped to one Entity (via
  // the Entity list's "Manage BUs" action) has nothing left to narrow by Entity.
  const [entityFilters, setEntityFilters] = useState([]);
  // Sub-BUs collapsed under their Parent by default — expanding is an explicit per-row choice.
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  // Mobile card list only (see SORT_OPTIONS above) — desktop's table order is untouched.
  const [sortOption, setSortOption] = useState('newest');

  // Client-side pagination over the top-level (Parent) BUs — each Parent always renders with its
  // own Sub-BUs on the same page, so the tree is never split across pages.
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const debouncedSearch = useDebounce(search, 400);

  // Fetched whole (no server pagination) and filtered/grouped client-side below — the BU
  // hierarchy has to be built from the full flat list (parent_business_unit_id per row), and a
  // Sub-BU could otherwise land on a different server page than its own Parent, breaking the
  // tree. 500 matches the backend's own "load full list" cap (same one
  // useSelectableBusinessUnits already relies on) — this is an admin master list, not expected to
  // ever approach that in practice.
  const params = {
    limit: 500,
    ...(entityIdParam
      ? { entity_id: entityIdParam }
      : entityFilters.length > 0 && { entity_ids: entityFilters.join(',') }),
    status: ALL,
  };

  const { data, isPending, isError, refetch } = useCompanies(params);
  const updateMutation = useUpdateCompany(statusTarget?.company?.id);

  const activeFilterCount = [!entityIdParam && entityFilters.length > 0, statusFilter !== ALL].filter(Boolean).length;

  const clearFilters = () => {
    setEntityFilters([]);
    setStatusFilter(ALL);
  };

  const allCompanies = data?.data ?? [];

  // Client-side status + search filtering, then grouped into Parent BU -> Sub-BU[] — a Sub-BU
  // that matches search/status is kept (with its Parent shown for context even if the Parent
  // itself doesn't match, same "keep the parent as context" rule the BU filter dropdown uses).
  const { roots, childrenByParent, totalMatched } = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const passesOwn = (c) =>
      (statusFilter === ALL || c.status === statusFilter) &&
      (!q || c.company_name?.toLowerCase().includes(q) || c.company_code?.toLowerCase().includes(q));

    const byParent = new Map();
    allCompanies.forEach((c) => {
      if (c.parent_business_unit_id == null) return;
      const key = String(c.parent_business_unit_id);
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    });

    // Newest first (ids are sequential) — a just-created BU/Sub-BU lands at the top of page 1.
    const newestFirst = (a, b) => Number(b.id) - Number(a.id);
    byParent.forEach((list) => list.sort(newestFirst));
    const rootList = allCompanies.filter((c) => c.parent_business_unit_id == null).sort(newestFirst);
    let matchedCount = 0;
    const visibleRoots = rootList
      .map((root) => {
        const children = byParent.get(String(root.id)) ?? [];
        const matchedChildren = children.filter(passesOwn);
        const rootMatches = passesOwn(root);
        if (!rootMatches && matchedChildren.length === 0) return null;
        matchedCount += (rootMatches ? 1 : 0) + matchedChildren.length;
        return { root, children: matchedChildren, childMatched: !rootMatches && matchedChildren.length > 0 };
      })
      .filter(Boolean);

    return { roots: visibleRoots, childrenByParent: byParent, totalMatched: matchedCount };
  }, [allCompanies, statusFilter, debouncedSearch]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isExpanded = (id, childMatched) => expandedIds.has(String(id)) || (debouncedSearch.trim().length > 0 && childMatched);

  // Mobile-only reorder of `roots` per `sortOption` — see SORT_OPTIONS' own comment.
  const mobileRoots = useMemo(() => {
    const byName = (a, b) => (a.root.company_name ?? '').localeCompare(b.root.company_name ?? '');
    const sorted = [...roots];
    if (sortOption === 'newest') return sorted; // `roots` is already newest-first
    if (sortOption === 'name_desc') sorted.sort((a, b) => byName(b, a));
    else if (sortOption === 'status_active_first') sorted.sort((a, b) => Number(b.root.status === 'active') - Number(a.root.status === 'active') || byName(a, b));
    else if (sortOption === 'status_inactive_first') sorted.sort((a, b) => Number(a.root.status === 'active') - Number(b.root.status === 'active') || byName(a, b));
    else sorted.sort(byName); // 'name_asc' (default)
    return sorted;
  }, [roots, sortOption]);

  const totalRoots = roots.length;
  const totalPages = Math.max(1, Math.ceil(totalRoots / limit));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * limit;
  const pagedRoots = useMemo(() => roots.slice(pageStart, pageStart + limit), [roots, pageStart, limit]);
  const pagedMobileRoots = useMemo(() => mobileRoots.slice(pageStart, pageStart + limit), [mobileRoots, pageStart, limit]);

  // Back to page 1 whenever what's being listed changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, entityFilters, entityIdParam, sortOption, limit]);

  const goToAddBu = () => navigate(entityIdParam ? `${ROUTES.COMPANY_NEW}?entity_id=${entityIdParam}` : ROUTES.COMPANY_NEW);
  const goToAddSubBu = (parentId) => navigate(`${ROUTES.COMPANY_NEW}?parent_business_unit_id=${parentId}`);
  const goToEdit = (id) => navigate(buildPath(ROUTES.COMPANY_EDIT, { id }));

  const handleConfirmStatusChange = () => {
    updateMutation.mutate(
      { status: statusTarget.nextStatus },
      {
        onSuccess: () => {
          success(
            `${statusTarget.company.company_name} has been ${statusTarget.nextStatus === 'active' ? 'activated' : 'deactivated'}.`
          );
          setStatusTarget(null);
        },
        onError: (err) => {
          showError(extractApiError(err));
          setStatusTarget(null);
        },
      }
    );
  };

  // Shared row content (desktop table row + mobile card both call this) — one place to keep the
  // Parent-vs-Sub-BU visual distinction (indent, a small corner-arrow icon, muted "under X"
  // caption on the Sub-BU row) consistent between the two layouts.
  // Desktop — 3 separate colored icon buttons in the Actions column, matching every other
  // table's own row-action convention in this app (e.g. Service PO List's View/Map/Edit
  // buttons) rather than a dropdown menu. "Add Sub-BU" only exists on a top-level Parent BU's
  // own row — depth is capped at 2 levels, a Sub-BU can never itself have children.
  const RowActionButtons = ({ company, isTopLevel }) => {
    const isActive = company.status === 'active';
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          title="Edit BU"
          onClick={() => goToEdit(company.id)}
          className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        {isTopLevel && (
          <Button
            size="sm"
            title="Add Sub-BU"
            onClick={() => goToAddSubBu(company.id)}
            className="h-6 w-6 p-0 bg-violet-500 hover:bg-violet-600 text-white rounded transition-colors"
          >
            <Network className="h-3 w-3" />
          </Button>
        )}
        <Button
          size="sm"
          title={isActive ? 'Deactivate' : 'Activate'}
          onClick={() => setStatusTarget({ company, nextStatus: isActive ? 'inactive' : 'active' })}
          className={cn(
            'h-6 w-6 p-0 rounded transition-colors text-white',
            isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'
          )}
        >
          {isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
        </Button>
      </div>
    );
  };

  // Mobile — kept as a compact "⋮" dropdown (space-constrained cards, same convention every
  // other mobile list in this app already uses).
  const RowActionsMenu = ({ company, isTopLevel }) => {
    const isActive = company.status === 'active';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* h-10 w-10 (40px) — minimum comfortable touch target, not the h-8 (32px) icon-button
              size used elsewhere in this app for denser desktop UI. */}
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Actions" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => goToEdit(company.id)}>
            <Pencil className="h-4 w-4" /> Edit BU
          </DropdownMenuItem>
          {isTopLevel && (
            <DropdownMenuItem onClick={() => goToAddSubBu(company.id)}>
              <Network className="h-4 w-4" /> Add Sub-BU
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setStatusTarget({ company, nextStatus: isActive ? 'inactive' : 'active' })}>
            {isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {isActive ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="BU Management"
        description={
          entityIdParam
            ? 'BUs under this Entity'
            : canManage
              ? ''
              : 'BUs you are mapped to'
        }
        actions={
          <>
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <div className="flex items-center gap-3">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search BUs…"
                  className="w-[250px]"
                />
                <FilterToggleButton
                  isOpen={filtersOpen}
                  onToggle={() => setFiltersOpen((prev) => !prev)}
                  activeCount={activeFilterCount}
                />
                {canManage && (
                  <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={goToAddBu}>
                    <Plus className="h-4 w-4" /> Add BU
                  </Button>
                )}
              </div>
            </div>
            {canManage && (
              <Button size="toolbar" className="md:hidden" onClick={goToAddBu}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* A failed fetch previously showed nothing distinguishable from an empty or still-loading
          list (no isError was even read from useCompanies) — surfaced explicitly here, same
          convention as EmployeeRejectedEntries.jsx, with a Retry since this is a full master list
          rather than a small scoped widget. */}
      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>Unable to load Business Units. Please try again.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {totalMatched} Business Unit{totalMatched === 1 ? '' : 's'}
        </p>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Business Units…"
          className="w-full"
          inputClassName="h-10 bg-white"
        />
        {/* Filters opens FilterPanel's own mobile bottom sheet (unchanged, see FilterPanel.jsx) —
            Sort is purely client-side (SORT_OPTIONS/mobileRoots above), so it's a plain dropdown,
            not a second sheet. Equal-width side by side, matching the reference layout. */}
        <div className="flex items-center gap-2">
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={activeFilterCount}
            className="flex-1 justify-center"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="toolbar" variant="default" className="flex-1 justify-center">
                <ArrowUpDown />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.value} onClick={() => setSortOption(option.value)}>
                  <Check className={cn('h-4 w-4', sortOption !== option.value && 'invisible')} />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        {!entityIdParam && (
          <EntityFilter multiple value={entityFilters} onChange={(v) => setEntityFilters(v)} />
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white">
            {[
              { label: 'All', value: ALL },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ].map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'flex-1 px-3 h-full font-medium text-center transition-colors border-r last:border-r-0',
                  statusFilter === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </FilterPanel>

      {/* Desktop — Parent BU rows with their Sub-BUs indented directly beneath, expand/collapse
          per Parent. Plain table (not the shared DataTable) since this is a grouped tree, not a
          flat grid — see the comment on `params` above; it is fetched whole and paginated
          client-side by Parent BU. */}
      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-lg border md:flex">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b">
                {canManage && <th className="w-[100px] px-2 py-2 text-left text-xs font-semibold">Actions</th>}
                <th className="w-10 px-3 py-2" />
                <th className="px-2 py-2 text-left text-xs font-semibold">BU Name</th>
                <th className="px-2 py-2 text-left text-xs font-semibold">Entity Name</th>
                <th className="px-2 py-2 text-left text-xs font-semibold">BU Code</th>
                <th className="px-2 py-2 text-left text-xs font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={canManage ? 6 : 5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))
              ) : roots.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="p-0">
                    <EmptyState title="No records found" description="Try adjusting your search or filters." />
                  </td>
                </tr>
              ) : (
                pagedRoots.map(({ root, children, childMatched }) => {
                  const hasChildren = children.length > 0;
                  const expanded = isExpanded(root.id, childMatched);
                  return (
                    <Fragment key={root.id}>
                      <tr
                        className={cn('border-b transition-colors hover:bg-muted/30', canManage && 'cursor-pointer')}
                        onClick={canManage ? () => goToEdit(root.id) : undefined}
                      >
                        {canManage && (
                          <td className="px-2 py-2.5">
                            <RowActionButtons company={root} isTopLevel />
                          </td>
                        )}
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          {hasChildren ? (
                            <button type="button" onClick={() => toggleExpanded(root.id)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted" aria-label={expanded ? 'Collapse' : 'Expand'}>
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5">
                          <TruncatedCell value={root.company_name} maxWidth="230px" className="font-medium" />
                        </td>
                        <td className="px-2 py-2.5"><TruncatedCell value={root.entity?.entity_name} maxWidth="180px" /></td>
                        <td className="px-2 py-2.5"><TruncatedCell value={root.company_code} maxWidth="130px" /></td>
                        <td className="px-2 py-2.5"><StatusBadge status={root.status} /></td>
                      </tr>
                      {hasChildren && expanded && children.map((child) => (
                        <tr
                          key={child.id}
                          className={cn('border-b bg-muted/10 transition-colors hover:bg-muted/30', canManage && 'cursor-pointer')}
                          onClick={canManage ? () => goToEdit(child.id) : undefined}
                        >
                          {canManage && (
                            <td className="px-2 py-2">
                              <RowActionButtons company={child} isTopLevel={false} />
                            </td>
                          )}
                          <td />
                          <td className="px-2 py-2 pl-8">
                            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                              <Network className="h-3 w-3 shrink-0" />
                              <TruncatedCell value={child.company_name} maxWidth="210px" />
                            </div>
                          </td>
                          <td className="px-2 py-2"><TruncatedCell value={child.entity?.entity_name} maxWidth="180px" /></td>
                          <td className="px-2 py-2"><TruncatedCell value={child.company_code} maxWidth="130px" /></td>
                          <td className="px-2 py-2"><StatusBadge status={child.status} /></td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Desktop pagination footer — same look as DataTable's. Counts top-level BUs (each with its
          Sub-BUs) since pagination is by Parent. */}
      {!isPending && totalRoots > 0 && (
        <div className="hidden shrink-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between md:flex">
          <p className="text-[clamp(0.6875rem,0.75vw,0.75rem)] text-muted-foreground">
            Showing {pageStart + 1}–{Math.min(pageStart + limit, totalRoots)} of {totalRoots} Business Units
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[clamp(0.6875rem,0.75vw,0.75rem)] text-muted-foreground">Rows per page</span>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="h-[clamp(1.5rem,1.6vw,1.75rem)] w-[clamp(3.25rem,4vw,4rem)] bg-white text-[clamp(0.6875rem,0.75vw,0.75rem)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-[clamp(0.6875rem,0.75vw,0.75rem)] text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button variant="outline" size="icon-sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile — same Parent -> Sub-BU grouping and the same underlying data (`roots`/
          `childrenByParent`/`isExpanded`/`toggleExpanded`/`RowActionsMenu` are all shared with
          the desktop table above), presented as its own purpose-built card list rather than a
          shrunk table — see mobileRoots for the one mobile-only addition (client-side Sort).
          Parent/Sub-BU distinction is indentation + a left accent bar + lighter name weight on
          the Sub-BU card, not an icon on every row. The "⋮" menu sits on the name row by default;
          a Parent WITH Sub-BUs needs that spot for its expand/collapse chevron instead, so its
          "⋮" moves down next to the status badge — same rule both reference examples use. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 md:hidden">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Business Units
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-5 w-5 shrink-0 rounded" />
                </div>
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))
          ) : roots.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search or filters." />
          ) : (
            pagedMobileRoots.map(({ root, children, childMatched }) => {
              const hasChildren = children.length > 0;
              const expanded = isExpanded(root.id, childMatched);
              return (
                <div key={root.id} className="flex flex-col gap-2">
                  <div
                    className={cn('rounded-xl border bg-white p-3.5 shadow-sm', canManage && 'active:bg-slate-50')}
                    onClick={canManage ? () => goToEdit(root.id) : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Fallback text so a record with incomplete data never renders as a
                          blank-looking card — silent empty content reads as a bug, not as "no
                          name on file". */}
                      <p className="min-w-0 truncate text-[15px] font-semibold text-slate-900">
                        {root.company_name || 'Unnamed BU'}
                      </p>
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpanded(root.id); }}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                          aria-label={expanded ? 'Collapse Sub-BUs' : 'Expand Sub-BUs'}
                        >
                          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      ) : (
                        canManage && <RowActionsMenu company={root} isTopLevel />
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {root.entity?.entity_name || '—'} · {root.company_code || '—'}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusBadge status={root.status} />
                      {hasChildren && canManage && <RowActionsMenu company={root} isTopLevel />}
                    </div>
                  </div>

                  {hasChildren && expanded && (
                    <div className="flex flex-col gap-2 pl-4">
                      {children.map((child) => (
                        <div
                          key={child.id}
                          className={cn(
                            'rounded-xl border border-l-[3px] border-l-slate-300 bg-slate-50/70 p-3',
                            canManage && 'active:bg-slate-100'
                          )}
                          onClick={canManage ? () => goToEdit(child.id) : undefined}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                              {child.company_name || 'Unnamed BU'}
                            </p>
                            {canManage && <RowActionsMenu company={child} isTopLevel={false} />}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {child.entity?.entity_name || '—'} · {child.company_code || '—'}
                          </p>
                          <div className="mt-2">
                            <StatusBadge status={child.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {!isPending && totalRoots > 0 && (
          <MobilePagination
            className="shrink-0"
            page={currentPage}
            totalPages={totalPages}
            total={totalRoots}
            limit={limit}
            itemLabel="Business Unit"
            onPrev={() => setPage(currentPage - 1)}
            onNext={() => setPage(currentPage + 1)}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!statusTarget}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={statusTarget?.nextStatus === 'active' ? 'Activate BU?' : 'Deactivate BU?'}
        description={
          statusTarget?.nextStatus === 'active'
            ? `${statusTarget?.company?.company_name} will regain access to the platform.`
            : `${statusTarget?.company?.company_name} will lose access to the platform.`
        }
        confirmLabel={statusTarget?.nextStatus === 'active' ? 'Activate' : 'Deactivate'}
        variant={statusTarget?.nextStatus === 'active' ? 'default' : 'destructive'}
        onConfirm={handleConfirmStatusChange}
        isLoading={updateMutation.isPending}
      />

      <Outlet />
    </div>
  );
};

export default CompanyList;
