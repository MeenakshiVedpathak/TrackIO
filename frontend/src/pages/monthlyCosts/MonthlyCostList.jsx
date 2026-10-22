import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Trash2, Calculator, Download, Upload, Search, Eye, ChevronRight } from 'lucide-react';
import { useMonthlyCostSummary } from '@/hooks/useReports';
import { useDeleteMonthlyCostPeriods, useCalculateMonthlyCosts } from '@/hooks/useMonthlyCosts';
import { useAuth } from '@/hooks/useAuth';
import { useCompanies } from '@/hooks/useCompanies';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatCurrency, formatMonthYear } from '@/utils/formatters';
import { downloadMonthlyCostSample, downloadMonthlyCostPeriod } from '@/utils/monthlyCostSample';
import { cn } from '@/utils/cn';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

const columnHelper = createColumnHelper();

const periodKey = (row) => `${row.month}-${row.year}`;

// Maps DataTable column ids to the sortBy keys the monthly-cost-summary report accepts.
const sortByMap = {
  month_year: 'month_year',
  employee_count: 'employee_count',
  total_salary_cost: 'total_salary_cost',
  total_ops_cost: 'total_ops_cost',
  total_cost: 'total_cost',
};

const MonthlyCostList = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotification();
  const { businessUnits } = useAuth();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [monthYearFilter, setMonthYearFilter] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Mobile only — the search box that drives this is `md:hidden` (desktop has no search input
  // here at all, unchanged), so `search` can never be set from a desktop viewport and this is a
  // no-op there. Client-side over the current page's already-fetched `records`, same simplified
  // scope as several Reports pages' own search — periods are few enough per page that this is
  // rarely a real limitation.
  const [search, setSearch] = useState('');
  // Mobile only — the row-actions bottom sheet (View Details / Download / Delete) a card's tap
  // opens; its options reuse the exact same navigation/download/delete paths the desktop's own
  // row-click and action-column icons already use.
  const [actionsTarget, setActionsTarget] = useState(null);
  const [downloadingPeriod, setDownloadingPeriod] = useState(false);

  const [uploadBuOpen, setUploadBuOpen] = useState(false);
  const [uploadEntityId, setUploadEntityId] = useState('all');
  const [uploadBuId, setUploadBuId] = useState('');

  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMonthYear, setCalcMonthYear] = useState(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { month: prevMonth.getMonth() + 1, year: prevMonth.getFullYear() };
  });
  const [sorting, setSorting] = useState([]);

  const canManage = useCanWrite();

  // The Upload dialog's BU picker used to map raw useAuth().businessUnits straight in — no active
  // filter (an employee's mapping survives its BU being deactivated) and no entity info (that
  // mapping endpoint doesn't carry it), so the dialog could offer a deactivated BU and had no way
  // to group choices by Entity. The company master (already status-filtered server-side) is looked
  // up here and intersected in, same pattern as SyncWorkLogsDialog/TimesheetList's Upload dialog.
  const { data: companiesForEntityLookup } = useCompanies(
    { status: 'active', limit: 200 },
    { staleTime: 1000 * 60 * 10 }
  );
  const activeCompanyIds = useMemo(
    () => new Set((companiesForEntityLookup?.data ?? []).map((c) => String(c.id))),
    [companiesForEntityLookup]
  );
  const entityByBuId = useMemo(() => {
    const map = new Map();
    (companiesForEntityLookup?.data ?? []).forEach((c) => {
      const id = c.entity_id ?? c.entity?.id;
      const name = c.entity?.entity_name;
      if (id != null) map.set(String(c.id), { id, name });
    });
    return map;
  }, [companiesForEntityLookup]);
  const activeBusinessUnits = useMemo(() => {
    const active = activeCompanyIds.size === 0
      ? businessUnits
      : businessUnits.filter((bu) => activeCompanyIds.has(String(bu.id)));
    return active.map((bu) => {
      const looked = entityByBuId.get(String(bu.id));
      return {
        ...bu,
        entity_id: bu.entity_id ?? bu.entityId ?? looked?.id ?? null,
        entity_name: bu.entity_name ?? bu.entityName ?? looked?.name ?? null,
      };
    });
  }, [businessUnits, activeCompanyIds, entityByBuId]);

  // Distinct Entities across this login's own active mapped BUs — the Upload dialog's Entity step.
  const uploadBuEntityOptions = useMemo(() => {
    const byId = new Map();
    activeBusinessUnits.forEach((bu) => {
      const id = bu.entity_id;
      const name = bu.entity_name;
      if (id != null && name && !byId.has(id)) byId.set(id, { id, name });
    });
    return Array.from(byId.values());
  }, [activeBusinessUnits]);

  const uploadBuOptionsForEntity = (id) =>
    id && id !== 'all'
      ? activeBusinessUnits.filter((bu) => String(bu.entity_id) === String(id))
      : activeBusinessUnits;

  // Multi-select is live for this screen's report query only (GET /reports/monthly-cost-summary
  // — see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md). The period-delete mutation below still hits
  // an endpoint with no confirmed multi-BU support, so it deliberately keeps its own
  // single-BU-or-unscoped resolution (see `deleteBuId`) rather than trusting `buParams.buId`,
  // which this hook's multi mode always pins to the 'all' sentinel.
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter({ multiple: true });
  // Only meaningful when exactly one BU is selected — matches what the single-select delete path
  // used to send (`buParams.buId` was that one id). 0 or 2+ selected falls back to 'all', the same
  // "no BU narrowing" the delete already did whenever nothing was filtered before this change.
  const deleteBuId = buId.length === 1 ? buId[0] : 'all';

  const params = {
    page,
    limit,
    ...buParams,
    ...(monthYearFilter && { month: monthYearFilter.month, year: monthYearFilter.year }),
    ...(sorting[0] && { sortBy: sortByMap[sorting[0].id] ?? sorting[0].id, sortOrder: sorting[0].desc ? 'DESC' : 'ASC' }),
  };

  const { data, isPending } = useMonthlyCostSummary(params);
  const deletePeriodsMutation = useDeleteMonthlyCostPeriods();
  const calculateMutation = useCalculateMonthlyCosts();

  const records = Array.isArray(data?.data?.records) ? data.data.records : [];
  const meta = data?.meta ?? {};

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => formatMonthYear(r.month, r.year).toLowerCase().includes(q));
  }, [records, search]);

  const handleDownloadPeriod = async () => {
    if (!actionsTarget) return;
    setDownloadingPeriod(true);
    try {
      await downloadMonthlyCostPeriod(actionsTarget.month, actionsTarget.year);
    } catch (err) {
      showError(extractApiError(err) || 'Could not download this period.');
    } finally {
      setDownloadingPeriod(false);
      setActionsTarget(null);
    }
  };

  const allSelected = records.length > 0 && records.every((r) => selectedKeys.includes(periodKey(r)));
  const toggleSelectAll = () => setSelectedKeys(allSelected ? [] : records.map(periodKey));
  const toggleSelect = (key) =>
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  const clearSelection = () => setSelectedKeys([]);

  const activeFilterCount = (monthYearFilter ? 1 : 0) + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setMonthYearFilter(null);
    resetEntityId();
    resetBuId();
    setPage(1);
    clearSelection();
  };

  // Narrowing the BU changes which periods (and which rows inside them) are on screen, so a
  // selection made against the previous scope must not survive into a bulk delete.
  const handleEntityChange = (v) => {
    setEntityId(v);
    setPage(1);
    clearSelection();
  };

  const handleBuChange = (v) => {
    setBuId(v);
    setPage(1);
    clearSelection();
  };

  const handleCalculate = () => {
    calculateMutation.mutate(
      { month: calcMonthYear.month, year: calcMonthYear.year },
      {
        onSuccess: () => {
          success(`Monthly costs calculated for ${formatMonthYear(calcMonthYear.month, calcMonthYear.year)}.`);
          setCalcOpen(false);
        },
        onError: (err) => showError(extractApiError(err)),
      }
    );
  };

  const handleDelete = () => {
    deletePeriodsMutation.mutate({ periods: [{ month: deleteTarget.month, year: deleteTarget.year }], buId: deleteBuId }, {
      onSuccess: () => {
        success(`${formatMonthYear(deleteTarget.month, deleteTarget.year)} records deleted.`);
        setDeleteTarget(null);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setDeleteTarget(null);
      },
    });
  };

  const handleBulkDelete = () => {
    const periods = records
      .filter((r) => selectedKeys.includes(periodKey(r)))
      .map((r) => ({ month: r.month, year: r.year }));
    const count = periods.length;
    deletePeriodsMutation.mutate({ periods, buId: deleteBuId }, {
      onSuccess: () => {
        success(`${count} period${count !== 1 ? 's' : ''} deleted.`);
        clearSelection();
        setIsBulkDeleteOpen(false);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  // Both the row-select checkbox column and the Delete-only actions column are dropped outright
  // for a read-only role — they previously rendered as headers over empty cells.
  const columns = [
    ...(canManage ? [columnHelper.display({
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
              checked={selectedKeys.includes(periodKey(row.original))}
              onCheckedChange={() => toggleSelect(periodKey(row.original))}
              aria-label="Select period"
            />
          </div>
        ) : null,
    })] : []),
    ...(canManage ? [columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 90,
      cell: ({ row }) =>
        canManage ? (
          <div onClick={(e) => e.stopPropagation()}>
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
    })] : []),
    columnHelper.accessor((row) => formatMonthYear(row.month, row.year), {
      id: 'month_year',
      header: 'Period',
      size: 140,
      cell: (info) => <span className="font-medium text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor('employee_count', {
      header: 'Employees',
      size: 110,
      cell: (info) => (
        <span className="tabular-nums text-sm font-medium text-blue-600">{info.getValue() ?? '—'}</span>
      ),
    }),
    columnHelper.accessor('total_salary_cost', {
      header: 'Salary Cost',
      size: 140,
      cell: (info) => <span className="tabular-nums text-sm">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('total_ops_cost', {
      header: 'Ops Cost',
      size: 130,
      cell: (info) => <span className="tabular-nums text-sm">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('total_billable_cost', {
      header: 'Billable Cost',
      size: 140,
      enableSorting: false,
      cell: (info) => <span className="tabular-nums text-sm">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('total_cost', {
      header: 'Total Cost',
      size: 140,
      cell: (info) => (
        <span className="tabular-nums font-semibold text-sm">{formatCurrency(info.getValue())}</span>
      ),
    }),
  ];

  // Mobile card — the checkbox + actions columns above don't translate into the generic
  // label/value card DataTable's `mobileCards` mode builds from arbitrary columns, so this page
  // supplies its own via `mobileCardRenderer`. Tapping the card body opens the row-actions sheet
  // (View Details / Download / Delete) instead of navigating straight through, matching the
  // mobile design; the checkbox keeps working exactly as it does in the desktop table.
  const renderMobileCard = (row) => {
    const key = periodKey(row);
    const selected = selectedKeys.includes(key);
    return (
      <div className={cn(
        'flex items-center gap-3 rounded-lg border bg-white p-3.5',
        selected && 'border-primary/60 bg-primary/5'
      )}>
        {canManage && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={() => toggleSelect(key)} aria-label="Select period" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setActionsTarget(row)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold">{formatMonthYear(row.month, row.year)}</p>
            <p className="text-xs text-muted-foreground">
              {row.employee_count ?? 0} employee{row.employee_count !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.total_cost)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </div>
    );
  };

  // Monthly costs are imported against exactly one BU, so the upload has to know which. Asking
  // is only meaningful when the user actually holds more than one ACTIVE BU — a single-active-BU
  // user has no choice to make, and an account with none (Platform Admin/Entity Admin) is already
  // unscoped, so both go straight to the import screen and the BU is resolved there.
  const handleUploadClick = () => {
    if (activeBusinessUnits.length > 1) {
      setUploadEntityId('all');
      setUploadBuId('');
      setUploadBuOpen(true);
      return;
    }
    navigate(ROUTES.MONTHLY_COST_IMPORT);
  };

  const confirmUploadBu = () => {
    if (!uploadBuId) return;
    setUploadBuOpen(false);
    navigate(`${ROUTES.MONTHLY_COST_IMPORT}?buId=${encodeURIComponent(uploadBuId)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Monthly Costs"
        description=""
        actions={
          // Mobile: a deliberate stacked layout (search full-width, Filters/Download Sample paired
          // evenly, Upload Excel full-width below) instead of the plain flex-wrap row below wrapping
          // wherever content happened to run out of room — which left a lone, not-full-width Upload
          // Excel button on its own line. Desktop (`md:`) is unchanged: one inline row, same as before.
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
            {/* Mobile only — desktop has no search input here at all, unchanged. */}
            <div className="relative w-full md:hidden">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
              <Input
                placeholder="Search month..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full pl-9 text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:w-auto md:items-center md:gap-2">
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
                className="w-full md:w-auto"
              />
              {canManage && (
                <Button variant="outline" size="toolbar" className="w-full md:w-auto" onClick={downloadMonthlyCostSample}>
                  <Download className="h-4 w-4" />
                  Download Sample
                </Button>
              )}
            </div>
            {canManage && (
              <>
                {/* <Button variant="outline" size="toolbar" onClick={() => setCalcOpen(true)}>
                  <Calculator className="h-4 w-4" />
                  Calculate
                </Button> */}
                <Button size="toolbar" className="w-full md:w-auto" onClick={handleUploadClick}>
                  <Upload className="h-4 w-4" />
                  Upload Excel
                </Button>
              </>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[140px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
        onClose={() => setFiltersOpen(false)}
      >
        {showEntityFilter && (
          <EntityFilter multiple value={entityId} onChange={handleEntityChange} />
        )}
        {showBuFilter && (
          <BusinessUnitFilter multiple value={buId} entityId={entityId} onChange={handleBuChange} />
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year</Label>
          <MonthYearPicker
            value={monthYearFilter}
            onChange={(val) => { setMonthYearFilter(val); setPage(1); clearSelection(); }}
            placeholder="All months"
            className="w-full md:w-44"
          />
        </div>
      </FilterPanel>

      {selectedKeys.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">{selectedKeys.length} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="toolbar" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="toolbar"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => setIsBulkDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredRecords}
        isLoading={isPending}
        toolbar={null}
        mobileCards
        mobileCardRenderer={renderMobileCard}
        pagination={
          meta.total != null
            ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total }
            : undefined
        }
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={(p) => { setPage(p); clearSelection(); }}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); clearSelection(); }}
        onRowClick={(row) => navigate(buildPath(ROUTES.MONTHLY_COST_DETAIL, { month: row.month, year: row.year }))}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this period?"
        description={`This will permanently remove all ${deleteTarget?.employee_count ?? ''} monthly cost record(s) for ${deleteTarget ? formatMonthYear(deleteTarget.month, deleteTarget.year) : ''}. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isLoading={deletePeriodsMutation.isPending}
      />

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title={`Delete ${selectedKeys.length} period${selectedKeys.length !== 1 ? 's' : ''}?`}
        description="This will permanently remove every monthly cost record in the selected periods. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isLoading={deletePeriodsMutation.isPending}
      />

      {/* Mobile row-actions sheet — opened by tapping a period card's body (see
          renderMobileCard). "View Details" and "Delete" reuse the exact same navigation/delete
          paths the desktop row-click and action-column icon already use; "Download" is the one
          new action (see downloadMonthlyCostPeriod), reusing the same per-period fetch already
          used by the Sync flow on the Import screen. */}
      <Sheet open={!!actionsTarget} onOpenChange={(open) => !open && setActionsTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>{actionsTarget ? formatMonthYear(actionsTarget.month, actionsTarget.year) : ''}</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                const target = actionsTarget;
                setActionsTarget(null);
                navigate(buildPath(ROUTES.MONTHLY_COST_DETAIL, { month: target.month, year: target.year }));
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/50"
            >
              <Eye className="h-4 w-4 text-muted-foreground" /> View Details
            </button>
            <button
              type="button"
              onClick={handleDownloadPeriod}
              disabled={downloadingPeriod}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              <Download className="h-4 w-4 text-muted-foreground" /> {downloadingPeriod ? 'Downloading…' : 'Download'}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(actionsTarget);
                  setActionsTarget(null);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <SheetFooter className="border-t p-3">
            <Button type="button" variant="outline" className="w-full" onClick={() => setActionsTarget(null)}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Asked only when the user holds more than one BU — see handleUploadClick. */}
      <Dialog open={uploadBuOpen} onOpenChange={setUploadBuOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Which Business Unit?</DialogTitle>
            <DialogDescription>
              Every row in the file you upload is imported against this Business Unit.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {uploadBuEntityOptions.length > 1 && (
              <div>
                <Label className="mb-2 block">Entity</Label>
                <SearchableSelect
                  options={[{ label: 'All Entities', value: 'all' }, ...uploadBuEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))]}
                  value={uploadEntityId}
                  onValueChange={(v) => { setUploadEntityId(v ?? 'all'); setUploadBuId(''); }}
                  placeholder="All Entities"
                  searchPlaceholder="Search entity..."
                  showSearch={uploadBuEntityOptions.length > 6}
                  className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
                />
              </div>
            )}
            <div>
              <Label className="mb-2 block">Business Unit</Label>
              <SearchableSelect
                options={uploadBuOptionsForEntity(uploadEntityId).map((bu) => ({ label: bu.name, value: String(bu.id) }))}
                value={uploadBuId}
                onValueChange={setUploadBuId}
                placeholder="Select a Business Unit"
                searchPlaceholder="Search business unit..."
                showSearch={activeBusinessUnits.length > 6}
                className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setUploadBuOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmUploadBu} disabled={!uploadBuId}>
              <Upload className="mr-1.5 h-4 w-4" />
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Calculate Monthly Costs</DialogTitle>
            <DialogDescription>
              Bulk-calculate costs for all employees for the selected month and year.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label className="mb-2 block">Month &amp; Year</Label>
            <MonthYearPicker
              value={calcMonthYear}
              onChange={(val) => val && setCalcMonthYear(val)}
              clearable={false}
              className="w-full"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCalcOpen(false)}
              disabled={calculateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCalculate}
              disabled={calculateMutation.isPending || !calcMonthYear}
            >
              <Calculator className="mr-1.5 h-4 w-4" />
              {calculateMutation.isPending ? 'Calculating…' : 'Calculate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MonthlyCostList;
