import { useEffect, useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Search, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAdmins, useUpdateAdmin, useUpdateAdminStatus } from '@/hooks/useAdmins';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import { getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const columnHelper = createColumnHelper();

const emailSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn("text-sm truncate", className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

const StatusToggle = ({ admin }) => {
  const { mutate, isPending } = useUpdateAdminStatus();
  const isActive = admin.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) => mutate({ id: admin.id, status: checked ? 'active' : 'inactive' })}
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

// Platform Admin's own screen (§6.1) — list/view/edit/status, same pattern as Entity Admin's
// list one tier down.
const AdminList = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotification();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([]);
  const [editTarget, setEditTarget] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const params = {
    page,
    limit,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useAdmins(params);
  const updateMutation = useUpdateAdmin(editTarget?.id);

  const admins = data?.data ?? [];
  const meta = data?.meta ?? {};

  const form = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (editTarget) form.reset({ email: editTarget.email ?? '' });
  }, [editTarget, form]);

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
            title="Edit"
            onClick={() => setEditTarget(row.original)}
            className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      ),
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      size: 280,
      meta: { sticky: true, left: 80 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="250px" className="font-medium" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle admin={info.row.original} />,
    }),
  ];

  const handleSaveEmail = (values) => {
    updateMutation.mutate(values, {
      onSuccess: () => {
        success('Admin updated successfully.');
        setEditTarget(null);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Admins"
        description="Admins across the platform — they manage Entity Admins after logging in"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search Admins…"
                  className="pl-9 w-[250px] h-9 text-sm bg-white"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.ADMIN_NEW)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Admin
              </Button>
            </div>
            {/* Mobile header — only a compact primary action stays up top; search moves into its
                own row below the header (see the md:hidden block after PageHeader). */}
            <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.ADMIN_NEW)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </>
        }
      />

      {/* Mobile toolbar — admin count and a full-width search. Reuses the exact same
          state/handler as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? admins.length} admin{(meta.total ?? admins.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search admins..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full"
          inputClassName="h-10 bg-white"
        />
      </div>

      {/* Desktop table — unchanged, including frozen/sticky columns. */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={admins}
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
          ) : admins.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search." />
          ) : (
            admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{getInitials(admin.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{admin.email}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className={admin.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                      {admin.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Admin actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => setEditTarget(admin)}>
                      <Pencil className="h-4 w-4" /> Edit Admin
                    </DropdownMenuItem>
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

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Admin</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form id="admin-edit-form" onSubmit={form.handleSubmit(handleSaveEmail)}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[11px] text-muted-foreground font-medium">Email</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditTarget(null)} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="admin-edit-form" size="sm" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Outlet />
    </div>
  );
};

export default AdminList;
