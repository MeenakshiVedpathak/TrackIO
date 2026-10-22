import { useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Building2, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEntities, useToggleEntityStatus } from '@/hooks/useEntities';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatDate, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn("text-sm truncate", className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

const StatusToggle = ({ entity }) => {
  const { mutate, isPending } = useToggleEntityStatus();
  const isActive = entity.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          mutate({ id: entity.id, status: checked ? 'active' : 'inactive' })
        }
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

const EntityList = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  // Entity Admin can manage Entity Master the same as Admin (reverts the earlier "ownership
  // flip (§1)" that made Entity Admin read-only here).
  const canManageEntities = hasRole('Admin') || hasRole('Entity Admin');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  const [sorting, setSorting] = useState([]);

  const params = {
    page,
    limit,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useEntities(params);

  const entities = data?.data ?? [];
  const meta = data?.meta ?? {};

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const clearFilters = () => {
    setStatusFilter('all');
    setPage(1);
  };

  const columns = [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 150,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            title="Manage BUs"
            onClick={() => navigate(`${ROUTES.COMPANIES}?entity_id=${row.original.id}`)}
            className="h-6 w-6 p-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
          >
            <Building2 className="h-3 w-3" />
          </Button>
          {canManageEntities && (
            <>
              <Button
                size="sm"
                title="Edit"
                onClick={() => navigate(buildPath(ROUTES.ENTITY_EDIT, { id: row.original.id }))}
                className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('entity_name', {
      header: 'Entity Name',
      size: 250,
      meta: { sticky: true, left: 150 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="230px" className="font-medium" />,
    }),
    columnHelper.accessor('entity_code', {
      header: 'Entity Code',
      size: 190,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="170px" />,
    }),
    // Entity Admin column hidden for now — kept here intentionally, uncomment to restore.
    // columnHelper.display({
    //   id: 'entity_admin',
    //   header: 'Entity Admin',
    //   size: 220,
    //   cell: ({ row }) => (
    //     <TruncatedCell
    //       value={row.original.entity_admin_email ?? row.original.entity_admin?.email ?? row.original.entityAdmin?.email}
    //       maxWidth="200px"
    //     />
    //   ),
    // }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle entity={info.row.original} />,
    }),
    columnHelper.accessor('created_at', {
      header: 'Created Date',
      size: 140,
      cell: (info) => formatDate(info.getValue()),
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title={canManageEntities ? 'Entity Management' : 'My Entity'}
        description={canManageEntities ? undefined : 'Read-only view of the Entities assigned to you'}
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <SearchInput
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search entities…"
                className="w-[250px]"
              />
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {canManageEntities && (
                <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.ENTITY_NEW)}>
                  <Plus className="h-4 w-4" /> Add Entity
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters move
                into their own row below the header (see the md:hidden block after PageHeader). */}
            {canManageEntities && (
              <Button size="toolbar" className="md:hidden bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.ENTITY_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — entity count, full-width search, and the Filters button. Reuses the
          exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? entities.length} entit{(meta.total ?? entities.length) === 1 ? 'y' : 'ies'}
        </p>
        <SearchInput
          placeholder="Search entities..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
            {[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ].map(({ label, value }) => (
              <button
                key={value}
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
        data={entities}
        isLoading={isPending}
        toolbar={null}
        pagination={
          meta.total != null
            ? {
                page: meta.page ?? page,
                limit: meta.limit ?? limit,
                total: meta.total,
              }
            : undefined
        }
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        onRowClick={canManageEntities ? (row) => navigate(buildPath(ROUTES.ENTITY_EDIT, { id: row.id })) : undefined}
        emptyState={
          // A freshly-created Admin/Entity Admin legitimately has zero Entities yet — this is
          // not an error state (§1 gotcha).
          !search && statusFilter === 'all' ? (
            <EmptyState
              title={canManageEntities ? 'No Entities yet' : 'No Entities assigned to you yet'}
              description={
                canManageEntities
                  ? 'Create one to get started.'
                  : 'Once an Admin assigns an Entity to you, it will show up here.'
              }
              action={canManageEntities ? { label: 'Add Entity', icon: Plus, onClick: () => navigate(ROUTES.ENTITY_NEW) } : undefined}
            />
          ) : undefined
        }
      />

      {/* Mobile — compact card list instead of the frozen-column table, same data/handlers. */}
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
          ) : entities.length === 0 ? (
            !search && statusFilter === 'all' ? (
              <EmptyState
                title={canManageEntities ? 'No Entities yet' : 'No Entities assigned to you yet'}
                description={
                  canManageEntities
                    ? 'Create one to get started.'
                    : 'Once an Admin assigns an Entity to you, it will show up here.'
                }
                action={canManageEntities ? { label: 'Add Entity', icon: Plus, onClick: () => navigate(ROUTES.ENTITY_NEW) } : undefined}
              />
            ) : (
              <EmptyState title="No records found" description="Try adjusting your search or filters." />
            )
          ) : (
            entities.map((entity) => (
              <div
                key={entity.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                  canManageEntities && 'active:bg-slate-50'
                )}
                onClick={canManageEntities ? () => navigate(buildPath(ROUTES.ENTITY_EDIT, { id: entity.id })) : undefined}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{getInitials(entity.entity_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{entity.entity_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {entity.entity_code}
                    {' · '}
                    <span className={entity.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                      {entity.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </p>
                </div>
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
                    <DropdownMenuItem onClick={() => navigate(`${ROUTES.COMPANIES}?entity_id=${entity.id}`)}>
                      <Building2 className="h-4 w-4" /> Manage BUs
                    </DropdownMenuItem>
                    {canManageEntities && (
                      <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.ENTITY_EDIT, { id: entity.id }))}>
                        <Pencil className="h-4 w-4" /> Edit Entity
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
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

      <Outlet />
    </div>
  );
};

export default EntityList;
