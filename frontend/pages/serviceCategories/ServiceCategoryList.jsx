import { useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useServiceCategories, useToggleServiceCategoryStatus } from '@/hooks/useServiceCategories';
import { useCanWrite } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatDate, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
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

const StatusToggle = ({ category }) => {
  const { mutate, isPending } = useToggleServiceCategoryStatus();
  const isActive = category.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          mutate({ id: category.id, status: checked ? 'active' : 'inactive' })
        }
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

const ServiceCategoryList = () => {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const canManage = useCanWrite();

  const [sorting, setSorting] = useState([]);

  // Business Unit filter. Renders only for a login mapped to more than one BU, and starts on
  // "All Business Units" — the list opens cross-BU and narrowing to one is an explicit choice.
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter();

  const params = {
    page,
    limit,
    ...buParams,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useServiceCategories(params);

  const rows = Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};

  const total = meta.total ?? rows.length;
  const paginatedRows = rows.slice((page - 1) * limit, page * limit);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  const columns = [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 96,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) =>
        canManage ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              title="Edit"
              onClick={() => navigate(buildPath(ROUTES.SERVICE_CATEGORY_EDIT, { id: row.original.id }))}
              className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        ) : null,
    }),
    columnHelper.accessor('name', {
      header: 'Category Name',
      size: 220,
      meta: { sticky: true, left: 96 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" className="font-medium" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle category={info.row.original} />,
    }),
    columnHelper.accessor('created_at', {
      header: 'Created',
      size: 140,
      cell: (info) => (
        <span className="text-xs text-muted-foreground">{formatDate(info.getValue())}</span>
      ),
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Service Categories"
        description="Manage service category master data"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <SearchInput
                placeholder="Search categories…"
                className="w-[250px]"
                inputClassName="bg-white"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {canManage && (
                <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.SERVICE_CATEGORY_NEW)}>
                  <Plus className="h-4 w-4" /> Add Category
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters move
                into their own row below the header (see the md:hidden block after PageHeader). */}
            {canManage && (
              <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.SERVICE_CATEGORY_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — category count, full-width search, and a compact Filters row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {total} service categor{total === 1 ? 'y' : 'ies'}
        </p>
        <SearchInput
          placeholder="Search categories…"
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
        {showEntityFilter && (
          <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} />
        )}
        {showBuFilter && (
          <BusinessUnitFilter value={buId} entityId={entityId} onChange={(v) => { setBuId(v); setPage(1); }} />
        )}
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

      {/* Desktop table — unchanged, including the client-side re-slice of the already
          server-paginated `rows` (see the `paginatedRows` computation above). */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={paginatedRows}
        isLoading={isPending}
        toolbar={null}
        pagination={{
          page: meta.current_page ?? page,
          limit: meta.per_page ?? limit,
          total: total
        }}
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      {/* Mobile — compact card list instead of the frozen-column table. Maps over the SAME
          `paginatedRows` the desktop DataTable renders (already re-sliced above) so mobile and
          desktop stay bug-for-bug consistent — not attempting to fix the underlying
          double-pagination quirk here, that's out of scope. */}
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
          ) : paginatedRows.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search or filters." />
          ) : (
            paginatedRows.map((cat) => (
              <div
                key={cat.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                  canManage && 'active:bg-slate-50'
                )}
                onClick={canManage ? () => navigate(buildPath(ROUTES.SERVICE_CATEGORY_EDIT, { id: cat.id })) : undefined}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{getInitials(cat.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{cat.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className={cat.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                      {cat.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    {cat.created_at ? ` · ${formatDate(cat.created_at)}` : ''}
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
                      <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.SERVICE_CATEGORY_EDIT, { id: cat.id }))}>
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))
          )}
        </div>

        {(() => {
          const mobileLimit = meta.per_page ?? limit;
          const mobilePage = meta.current_page ?? page;
          const totalPages = Math.max(1, Math.ceil(total / mobileLimit));
          return (
            <div className="flex shrink-0 items-center justify-between border-t pt-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Showing {total === 0 ? 0 : ((mobilePage - 1) * mobileLimit) + 1}–{Math.min(mobilePage * mobileLimit, total)} of {total}
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

export default ServiceCategoryList;
