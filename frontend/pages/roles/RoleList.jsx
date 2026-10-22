import { useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Layers, Plus, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRoles, useToggleRoleStatus } from '@/hooks/useRoles';
import { useCanWrite, useHasForm } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { buildPath, ROUTES } from '@/constants/routes';
import { FORM_NAMES } from '@/constants/rbacForms';
import { formatDate, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
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

const StatusToggle = ({ role }) => {
  const { mutate, isPending } = useToggleRoleStatus();
  const isActive = role.status === 'active';
  const isSystem = role.is_system;
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending || isSystem}
        onCheckedChange={(checked) =>
          mutate({ id: role.id, status: checked ? 'active' : 'inactive' })
        }
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

const RoleList = () => {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const canWrite = useCanWrite();
  // Managing role<->form mappings is its own grantable Administration capability on the
  // backend, distinct from just having write access to Roles — require both.
  const hasFormMappingAccess = useHasForm(FORM_NAMES.ROLE_FORM_MAPPING);
  const canManageFormMapping = canWrite && hasFormMappingAccess;

  const [sorting, setSorting] = useState([]);

  const params = {
    page,
    limit,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useRoles(params);

  const roles = data?.data ?? [];
  const meta = data?.meta ?? {};

  const activeFilterCount = [statusFilter !== 'all' ? 1 : 0].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setStatusFilter('all');
    setPage(1);
  };

  const columns = [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 160,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => {
        const isSystem = row.original.is_system;
        if (!canWrite && !canManageFormMapping) return null;
        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {canWrite && (
              <Button
                size="sm"
                title={isSystem ? 'System role — cannot be modified' : 'Edit'}
                disabled={isSystem}
                onClick={() => navigate(buildPath(ROUTES.ROLES + '/' + row.original.id + '/edit'))}
                className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-40"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {canManageFormMapping && (
              <Button
                size="sm"
                title="Manage Forms"
                onClick={() => navigate(buildPath(ROUTES.ROLES + '/' + row.original.id + '/forms'))}
                className="h-6 w-6 p-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors"
              >
                <Layers className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('role_name', {
      header: 'Role Name',
      size: 250,
      meta: { sticky: true, left: 160 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="230px" className="font-medium" />,
    }),
    columnHelper.accessor('hierarchy_rank', {
      header: 'Hierarchy Rank',
      size: 120,
      cell: (info) => {
        const val = info.getValue();
        return val != null
          ? <span className="text-sm tabular-nums">{val}</span>
          : <span className="text-sm text-muted-foreground">—</span>;
      },
    }),
    columnHelper.accessor('permission', {
      header: 'Permission',
      size: 140,
      cell: (info) => <span className="text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle role={info.row.original} />,
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
        title="Roles"
        description="Manage user roles and access levels"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <SearchInput
                placeholder="Search roles…"
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
              {canWrite && (
                <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.ROLE_NEW)}>
                  <Plus className="h-4 w-4" /> Add Role
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters move
                into their own row below the header (see the md:hidden block after PageHeader). */}
            {canWrite && (
              <Button size="toolbar" className="md:hidden bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.ROLE_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — role count, full-width search, and the Filters button. Reuses the
          exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? roles.length} role{(meta.total ?? roles.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search roles..."
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
        data={roles}
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
          ) : roles.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search or filters." />
          ) : (
            roles.map((role) => {
              const isSystem = role.is_system;
              const canEdit = canWrite && !isSystem;
              const hasAnyAction = canEdit || canManageFormMapping;
              return (
                <div
                  key={role.id}
                  className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>{getInitials(role.role_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{role.role_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {role.permission}
                      {' · '}
                      <span className={role.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                        {role.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                  </div>
                  {hasAnyAction && (
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
                        {canEdit && (
                          <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.ROLES + '/' + role.id + '/edit'))}>
                            <Pencil className="h-4 w-4" /> Edit Role
                          </DropdownMenuItem>
                        )}
                        {canManageFormMapping && (
                          <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.ROLES + '/' + role.id + '/forms'))}>
                            <Layers className="h-4 w-4" /> Manage Forms
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })
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

export default RoleList;
