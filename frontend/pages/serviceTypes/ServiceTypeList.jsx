import { useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import * as XLSX from 'xlsx';
import { Plus, Pencil, Search, Download, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useCanWrite } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatDate, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
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

const exportToExcel = (rows, categoryMap) => {
  const header = ['Service Type Name', 'Service Category', 'Created'];
  const dataRows = rows.map((r) => [
    r.service_type_name ?? '',
    categoryMap[r.service_category_id] ?? '',
    r.created_at ? formatDate(r.created_at) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service Types');
  XLSX.writeFile(wb, 'Service_Types.xlsx');
};

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn("text-sm truncate", className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

const ServiceTypeList = () => {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const canManage = useCanWrite();

  const { data: serviceCategories = [] } = useActiveServiceCategories();
  const categoryMap = Object.fromEntries(serviceCategories.map((c) => [c.id, c.name]));

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
    ...(categoryFilter !== 'all' && { service_category_id: categoryFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useServiceTypes(params);

  const rows = Array.isArray(data?.data) ? data.data : [];
  const meta = data?.meta ?? {};

  const total = meta.total ?? rows.length;
  const paginatedRows = rows.slice((page - 1) * limit, page * limit);

  const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setCategoryFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  const handleExport = () => exportToExcel(rows, categoryMap);

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
              onClick={() => navigate(buildPath(ROUTES.SERVICE_TYPE_EDIT, { id: row.original.id }))}
              className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        ) : null,
    }),
    columnHelper.accessor('service_type_name', {
      header: 'Service Type Name',
      size: 220,
      meta: { sticky: true, left: 96 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" className="font-medium" />,
    }),
    columnHelper.accessor('service_category_id', {
      header: 'Service Category',
      size: 220,
      cell: (info) =>
        categoryMap[info.getValue()] ? (
          <TruncatedCell value={categoryMap[info.getValue()]} maxWidth="200px" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
        title="Service Types"
        description="Manage service type master data"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search service types…"
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
              {rows.length > 0 && (
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExport}>
                  <Download className="h-4 w-4" /> Export Excel
                </Button>
              )}
              {canManage && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.SERVICE_TYPE_NEW)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add Service Type
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters/export
                move into their own row below the header (see the md:hidden block after PageHeader). */}
            {canManage && (
              <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.SERVICE_TYPE_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — service type count, full-width search, and a compact Filters + More row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {total} service type{total === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search service types…"
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
          {rows.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="toolbar" className="h-10 bg-white">
                  <MoreVertical className="h-4 w-4" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport} className="cursor-pointer">
                  <Download className="h-4 w-4" /> Export Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
          <Label className="text-xs">Service Category</Label>
          <SearchableSelect
            options={[
              { label: "All Categories", value: "all" },
              ...serviceCategories.map((cat) => ({
                label: cat.name,
                value: String(cat.id)
              }))
            ]}
            value={categoryFilter}
            onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}
            placeholder="All Categories"
            searchPlaceholder="Search category..."
            className="h-9 w-full text-sm bg-white"
          />
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
            paginatedRows.map((st) => (
              <div
                key={st.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                  canManage && 'active:bg-slate-50'
                )}
                onClick={canManage ? () => navigate(buildPath(ROUTES.SERVICE_TYPE_EDIT, { id: st.id })) : undefined}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{getInitials(st.service_type_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{st.service_type_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {categoryMap[st.service_category_id] ?? '—'}
                    {st.created_at ? ` · ${formatDate(st.created_at)}` : ''}
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
                      <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.SERVICE_TYPE_EDIT, { id: st.id }))}>
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

export default ServiceTypeList;
