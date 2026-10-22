import { useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Search, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSubProjects, useToggleSubProjectStatus } from '@/hooks/useSubProjects';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useCanWrite } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { buildPath, ROUTES } from '@/constants/routes';
import { getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
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

const StatusToggle = ({ subProject }) => {
  const { mutate, isPending } = useToggleSubProjectStatus();
  const isActive = subProject.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          mutate({ id: subProject.id, status: checked ? 'active' : 'inactive' })
        }
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

const SubProjectList = () => {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [poFilter, setPoFilter] = useState('all');
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
    ...(poFilter !== 'all' && { service_po_id: poFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useSubProjects(params);
  const { data: activePOs = [] } = useActiveServicePOs();

  const subProjects = data?.data ?? [];
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    poFilter !== 'all' ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
    isEntityFiltered ? 1 : 0,
    isBuFiltered ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setPoFilter('all');
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
      cell: ({ row }) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            title="Edit"
            onClick={() => navigate(buildPath(ROUTES.SUB_PROJECT_EDIT, { id: row.original.id }))}
            className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      ),
    }),
    columnHelper.accessor('sub_project_name', {
      header: 'Name',
      size: 200,
      meta: { sticky: true, left: 96 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" className="font-medium" />,
    }),
    columnHelper.accessor('servicePO.service_po_name', {
      header: 'Service PO',
      size: 200,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" />,
    }),
    columnHelper.accessor('description', {
      header: 'Description',
      size: 200,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" className="text-muted-foreground" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle subProject={info.row.original} />,
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Sub-Projects"
        description="Manage sub-projects linked to Service POs"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sub-projects…"
                  className="pl-9 w-[250px] h-9 text-sm bg-white"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {canManage && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.SUB_PROJECT_NEW)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add Sub-Project
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters move
                into their own row below the header (see the md:hidden block after PageHeader). */}
            {canManage && (
              <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.SUB_PROJECT_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — sub-project count, full-width search, and a compact Filters row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? subProjects.length} sub-project{(meta.total ?? subProjects.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search sub-projects…"
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
          <Label className="text-xs">Service PO</Label>
          <SearchableSelect
            options={[
              { label: "All POs", value: "all" },
              ...activePOs.map((po) => ({
                label: po.po_number ?? po.service_po_name ?? String(po.id),
                value: String(po.id)
              }))
            ]}
            value={poFilter}
            onValueChange={(v) => { setPoFilter(v); setPage(1); }}
            placeholder="All POs"
            searchPlaceholder="Search PO..."
            className="h-9 w-full text-sm bg-white"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <SearchableSelect
            showSearch={false}
            options={[
              { label: "All statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
            placeholder="All statuses"
            className="h-9 w-full text-sm bg-white"
          />
        </div>
      </FilterPanel>

      {/* Desktop table — unchanged. */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={subProjects}
        isLoading={isPending}
        toolbar={null}
        pagination={
          meta.total != null
            ? {
                page: meta.current_page ?? page,
                limit: meta.per_page ?? limit,
                total: meta.total,
              }
            : undefined
        }
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        onRowClick={(row) => navigate(buildPath(ROUTES.SUB_PROJECT_EDIT, { id: row.id }))}
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
          ) : subProjects.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search or filters." />
          ) : (
            subProjects.map((sp) => (
              <div
                key={sp.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                  canManage && 'active:bg-slate-50'
                )}
                onClick={canManage ? () => navigate(buildPath(ROUTES.SUB_PROJECT_EDIT, { id: sp.id })) : undefined}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{getInitials(sp.sub_project_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{sp.sub_project_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {sp.servicePO?.service_po_name ?? '—'}
                    {' · '}
                    <span className={sp.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                      {sp.status === 'active' ? 'Active' : 'Inactive'}
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
                      <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.SUB_PROJECT_EDIT, { id: sp.id }))}>
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))
          )}
        </div>

        {meta.total != null && (() => {
          const mobileLimit = meta.per_page ?? limit;
          const mobilePage = meta.current_page ?? page;
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

export default SubProjectList;
