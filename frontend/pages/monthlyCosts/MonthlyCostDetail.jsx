import { useState } from 'react';
import { useNavigate, useParams, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Trash2, ArrowLeft, Plus, Search } from 'lucide-react';
import { useMonthlyCosts, useDeleteMonthlyCost, useDeleteMonthlyCosts } from '@/hooks/useMonthlyCosts';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatCurrency, formatMonthYear } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

const columnHelper = createColumnHelper();

const MonthlyCostDetail = () => {
  const navigate = useNavigate();
  const { month, year } = useParams();
  const { success, error: showError } = useNotification();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [sorting, setSorting] = useState([]);

  const debouncedSearch = useDebounce(search, 400);
  const canManage = useCanWrite();

  const params = {
    page,
    limit,
    month,
    year,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useMonthlyCosts(params);
  const deleteMutation = useDeleteMonthlyCost();
  const bulkDeleteMutation = useDeleteMonthlyCosts();

  const records = data?.data ?? [];
  const meta = data?.meta ?? {};

  const allSelected = records.length > 0 && records.every((r) => selectedIds.includes(r.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : records.map((r) => r.id));
  const toggleSelect = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const clearSelection = () => setSelectedIds([]);

  const handleDelete = () => {
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        success('Monthly cost record deleted.');
        setDeleteTarget(null);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setDeleteTarget(null);
      },
    });
  };

  const handleBulkDelete = () => {
    const count = selectedIds.length;
    bulkDeleteMutation.mutate(selectedIds, {
      onSuccess: () => {
        success(`${count} monthly cost record${count !== 1 ? 's' : ''} deleted.`);
        clearSelection();
        setIsBulkDeleteOpen(false);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const columns = [
    columnHelper.display({
      id: 'select',
      header: () =>
        canManage ? (
          <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
        ) : null,
      size: 36,
      cell: ({ row }) =>
        canManage ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedIds.includes(row.original.id)}
              onCheckedChange={() => toggleSelect(row.original.id)}
              aria-label="Select row"
            />
          </div>
        ) : null,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 96,
      cell: ({ row }) =>
        canManage ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              title="Edit"
              onClick={() => navigate(buildPath(ROUTES.MONTHLY_COST_EDIT, { month, year, id: row.original.id }))}
              className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              className="h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              title="Delete"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ) : null,
    }),
    columnHelper.accessor((row) => row.employee_name ?? row.employee?.full_name, {
      id: 'employee',
      header: 'Employee',
      size: 240,
      cell: (info) => (
        <div>
          <p className="font-medium text-sm truncate">{info.getValue() ?? '—'}</p>
          {(info.row.original.employee_code ?? info.row.original.employee?.employee_code) && (
            <p className="text-xs text-muted-foreground font-mono truncate">
              {info.row.original.employee_code ?? info.row.original.employee?.employee_code}
            </p>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('salary_cost', {
      header: 'Salary Cost',
      size: 150,
      cell: (info) => <span className="tabular-nums text-sm">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('ops_cost', {
      header: 'Ops Cost',
      size: 130,
      cell: (info) => <span className="tabular-nums text-sm">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('total_cost', {
      header: 'Total Cost',
      size: 140,
      cell: (info) => (
        <span className="tabular-nums font-semibold text-sm">{formatCurrency(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor('billable_cost', {
      header: 'Billable Cost',
      size: 140,
      cell: (info) =>
        info.getValue() != null ? (
          <span className="tabular-nums text-sm">{formatCurrency(info.getValue())}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
  ];

  // Mobile card — the checkbox + actions (Edit/Delete) columns above don't translate into the
  // generic label/value card DataTable's `mobileCards` mode builds from arbitrary columns, so
  // this page supplies its own. Same fields as the desktop table, same Edit/Delete handlers.
  const renderMobileCard = (row) => {
    const selected = selectedIds.includes(row.id);
    const employeeName = row.employee_name ?? row.employee?.full_name ?? '—';
    const employeeCode = row.employee_code ?? row.employee?.employee_code;
    return (
      <div className={cn(
        'rounded-lg border bg-white p-3.5',
        selected && 'border-primary/60 bg-primary/5'
      )}>
        <div className="flex items-start gap-3">
          {canManage && (
            <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
              <Checkbox checked={selected} onCheckedChange={() => toggleSelect(row.id)} aria-label="Select row" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{employeeName}</p>
            {employeeCode && <p className="truncate text-xs font-mono text-muted-foreground">{employeeCode}</p>}
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(row.total_cost)}</p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Salary Cost</p>
            <p className="font-medium tabular-nums">{formatCurrency(row.salary_cost)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ops Cost</p>
            <p className="font-medium tabular-nums">{formatCurrency(row.ops_cost)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Billable Cost</p>
            <p className="font-medium tabular-nums">{row.billable_cost != null ? formatCurrency(row.billable_cost) : '—'}</p>
          </div>
        </div>
        {canManage && (
          <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex-1"
              onClick={() => navigate(buildPath(ROUTES.MONTHLY_COST_EDIT, { month, year, id: row.id }))}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex-1 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Monthly Costs"
        description={formatMonthYear(Number(month), Number(year))}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Button size="sm" onClick={() => navigate(buildPath(ROUTES.MONTHLY_COST_NEW, { month, year }))}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Record
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.MONTHLY_COSTS)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => setIsBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={records}
        isLoading={isPending}
        mobileCards
        mobileCardRenderer={renderMobileCard}
        toolbar={
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by employee..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelection(); }}
            />
          </div>
        }
        pagination={
          meta.total != null
            ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total }
            : undefined
        }
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={(p) => { setPage(p); clearSelection(); }}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); clearSelection(); }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete monthly cost record?"
        description="This record will be permanently deleted and cannot be recovered."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title={`Delete ${selectedIds.length} monthly cost record${selectedIds.length !== 1 ? 's' : ''}?`}
        description="These records will be permanently deleted and cannot be recovered."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isLoading={bulkDeleteMutation.isPending}
      />

      <Outlet />
    </div>
  );
};

export default MonthlyCostDetail;
