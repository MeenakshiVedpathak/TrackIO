import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Upload, Info, Download, Trash2, Loader2, RefreshCw, FileSpreadsheet, MoreVertical } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTimesheetHistory, useDeleteTimesheetImport, useDeleteTimesheetImports } from '@/hooks/useTimesheets';
import { useCanViewOriginalData } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useCompanies } from '@/hooks/useCompanies';
import { timesheetsApi } from '@/api/timesheets.api';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError, canScopeAcrossBus } from '@/services/apiClient';
import { ROUTES, buildPath } from '@/constants/routes';
import { formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import EntityFilter from '@/components/common/EntityFilter';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import SyncWorkLogsDialog from '@/components/timesheets/SyncWorkLogsDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();


const TimesheetList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useNotification();
  const canViewOriginal = useCanViewOriginalData();
  const { businessUnits } = useAuth();

  // The login's own BU mapping (GET /employees/:id/business-units) doesn't carry entity info —
  // confirmed live, an Entity dropdown built straight off it came back empty. The company master
  // does, so it's looked up here and merged in. Safe for any login this query 403s for: it just
  // comes back empty and every BU's entity_id stays null, same as before this lookup existed.
  const { data: companiesForEntityLookup } = useCompanies(
    { status: 'active', limit: 200 },
    { staleTime: 1000 * 60 * 10 }
  );
  // Sync/Upload must only offer BUs that are still active. The login's own BU mapping never
  // carries a `status` field at all (the backend endpoint behind useAuth().businessUnits strips
  // it before it reaches the frontend), so the old `(bu.status ?? 'active') === 'active'` check
  // here was a permanent no-op — every mapped BU passed, active or not. companiesForEntityLookup
  // above IS genuinely status-filtered server-side, so intersect its ids instead. Guarded: when
  // it hasn't returned any rows yet (still loading, or a 403 for a login without company-listing
  // standing), fall back to the unfiltered mapping rather than blanking both dialogs.
  //
  // That intersection only lines up for a BU-scoped login (BU Admin/BU Head), because GET
  // /companies scopes THEM to their own mapped BUs specifically (backend's allowCompanyListing).
  // For a cross-BU login (Admin/Entity Admin/Platform Admin) it returns a completely different
  // set — companies under Entities that Admin personally created via an Entity Admin — which
  // doesn't include their own directly-mapped BU at all. Cross-checking against it there silently
  // dropped a BU-mapped Admin's own single BU (confirmed live: Sync stayed permanently disabled,
  // no dropdown left to fix it from since a single BU never renders one). Skip the filter for them
  // and trust the mapping as-is, same as useSelectableBusinessUnits does.
  const activeCompanyIds = useMemo(
    () => new Set((companiesForEntityLookup?.data ?? []).map((c) => String(c.id))),
    [companiesForEntityLookup]
  );
  const rawActiveBusinessUnits = useMemo(
    () => (canScopeAcrossBus() || activeCompanyIds.size === 0
      ? businessUnits
      : businessUnits.filter((bu) => activeCompanyIds.has(String(bu.id)))),
    [businessUnits, activeCompanyIds]
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
  const activeBusinessUnits = useMemo(
    () => rawActiveBusinessUnits.map((bu) => {
      const looked = entityByBuId.get(String(bu.id));
      return {
        ...bu,
        entity_id: bu.entity_id ?? bu.entityId ?? looked?.id ?? null,
        entity_name: bu.entity_name ?? bu.entityName ?? looked?.name ?? null,
      };
    }),
    [rawActiveBusinessUnits, entityByBuId]
  );

  // Distinct Entities across this login's own mapped BUs — feeds the Entity step in the Sync/
  // Upload dialogs below, which (unlike the list's EntityFilter/BusinessUnitFilter pair) can only
  // ever target a BU this login is actually mapped to, not the full company master.
  const buEntityOptions = useMemo(() => {
    const byId = new Map();
    activeBusinessUnits.forEach((bu) => {
      const id = bu.entity_id ?? bu.entityId;
      const name = bu.entity_name ?? bu.entityName;
      if (id != null && name && !byId.has(id)) byId.set(id, { id, name });
    });
    return Array.from(byId.values());
  }, [activeBusinessUnits]);

  const buOptionsForEntity = (entityId) =>
    entityId && entityId !== 'all'
      ? activeBusinessUnits.filter((bu) => String(bu.entity_id ?? bu.entityId) === String(entityId))
      : activeBusinessUnits;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const currentDate = new Date();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadEntityId, setUploadEntityId] = useState('all');
  const [uploadBuId, setUploadBuId] = useState('');
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [uploadMonthYear, setUploadMonthYear] = useState({ month: currentDate.getMonth() + 1, year: currentDate.getFullYear() });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [monthYearFilter, setMonthYearFilter] = useState(null);
  const [entityFilter, setEntityFilter] = useState('all');
  const [buFilter, setBuFilter] = useState('all');
  const [openingId, setOpeningId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [sorting, setSorting] = useState([]);

  // The Entity filter only ever narrows which BUs BusinessUnitFilter offers — it was never itself
  // forwarded to the request (this endpoint has no entity_id concept), so picking an Entity while
  // "All Business Units" stayed selected silently left the query unscoped and mixed in every other
  // Entity's imports too (confirmed live: BUs from an unrelated Entity kept showing). Fixed by
  // fanning out one GET /timesheets/import/history call per BU under the selected Entity
  // (entityBuUnits, from useSelectableBusinessUnits) and merging the results — same pattern as
  // useMyTeamEmployeesAcrossBus for the equivalent "All Business Units" undercount.
  const { units: entityBuUnits } = useSelectableBusinessUnits(entityFilter);
  const shouldFanOutByEntity = entityFilter !== 'all' && buFilter === 'all' && entityBuUnits.length > 1;

  const params = {
    page,
    limit,
    buId: buFilter,
    ...(monthYearFilter && { month: monthYearFilter.month, year: monthYearFilter.year }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending: isSinglePending, isError: isSingleError } =
    useTimesheetHistory(params, { enabled: !shouldFanOutByEntity });

  // One request per BU in the selected Entity, merged client-side. Each per-BU response omits
  // `company` (the backend only attaches it for a genuinely multi-BU request), so it's stamped
  // back on here from the BU that request was scoped to — keeps the Business Unit column working
  // for this fanned-out view too.
  const fanOutQueries = useQueries({
    queries: shouldFanOutByEntity
      ? entityBuUnits.map((bu) => {
          const buParams = { ...params, buId: String(bu.id) };
          return {
            queryKey: QUERY_KEYS.TIMESHEET_IMPORT_HISTORY(buParams),
            queryFn: () => timesheetsApi.getHistory(buParams),
            placeholderData: (prev) => prev,
          };
        })
      : [],
  });

  const fanOutRecords = shouldFanOutByEntity
    ? fanOutQueries.flatMap((q, i) => {
        const bu = entityBuUnits[i];
        return (Array.isArray(q.data?.data) ? q.data.data : []).map((r) => ({
          ...r,
          company: r.company ?? { id: bu.id, company_name: bu.name },
        }));
      })
    : [];

  const isPending = shouldFanOutByEntity ? fanOutQueries.some((q) => q.isPending) : isSinglePending;
  const isError = shouldFanOutByEntity ? fanOutQueries.some((q) => q.isError) : isSingleError;

  const deleteMutation = useDeleteTimesheetImport();
  const bulkDeleteMutation = useDeleteTimesheetImports();

  const activeFilterCount =
    (monthYearFilter ? 1 : 0) + (entityFilter !== 'all' ? 1 : 0) + (buFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setMonthYearFilter(null);
    setEntityFilter('all');
    setBuFilter('all');
    setPage(1);
    setSelectedIds([]);
  };

  const rawAllRecords = shouldFanOutByEntity ? fanOutRecords : (Array.isArray(data?.data) ? data.data : []);
  // Each fanned-out BU response is independently sorted server-side; re-sort the merged set
  // client-side so a chosen sort column stays correct across BUs. A no-op outside fan-out mode.
  const allRecords = useMemo(() => {
    if (!shouldFanOutByEntity || !sorting[0]) return rawAllRecords;
    const { id, desc } = sorting[0];
    return [...rawAllRecords].sort((a, b) => {
      const av = a[id];
      const bv = b[id];
      if (av == null && bv == null) return 0;
      if (av == null) return desc ? 1 : -1;
      if (bv == null) return desc ? -1 : 1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }, [rawAllRecords, shouldFanOutByEntity, sorting]);
  const records = allRecords.filter((r) => r.status === 'completed');
  const meta    = data?.meta ?? {};

  // Backend only attaches `company` per row when the list spans more than one Business
  // Unit (e.g. "All BU"); a single-BU-scoped fetch omits it entirely. Detect that from the
  // actual response rather than the buFilter value so this stays correct however the
  // backend ends up deciding "more than one BU".
  const hasCompanyColumn = allRecords.some((r) => r.company != null);

  // The Business Unit column had a flat 150px size, which clipped anything longer than
  // ~15 characters (e.g. "Software Solutions-UVTECH") behind an ellipsis. BU names vary wildly in
  // length across tenants, so size the column to the longest name actually on this page instead of
  // a fixed guess — clamped so one outlier name can't blow out the whole table (DataTable renders
  // `table-fixed`, so every column still needs a real number; see its own comment on that).
  const businessUnitColumnWidth = useMemo(() => {
    const longestName = allRecords.reduce((max, r) => {
      const name = r.company?.company_name ?? r.company?.company_code ?? '';
      return Math.max(max, name.length);
    }, 0);
    return Math.min(320, Math.max(150, (longestName * 7.5) + 40));
  }, [allRecords]);

  const allSelected = records.length > 0 && records.every((r) => selectedIds.includes(r.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : records.map((r) => r.id));
  const toggleSelect = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleDownloadSample = () => {
    const wsData = [
      ['Employee Code', 'Name', 'Project 1', 'Project 2', 'Is Working'],
      ['EMP-0201', 'Aditya Uday patil', '00:00:00', '00:10:00', 'F'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();

    ws['!cols'] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
    ];

    const currentMonth = new Date().toLocaleString('default', { month: 'short' });
    XLSX.utils.book_append_sheet(wb, ws, currentMonth);
    XLSX.writeFile(wb, 'Timesheet_Sample.xlsx');
  };

  // Excel upload lands rows against exactly one BU — asked up front
  // in the "Select Period" dialog instead of a separate step since that dialog is a single screen.
  const handleUploadClick = () => {
    setUploadEntityId('all');
    setUploadBuId(activeBusinessUnits.length === 1 ? String(activeBusinessUnits[0].id) : '');
    setIsUploadDialogOpen(true);
  };

  const handleDelete = () => {
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        success(`Import "${deleteTarget.file_name}" has been deleted.`);
        setDeleteTarget(null);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  // Shared between the desktop row click and the mobile card tap below — opens an import's
  // Detail page, prefetching its (potentially large) row set first so the loading spinner covers
  // the whole wait instead of showing the Detail page's own skeleton right after this one.
  const openImport = async (row) => {
    if (openingId) return;
    setOpeningId(row.id);
    // The row's own BU — NOT whatever's globally active in the navbar. See hasCompanyColumn above.
    const rowBuId = row.company?.id ?? (buFilter !== 'all' ? Number(buFilter) : null);
    try {
      await queryClient.prefetchQuery({
        queryKey: [...QUERY_KEYS.TIMESHEET_IMPORT_ROWS(String(row.id)), rowBuId ?? 'active'],
        queryFn: () => timesheetsApi.getImportRows(row.id, rowBuId),
      });
    } finally {
      navigate(buildPath(ROUTES.TIMESHEET_IMPORT_DETAIL, { id: row.id }), { state: { buId: rowBuId } });
    }
  };

  // Mobile (< md): DataTable's `mobileCards` renders one of these per row instead of a table row —
  // matches the "Timesheet Imports" mobile list mock (file icon, name, row/employee counts, date,
  // and a kebab menu for Delete in place of the desktop actions column/checkbox).
  const mobileCardRenderer = (rowData) => {
    const isOpening = openingId === rowData.id;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openImport(rowData)}
        onKeyDown={(e) => { if (e.key === 'Enter') openImport(rowData); }}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg border bg-white p-3.5 text-left active:bg-muted/40',
          openingId && openingId !== rowData.id && 'pointer-events-none opacity-50'
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50">
          {isOpening ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{rowData.file_name ?? '—'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rowData.total_rows ?? 0} rows &bull; {rowData.total_employees ?? 0} employee{rowData.total_employees === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(rowData.created_at)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Row actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteTarget(rowData)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const handleBulkDelete = () => {
    const count = selectedIds.length;
    bulkDeleteMutation.mutate(selectedIds, {
      onSuccess: () => {
        success(`${count} import${count !== 1 ? 's' : ''} deleted.`);
        setSelectedIds([]);
        setIsBulkDeleteOpen(false);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const columns = [
    columnHelper.display({
      id: 'select',
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      size: 36,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedIds.includes(row.original.id)}
            onCheckedChange={() => toggleSelect(row.original.id)}
            aria-label="Select row"
          />
        </div>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 90,
      cell: ({ row }) => (
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
      ),
    }),
    columnHelper.accessor('file_name', {
      header: 'File Name',
      size: 150,
      cell: (info) => (
        <div className="flex items-center gap-2 max-w-[150px]">
          <span className="font-medium text-sm truncate" title={info.getValue()}>
            {info.getValue() ?? '—'}
          </span>
          {openingId === info.row.original.id && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          )}
        </div>
      ),
    }),
    ...(hasCompanyColumn ? [columnHelper.display({
      id: 'business_unit',
      header: 'Business Unit',
      size: businessUnitColumnWidth,
      cell: ({ row }) => {
        const company = row.original.company;
        const name = company?.company_name ?? company?.company_code;
        return name ? (
          <span className="text-sm truncate" title={name}>{name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    })] : []),
    columnHelper.accessor('importer', {
      header: 'Imported By',
      size: 200,
      cell: (info) => {
        const imp = info.getValue();
        const name = imp?.employee?.full_name ?? imp?.email ?? '—';
        const code = imp?.employee?.employee_code;
        return (
          <div className="max-w-[190px]">
            <p className="text-sm font-medium truncate" title={name}>{name}</p>
            {code && <p className="text-xs text-muted-foreground font-mono truncate">{code}</p>}
          </div>
        );
      },
    }),
    columnHelper.accessor('total_rows', {
      // Sized to fit the label plus its sort icon — DataTable pins size as a hard width and
      // truncates the header text inside it, so anything narrower renders as "T...".
      header: 'Total Rows',
      size: 130,
      cell: (info) => (
        <span className="tabular-nums text-sm">{info.getValue() ?? '—'}</span>
      ),
    }),
    // columnHelper.accessor('valid_rows', {
    //   header: 'Valid',
    //   size: 70,
    //   cell: (info) => (
    //     <span className="tabular-nums text-sm text-green-600 font-medium">{info.getValue() ?? '—'}</span>
    //   ),
    // }),
    // columnHelper.accessor('error_rows', {
    //   header: 'Errors',
    //   size: 70,
    //   cell: (info) => {
    //     const v = info.getValue();
    //     return (
    //       <span className={`tabular-nums text-sm font-medium ${v > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
    //         {v ?? '—'}
    //       </span>
    //     );
    //   },
    // }),
    columnHelper.accessor('total_employees', {
      header: 'Employees',
      size: 130,
      cell: (info) => {
        const v = info.getValue();
        return (
          <span className="tabular-nums text-sm font-medium text-blue-600">
            {v ?? '—'}
          </span>
        );
      },
    }),
    ...(canViewOriginal ? [columnHelper.accessor('is_publish', {
      header: 'Status',
      size: 100,
      cell: (info) => {
        const v = !!info.getValue();
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${v ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
            {v ? 'Published' : 'Unpublished'}
          </span>
        );
      },
    })] : []),
    columnHelper.accessor('created_at', {
      header: 'Imported At',
      size: 150,
      cell: (info) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Timesheet Imports"
        description=""
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
                  <ul className="list-disc pl-3">
                    <li>Worksheet name should be short of month like Jan, Feb etc.</li>
                    <li>The employee and project should be present in their respective masters with status active</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" size="sm" onClick={handleDownloadSample}>
              <Download className="mr-1.5 h-4 w-4" />
              Download Sample
            </Button>
            {/* Hidden on mobile — the sticky full-width button below the list (mobile list mock)
                covers this same action there. */}
            <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setIsSyncDialogOpen(true)}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Sync Employee Work Logs
            </Button>
            {canViewOriginal && (
              <Button size="sm" onClick={handleUploadClick}>
                <Upload className="mr-1.5 h-4 w-4" />
                Upload Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[140px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter
          value={entityFilter}
          onChange={(v) => { setEntityFilter(v); setBuFilter('all'); setPage(1); setSelectedIds([]); }}
        />
        <BusinessUnitFilter
          value={buFilter}
          entityId={entityFilter}
          onChange={(v) => { setBuFilter(v); setPage(1); setSelectedIds([]); }}
        />
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year</Label>
          <MonthYearPicker
            value={monthYearFilter}
            onChange={(val) => { setMonthYearFilter(val); setPage(1); setSelectedIds([]); }}
            placeholder="All months"
            className="w-44"
          />
        </div>
      </FilterPanel>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load timesheet imports for the current filters. If "All Business Units" is
          selected, try picking a specific Business Unit instead, or try again.
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>
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
        toolbar={null}
        mobileCards
        mobileCardRenderer={mobileCardRenderer}
        pagination={
          records.length > 0
            ? {
                page:  1,
                limit: records.length,
                total: records.length,
              }
            : undefined
        }
        sorting={sorting}
        onSortingChange={(s) => { setSorting(s); setPage(1); }}
        onPageChange={(p) => { setPage(p); setSelectedIds([]); }}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); setSelectedIds([]); }}
        rowClassName={(row) => (openingId && openingId !== row.id ? 'opacity-50 pointer-events-none' : '')}
        onRowClick={openImport}
      />

      {/* Mobile-only — mirrors the header's "Sync Employee Work Logs" action as a full-width
          button below the list, matching the mobile list mock. Hidden on desktop, where the
          header button above already covers it. */}
      <Button className="h-11 w-full shrink-0 md:hidden" onClick={() => setIsSyncDialogOpen(true)}>
        <RefreshCw className="mr-1.5 h-4 w-4" />
        Sync Employee Work Logs
      </Button>

      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Select Period</DialogTitle>
            <DialogDescription>
              Choose the month and year for this timesheet import.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Month &amp; Year</Label>
              <MonthYearPicker value={uploadMonthYear} onChange={setUploadMonthYear} clearable={false} className="w-full" />
            </div>
            {/* Same "which BU does this land in" question as Sync's dialog, asked inline here
                since Upload is already a single-step dialog — only shown when there's an actual
                choice to make (see handleUploadClick). */}
            {activeBusinessUnits.length > 1 && (
              <>
                {buEntityOptions.length > 1 && (
                  <div className="grid gap-2">
                    <Label>Entity</Label>
                    <SearchableSelect
                      options={[{ label: 'All Entities', value: 'all' }, ...buEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))]}
                      value={uploadEntityId}
                      onValueChange={(v) => { setUploadEntityId(v ?? 'all'); setUploadBuId(''); }}
                      placeholder="All Entities"
                      searchPlaceholder="Search entity..."
                      showSearch={buEntityOptions.length > 6}
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Business Unit</Label>
                  <SearchableSelect
                    options={buOptionsForEntity(uploadEntityId).map((bu) => ({ label: bu.name, value: String(bu.id) }))}
                    value={uploadBuId}
                    onValueChange={setUploadBuId}
                    placeholder="Select a Business Unit"
                    searchPlaceholder="Search business unit..."
                    showSearch={activeBusinessUnits.length > 6}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={activeBusinessUnits.length > 1 && !uploadBuId}
              onClick={() => {
                setIsUploadDialogOpen(false);
                navigate(ROUTES.TIMESHEET_UPLOAD, { state: { month: uploadMonthYear.month, year: uploadMonthYear.year, buId: uploadBuId || null } });
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SyncWorkLogsDialog
        open={isSyncDialogOpen}
        onOpenChange={setIsSyncDialogOpen}
        activeBusinessUnits={activeBusinessUnits}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this upload?"
        description={`This will permanently remove "${deleteTarget?.file_name}" and all ${deleteTarget?.total_rows ?? ''} timesheet rows it imported. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title={`Delete ${selectedIds.length} upload${selectedIds.length !== 1 ? 's' : ''}?`}
        description="This will permanently remove the selected imports and all timesheet rows they contain. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isLoading={bulkDeleteMutation.isPending}
      />
    </div>
  );
};

export default TimesheetList;
