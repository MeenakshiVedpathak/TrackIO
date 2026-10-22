import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Link2, Search, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBuHeads, useUpdateBuHeadStatus, useBuHeadMappedCompanies } from '@/hooks/useBuHeads';
import { useDebounce } from '@/hooks/useDebounce';
import { getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';
import BuHeadForm from './BuHeadForm';
import MapBuModal from './MapBuModal';

const columnHelper = createColumnHelper();

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn('text-sm truncate', className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

// GET /bu-heads returns no mapped-BU count of its own (confirmed 2026-08-20) — fetched per row
// instead. Acceptable trade-off: BU Head accounts are a small senior-tier list (unlike
// Employees), and each query is cheap/cached via React Query.
const MappedBuCount = ({ buHeadId }) => {
  const { data, isLoading } = useBuHeadMappedCompanies(buHeadId);
  if (isLoading) return <span className="text-xs text-muted-foreground">…</span>;
  const count = data?.data?.length ?? 0;
  return <Badge variant={count > 0 ? 'info' : 'muted'}>{count}</Badge>;
};

const StatusToggle = ({ buHead }) => {
  const { mutate, isPending } = useUpdateBuHeadStatus();
  const isActive = buHead.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) => mutate({ id: buHead.id, status: checked ? 'active' : 'inactive' })}
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

// BU Head Master (§2-§7 of the BU Head spec) — additive peer of BU Admin Master, same list/
// create/status shell as BuAdminList.jsx/EntityAdminList.jsx. "Add BU Head" opens a Sheet
// (BuHeadForm), "Map" opens a Dialog (MapBuModal) — both same-screen, no extra routes (§24).
const BuHeadList = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const params = {
    page,
    limit,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useBuHeads(params);

  const buHeads = data?.data ?? [];
  const meta = data?.meta ?? {};

  const columns = [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 80,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            title="Map BU"
            onClick={() => setMapTarget(row.original)}
            className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            <Link2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    }),
    columnHelper.accessor('employee_code', {
      header: 'Employee ID',
      size: 130,
      meta: { sticky: true, left: 80 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="120px" className="font-medium" />,
    }),
    columnHelper.accessor('full_name', {
      header: 'Name',
      size: 200,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" />,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" />,
    }),
    columnHelper.display({
      id: 'mapped_bu_count',
      header: 'Mapped BUs',
      size: 120,
      cell: ({ row }) => <MappedBuCount buHeadId={row.original.id} />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle buHead={info.row.original} />,
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="BU Head Master"
        description="BU Heads mapped across multiple BUs"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search BU heads…"
                    className="pl-9 w-[250px] h-9 text-sm bg-white"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setIsAddOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add BU Head
                </Button>
              </div>
            </div>
            {/* Mobile header — only a compact primary action stays up top; search moves into its
                own row below the header (see the md:hidden block after PageHeader). */}
            <Button size="toolbar" className="md:hidden" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </>
        }
      />

      {/* Mobile toolbar — BU head count and full-width search. Reuses the exact same state as the
          desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? buHeads.length} BU head{(meta.total ?? buHeads.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search BU heads…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full"
          inputClassName="h-10 bg-white"
        />
      </div>

      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={buHeads}
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
        emptyState={
          !search ? (
            <EmptyState
              title="No BU Heads yet"
              description="Add a BU Head and map them to one or more BUs to get started."
              action={{ label: 'Add BU Head', icon: Plus, onClick: () => setIsAddOpen(true) }}
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
          ) : buHeads.length === 0 ? (
            !search ? (
              <EmptyState
                title="No BU Heads yet"
                description="Add a BU Head and map them to one or more BUs to get started."
                action={{ label: 'Add BU Head', icon: Plus, onClick: () => setIsAddOpen(true) }}
              />
            ) : (
              <EmptyState title="No records found" description="Try adjusting your search." />
            )
          ) : (
            buHeads.map((buHead) => {
              const isActive = buHead.status === 'active';
              return (
                <div key={buHead.id} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>{getInitials(buHead.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{buHead.full_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {buHead.employee_code}
                      {' · '}
                      <span className={isActive ? 'text-green-600' : 'text-slate-400'}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                    <div className="mt-1">
                      <MappedBuCount buHeadId={buHead.id} />
                    </div>
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
                      <DropdownMenuItem onClick={() => setMapTarget(buHead)}>
                        <Link2 className="h-4 w-4" /> Map BU
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      <BuHeadForm open={isAddOpen} onOpenChange={setIsAddOpen} />
      <MapBuModal buHead={mapTarget} open={!!mapTarget} onOpenChange={(open) => !open && setMapTarget(null)} />
    </div>
  );
};

export default BuHeadList;
