import { useState } from 'react';
import { useNavigate, useSearchParams, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Power, PowerOff, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCompanies, useUpdateCompany } from '@/hooks/useCompanies';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { useCanManageBusinessUnits } from '@/hooks/usePermissions';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import { getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

const ALL = 'all';

const columnHelper = createColumnHelper();

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

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([]);
  const [statusTarget, setStatusTarget] = useState(null); // { company, nextStatus }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(ALL);
  // Only meaningful when there's no entityIdParam — a BU list already scoped to one Entity (via
  // the Entity list's "Manage BUs" action) has nothing left to narrow by Entity.
  const [entityFilter, setEntityFilter] = useState(ALL);

  const debouncedSearch = useDebounce(search, 400);

  const effectiveEntityId = entityIdParam || (entityFilter !== ALL ? entityFilter : null);

  const params = {
    page,
    limit,
    ...(effectiveEntityId && { entity_id: effectiveEntityId }),
    // Always sent, 'all' included: GET /companies defaults `status` to 'active' when the param is
    // absent, so omitting it on the All tab silently hid every inactive BU. 'all' is an accepted
    // value there and means "no status filter".
    status: statusFilter,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useCompanies(params);
  const updateMutation = useUpdateCompany(statusTarget?.company?.id);

  const activeFilterCount = [!entityIdParam && entityFilter !== ALL, statusFilter !== ALL].filter(Boolean).length;

  const clearFilters = () => {
    setEntityFilter(ALL);
    setStatusFilter(ALL);
    setPage(1);
  };

  const companies = data?.data ?? [];
  const meta = data?.meta ?? {};

  // Edit / Activate-Deactivate — the two write actions on a BU, so the whole column is dropped
  // (not just disabled) for a login that can't manage BUs.
  const actionsColumn = columnHelper.display({
    id: 'actions',
    header: 'Actions',
    size: 110,
    meta: { sticky: true, left: 0 },
    cell: ({ row }) => {
      const company = row.original;
      const isActive = company.status === 'active';
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            title="Edit"
            onClick={() => navigate(buildPath(ROUTES.COMPANY_EDIT, { id: company.id }))}
            className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </Button>
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
    },
  });

  const columns = [
    ...(canManage ? [actionsColumn] : []),
    columnHelper.accessor('company_name', {
      header: 'BU Name',
      size: 250,
      // Slides left into the Actions column's slot when that column isn't rendered, so the
      // sticky offsets stay flush instead of leaving a 110px gap.
      meta: { sticky: true, left: canManage ? 110 : 0 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="230px" className="font-medium" />,
    }),
    columnHelper.accessor((row) => row.entity?.entity_name, {
      id: 'entity_name',
      header: 'Entity Name',
      size: 200,
      enableSorting: false,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" />,
    }),
    columnHelper.accessor('company_code', {
      header: 'BU Code',
      size: 150,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="130px" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 120,
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
  ];

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

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="BU Management"
        description={
          entityIdParam
            ? 'BUs under this Entity'
            : canManage
              ? 'Manage BUs across your Entities'
              : 'BUs you are mapped to'
        }
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <div className="flex items-center gap-3">
                <SearchInput
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search BUs…"
                  className="w-[250px]"
                />
                <FilterToggleButton
                  isOpen={filtersOpen}
                  onToggle={() => setFiltersOpen((prev) => !prev)}
                  activeCount={activeFilterCount}
                />
                {canManage && (
                  <Button
                    size="toolbar"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => navigate(entityIdParam ? `${ROUTES.COMPANY_NEW}?entity_id=${entityIdParam}` : ROUTES.COMPANY_NEW)}
                  >
                    <Plus className="h-4 w-4" /> Add BU
                  </Button>
                )}
              </div>
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters move
                into their own row below the header (see the md:hidden block after PageHeader). */}
            {canManage && (
              <Button
                size="toolbar"
                className="md:hidden"
                onClick={() => navigate(entityIdParam ? `${ROUTES.COMPANY_NEW}?entity_id=${entityIdParam}` : ROUTES.COMPANY_NEW)}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — BU count, full-width search, and a compact Filters row. Reuses the exact
          same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? companies.length} business unit{(meta.total ?? companies.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search BUs…"
          className="w-full"
          inputClassName="h-10 bg-white"
        />
        <div className="flex items-center justify-between gap-2">
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={activeFilterCount}
            className="h-10"
          />
        </div>
      </div>

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        {!entityIdParam && (
          <EntityFilter value={entityFilter} onChange={(v) => { setEntityFilter(v ?? ALL); setPage(1); }} />
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
            {[
              { label: 'All', value: ALL },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ].map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setStatusFilter(value); setPage(1); }}
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

      {/* Desktop table — unchanged, including frozen/sticky columns. */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={companies}
        isLoading={isPending}
        toolbar={null}
        pagination={
          meta.total != null
            ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total }
            : undefined
        }
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        onRowClick={canManage ? (row) => navigate(buildPath(ROUTES.COMPANY_EDIT, { id: row.id })) : undefined}
      />

      {/* Mobile — compact card list instead of the frozen-column table, same data/handlers.
          When !canManage the desktop Actions column is fully omitted (read-only BU-scoped
          viewer), so the mobile card mirrors that: no "⋮" trigger, no onClick. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : companies.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search or filters." />
          ) : (
            companies.map((company) => {
              const isActive = company.status === 'active';
              return (
                <div
                  key={company.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                    canManage && 'active:bg-slate-50'
                  )}
                  onClick={canManage ? () => navigate(buildPath(ROUTES.COMPANY_EDIT, { id: company.id })) : undefined}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>{getInitials(company.company_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{company.company_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {company.company_code}
                      {company.entity?.entity_name ? ` · ${company.entity.entity_name}` : ''}
                      {' · '}
                      <span className={isActive ? 'text-green-600' : 'text-slate-400'}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          aria-label="Actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.COMPANY_EDIT, { id: company.id }))}>
                          <Pencil className="h-4 w-4" /> Edit BU
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setStatusTarget({ company, nextStatus: isActive ? 'inactive' : 'active' })}
                        >
                          {isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          {isActive ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })
          )}
        </div>

        {meta.total != null && (() => {
          const mobileLimit = meta.limit ?? limit;
          const mobilePage = meta.page ?? page;
          const totalPages = Math.max(1, Math.ceil(meta.total / mobileLimit));
          return (
            <div className="flex shrink-0 items-center justify-between border-t pt-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Showing {meta.total === 0 ? 0 : ((mobilePage - 1) * mobileLimit) + 1}–{Math.min(mobilePage * mobileLimit, meta.total)} of {meta.total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setPage(mobilePage - 1)}
                  disabled={mobilePage <= 1 || isPending}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {mobilePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setPage(mobilePage + 1)}
                  disabled={mobilePage >= totalPages || isPending}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })()}
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
