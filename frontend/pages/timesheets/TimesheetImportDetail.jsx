import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, FileSpreadsheet, Plus, Filter, Download, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  useTimesheetImportRows,
  useTimesheetHistory,
  useCreateTimesheet,
  useBulkUpdateModifiedHours,
  usePublishImport,
} from '@/hooks/useTimesheets';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useSubProjectsByPO } from '@/hooks/useSubProjects';
import { useAuth } from '@/hooks/useAuth';
import { useCanWrite, useCanViewOriginalData } from '@/hooks/usePermissions';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import { formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const columnHelper = createColumnHelper();

// Shared by both the "sort the full filtered dataset" pass (done manually,
// since rows are paginated client-side) and each column's own sortingFn — so
// re-sorting the already-sorted page slice inside DataTable is idempotent.
const getSortValue = (row, columnId) => {
  switch (columnId) {
    case 'employee':
      return row.employee?.full_name ?? '';
    case 'servicePO':
      return row.servicePO?.service_po_name ?? '';
    case 'client':
      return row.servicePO?.client?.client_name ?? '';
    case 'hours_logged':
      return Number(row.hours_logged) || 0;
    case 'modified_hours':
      return row.modified_hours != null ? Number(row.modified_hours) : (Number(row.hours_logged) || 0);
    case 'category':
      return row.servicePO?.serviceType?.serviceCategory?.name ?? '';
    default:
      return '';
  }
};

const compareSortValues = (va, vb) => {
  if (typeof va === 'string' || typeof vb === 'string') {
    return String(va).localeCompare(String(vb));
  }
  return va - vb;
};

const cellInputClass = 'h-8 text-xs bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background transition-colors rounded-md px-2';

// Employee is intentionally read-only — reassigning a timesheet entry to a
// different employee isn't allowed here.
const EmployeeCell = memo(({ row }) => (
  <div>
    <p className="text-sm font-medium">{row.employee?.full_name ?? '—'}</p>
    <p className="text-xs text-muted-foreground font-mono">{row.employee?.employee_code ?? ''}</p>
  </div>
));

// Modified Hours is the only editable field left on this grid — hours_logged
// (the original, imported value) is always read-only, and edits are only
// ever sent through the bulk update API, never a per-row endpoint. The column
// only renders at all when canViewOriginal is true, so this cell is always editable.
const ModifiedHoursCell = memo(({ row, initialValue, onChange }) => {
  const [val, setVal] = useState(initialValue);
  return (
    <input
      type="number"
      step="0.25"
      min="0"
      max="999.99"
      value={val}
      onChange={(e) => {
        setVal(e.target.value);
        onChange(row.id, e.target.value);
      }}
      className={cn('w-full text-right tabular-nums font-semibold border', cellInputClass)}
    />
  );
});

const PublishPill = ({ value }) => (
  <span className={cn(
    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
    value ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
  )}>
    {value ? 'Published' : 'Unpublished'}
  </span>
);

const TimesheetImportDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  // The BU this import actually belongs to — NOT whatever's globally active in the navbar (see
  // timesheets.api.js's getImportRows). TimesheetList.jsx's row click passes it through router
  // state; a direct visit/refresh has no state, so fall back to whatever the (explicitly
  // header-less, hence multi-BU-shaped) history lookup below resolves the import under.
  const stateBuId = location.state?.buId ?? null;

  // Explicitly 'all' (header-less), not omitted: an omitted buId leaves the interceptor's default
  // active-BU header in place, which silently fails to find this import at all the moment it
  // belongs to any other BU — the same class of bug fixed on the list page. Header-less also means
  // the response is shaped as "more than one BU," so `company` comes back on every row (used below
  // as the buId fallback when there's no route state).
  const { data: historyData } = useTimesheetHistory({ page: 1, limit: 100, buId: 'all' });
  const importRecord = (historyData?.data ?? []).find((r) => String(r.id) === String(id));
  const isLocked = !!importRecord?.is_publish;

  const effectiveBuId = stateBuId ?? importRecord?.company?.id ?? null;
  // Don't fire the rows request until we know which BU to scope it to — a route-state buId is
  // ready immediately, otherwise wait for the history lookup above to resolve (or fail to) first.
  const rowsReady = stateBuId != null || historyData !== undefined;
  const { data: rowsData, isPending } = useTimesheetImportRows(id, effectiveBuId, { enabled: !!id && rowsReady });

  const rows = Array.isArray(rowsData?.data) ? rowsData.data : [];

  const notify = useNotification();
  const { employee } = useAuth();
  const canWrite = useCanWrite();
  const canAddEntry = canWrite;
  // Modified Hours, the Status badge, and Publish are all gated purely by the Role Master's
  // is_original_data_visible flag — visible/usable only when that flag is set on the user's role.
  // Modified Hours stays editable even after publish — only the publish action itself is one-way.
  const canViewOriginal = useCanViewOriginalData();

  const { data: activeServicePOsData } = useActiveServicePOs();

  const servicePOOptions = (activeServicePOsData?.data ?? activeServicePOsData ?? []).map((p) => ({
    value: String(p.service_po_id ?? p.id),
    label: p.service_po_name ?? p.name,
  }));

  // ── Add a single row to this import batch — the month is fixed to this
  // batch's own import_month/import_year, never typed in the form ──
  const emptyAddForm = { employee_id: '', service_po_id: '', sub_project_id: '', day: '1', hours_logged: '' };
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const createTimesheetMutation = useCreateTimesheet();
  const { data: activeEmployees = [] } = useActiveEmployees();
  const { data: addSubProjects = [] } = useSubProjectsByPO(addForm.service_po_id || null);

  const openAddRow = () => {
    setAddForm(emptyAddForm);
    setIsAddDialogOpen(true);
  };

  const handleAddSubmit = async () => {
    if (!addForm.employee_id || !addForm.service_po_id || !addForm.day || addForm.hours_logged === '') {
      notify.error('Please fill in all required fields.');
      return;
    }

    setIsSavingAdd(true);
    try {
      const timesheetDate = `${importRecord.import_year}-${String(importRecord.import_month).padStart(2, '0')}-${String(addForm.day).padStart(2, '0')}`;
      await createTimesheetMutation.mutateAsync({
        employee_id: Number(addForm.employee_id),
        service_po_id: Number(addForm.service_po_id),
        sub_project_id: addForm.sub_project_id ? Number(addForm.sub_project_id) : null,
        timesheet_date: timesheetDate,
        hours_logged: Number(addForm.hours_logged),
        timesheet_import_id: Number(id),
        created_by: employee?.id,
        updated_by: employee?.id,
      });
      notify.success('Timesheet entry added.');
      setIsAddDialogOpen(false);
    } catch (err) {
      notify.error(extractApiError(err));
    } finally {
      setIsSavingAdd(false);
    }
  };

  // ── Modified Hours: buffered locally per row and only sent to the server,
  // as a single bulk request, when the user clicks "Save Changes". Lives in a
  // ref so typing doesn't trigger a page re-render — only membership in
  // `dirtyRowIds` (one row entering/leaving the dirty set) does. ──
  const editsRef = useRef({});
  const [dirtyRowIds, setDirtyRowIds] = useState(() => new Set());
  const [saveVersion, setSaveVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const editedCount = dirtyRowIds.size;
  const bulkUpdateMutation = useBulkUpdateModifiedHours();

  const unsavedChangesMessage = `You have ${editedCount} unsaved change${editedCount !== 1 ? 's' : ''} to Modified Hours. If you leave now, they will be lost.`;

  // Registers this page's dirty state globally so leaving via the Sidebar (or
  // any other in-app navigation) prompts too, not just this page's own Back
  // button / browser Back / tab close.
  useUnsavedChangesGuard(editedCount > 0, unsavedChangesMessage);

  // ── Unsaved-changes guard: warn before losing edits on tab close/refresh
  // (beforeunload) or the browser Back/Forward buttons (popstate — react-router's
  // useBlocker needs a data router, which this app's plain BrowserRouter doesn't use,
  // so a buffer history entry + popstate listener is the only way to intercept it). ──
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    if (editedCount === 0) return undefined;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      setShowLeaveConfirm(true);
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [editedCount]);

  const updateEdit = useCallback((rowId, value) => {
    const key = String(rowId);
    editsRef.current = { ...editsRef.current, [key]: value };
    setDirtyRowIds((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const discardChanges = () => {
    editsRef.current = {};
    setDirtyRowIds(new Set());
    setSaveVersion((v) => v + 1);
  };

  const saveChanges = async () => {
    const timesheets = Object.entries(editsRef.current)
      .filter(([, value]) => value !== '' && !Number.isNaN(Number(value)))
      .map(([rowId, value]) => ({ id: Number(rowId), hours: Number(value) }));
    if (timesheets.length === 0) return;

    setIsSaving(true);
    try {
      // Transactional on the backend — either every row lands or none does,
      // so there's no partial-success bookkeeping to do here.
      await bulkUpdateMutation.mutateAsync({ timesheetImportId: id, timesheets });
      editsRef.current = {};
      setDirtyRowIds(new Set());
      setSaveVersion((v) => v + 1);
      notify.success(`${timesheets.length} row(s) updated.`);
    } catch (err) {
      // Leave local edits untouched so the user doesn't lose their input and
      // the UI doesn't drift from what the server actually has.
      notify.error(extractApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Publish: a separate, one-way action — never modifies hours, only the
  // batch's is_publish flag. Modified Hours stay editable after publish; only
  // publishing itself and adding new rows are locked once is_publish is set. ──
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const publishMutation = usePublishImport();

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync(id);
      notify.success('Timesheet published.');
      setIsPublishConfirmOpen(false);
    } catch (err) {
      notify.error(extractApiError(err));
    }
  };

  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [poFilter, setPoFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Rows aren't paginated server-side (the whole import is fetched in one
  // shot), but rendering every row at once — each wrapped in its own
  // animated <tr> — is what made this page hang for large imports. Slice
  // client-side so only one page's worth of rows ever mounts at a time.
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
  const [sorting, setSorting] = useState([]);

  // Download: the Export Excel dropdown asks whether to export Hours
  // (original hours_logged), Modified Hours (falling back to hours_logged for
  // rows never modified), or Both — then downloads immediately on choice.
  // Always exports the full filtered dataset, not just the current page.
  // Uses the same DropdownMenu + XLSX.writeFile pattern as every other
  // "Export Excel" button in the app (Dialog-based choosers were triggering a
  // native Save As prompt here that the other export buttons don't hit).
  const handleDownloadSheet = (mode) => {
    if (filteredRows.length === 0) {
      notify.error('No data to export.');
      return;
    }
    const exportData = sortedRows.map((row) => {
      const base = {
        'Employee Name': row.employee?.full_name ?? '',
        'Employee Code': row.employee?.employee_code ?? '',
        'Service PO': row.servicePO?.service_po_name ?? '',
        'Client': row.servicePO?.client?.client_name ?? '',
        'Category': row.servicePO?.serviceType?.serviceCategory?.name ?? '',
        'Date': formatDate(row.timesheet_date),
      };
      if (mode !== 'modified') base['Hours'] = row.hours_logged;
      if (mode !== 'hours') base['Modified Hours'] = row.modified_hours != null ? row.modified_hours : row.hours_logged;
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    const baseName = (importRecord?.file_name ?? `import_${id}`).replace(/\.[^/.]+$/, '');
    const suffixMap = { hours: 'hours', modified: 'modified_hours', both: 'hours_and_modified' };
    XLSX.writeFile(wb, `${baseName}_${suffixMap[mode]}.xlsx`);
  };

  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();

  const totalHours = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.hours_logged) || 0), 0),
    [rows]
  );

  const { employees, poOptions, clients } = useMemo(() => {
    const poMap = new Map();
    rows.forEach((r) => {
      const poName = r.servicePO?.service_po_name;
      if (poName && !poMap.has(poName)) {
        poMap.set(poName, {
          name: poName,
          serviceTypeId: r.servicePO?.serviceType?.id != null ? String(r.servicePO.serviceType.id) : null,
          categoryId: r.servicePO?.serviceType?.serviceCategory?.id != null ? String(r.servicePO.serviceType.serviceCategory.id) : null,
        });
      }
    });
    return {
      employees: Array.from(new Set(rows.map(r => r.employee?.full_name).filter(Boolean))).sort(),
      poOptions: Array.from(poMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      clients: Array.from(new Set(rows.map(r => r.servicePO?.client?.client_name).filter(Boolean))).sort(),
    };
  }, [rows]);

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = serviceCategoryFilter === 'all'
    ? activeServiceTypes
    : activeServiceTypes.filter((t) => String(t.service_category_id) === serviceCategoryFilter);

  // Type (or Category, if no type chosen yet) → Service PO
  const filteredPOOptions = poOptions.filter((po) => {
    if (serviceTypeFilter !== 'all') return po.serviceTypeId === serviceTypeFilter;
    if (serviceCategoryFilter !== 'all') return po.categoryId === serviceCategoryFilter;
    return true;
  });

  const handleCategoryChange = (v) => {
    setServiceCategoryFilter(v);
    setServiceTypeFilter('all');
    setPoFilter('all');
    setDetailPage(1);
  };

  const handleTypeChange = (v) => {
    setServiceTypeFilter(v);
    setPoFilter('all');
    setDetailPage(1);
  };

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (employeeFilter !== 'all' && row.employee?.full_name !== employeeFilter) return false;
      if (poFilter !== 'all' && row.servicePO?.service_po_name !== poFilter) return false;
      if (clientFilter !== 'all' && row.servicePO?.client?.client_name !== clientFilter) return false;
      if (serviceCategoryFilter !== 'all' && String(row.servicePO?.serviceType?.serviceCategory?.id) !== serviceCategoryFilter) return false;
      if (serviceTypeFilter !== 'all' && String(row.servicePO?.serviceType?.id) !== serviceTypeFilter) return false;
      return true;
    });
  }, [rows, employeeFilter, poFilter, clientFilter, serviceCategoryFilter, serviceTypeFilter]);

  const filteredHours = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (Number(r.hours_logged) || 0), 0),
    [filteredRows]
  );

  const filteredModifiedHours = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (Number(r.modified_hours != null ? r.modified_hours : r.hours_logged) || 0), 0),
    [filteredRows]
  );

  const isFiltered = employeeFilter !== 'all' || poFilter !== 'all' || clientFilter !== 'all'
    || serviceCategoryFilter !== 'all' || serviceTypeFilter !== 'all';

  const activeFilterCount = [
    employeeFilter !== 'all' ? 1 : 0,
    clientFilter !== 'all' ? 1 : 0,
    serviceCategoryFilter !== 'all' ? 1 : 0,
    serviceTypeFilter !== 'all' ? 1 : 0,
    poFilter !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Sort the full filtered set (not just the current page) so paging through
  // sorted results is coherent — this table has no server-side sort/paginate.
  const sortedRows = useMemo(() => {
    const [sort] = sorting;
    if (!sort) return filteredRows;
    const sortedCopy = [...filteredRows].sort((a, b) => {
      const cmp = compareSortValues(getSortValue(a, sort.id), getSortValue(b, sort.id));
      return sort.desc ? -cmp : cmp;
    });
    return sortedCopy;
  }, [filteredRows, sorting]);

  const pagedRows = sortedRows.slice((detailPage - 1) * detailPageSize, detailPage * detailPageSize);

  const columns = useMemo(() => [
    columnHelper.accessor('employee', {
      header: 'Employee',
      size: 200,
      sortingFn: (rowA, rowB, columnId) => compareSortValues(getSortValue(rowA.original, columnId), getSortValue(rowB.original, columnId)),
      cell: (info) => (
        <EmployeeCell row={info.row.original} />
      ),
    }),
    columnHelper.accessor('servicePO', {
      header: 'Service PO',
      size: 220,
      sortingFn: (rowA, rowB, columnId) => compareSortValues(getSortValue(rowA.original, columnId), getSortValue(rowB.original, columnId)),
      cell: (info) => {
        const po = info.getValue();
        return po ? (
          <span className="text-sm truncate block" title={po.service_po_name}>{po.service_po_name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    }),
    columnHelper.accessor('servicePO.client', {
      id: 'client',
      header: 'Client',
      size: 160,
      sortingFn: (rowA, rowB, columnId) => compareSortValues(getSortValue(rowA.original, columnId), getSortValue(rowB.original, columnId)),
      cell: (info) => {
        const client = info.getValue();
        return client ? (
          <span className="text-sm truncate block" title={client.client_name}>{client.client_name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    }),
    columnHelper.accessor('hours_logged', {
      header: () => <span className="block text-right">Hours</span>,
      size: 100,
      sortingFn: (rowA, rowB, columnId) => compareSortValues(getSortValue(rowA.original, columnId), getSortValue(rowB.original, columnId)),
      cell: (info) => {
        const value = info.getValue();
        return (
          <span className="block w-full text-right tabular-nums text-sm">
            {value != null ? value : '—'}
          </span>
        );
      },
    }),
    ...(canViewOriginal ? [columnHelper.accessor('modified_hours', {
      header: () => <span className="block text-right">Modified Hours</span>,
      size: 130,
      sortingFn: (rowA, rowB, columnId) => compareSortValues(getSortValue(rowA.original, columnId), getSortValue(rowB.original, columnId)),
      cell: (info) => {
        const row = info.row.original;
        const edited = editsRef.current[row.id];
        // Display modified_hours if available; otherwise the original hours_logged is the starting editable value.
        const initialValue = edited !== undefined
          ? edited
          : String(row.modified_hours != null ? row.modified_hours : (row.hours_logged ?? ''));
        return (
          <ModifiedHoursCell
            key={`${row.id}-${saveVersion}`}
            row={row}
            initialValue={initialValue}
            onChange={updateEdit}
          />
        );
      },
    })] : []),
    columnHelper.accessor('servicePO.serviceType.serviceCategory', {
      id: 'category',
      header: 'Category',
      size: 200,
      sortingFn: (rowA, rowB, columnId) => compareSortValues(getSortValue(rowA.original, columnId), getSortValue(rowB.original, columnId)),
      cell: (info) => {
        const cat = info.getValue();
        if (!cat) return <span className="text-muted-foreground">—</span>;
        const colorMap = {
          1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100',
          2: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 hover:bg-slate-100',
          3: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100',
        };
        return (
          <Badge className={`text-xs whitespace-nowrap ${colorMap[cat.id] ?? 'bg-muted text-muted-foreground'}`}>
            {cat.name}
          </Badge>
        );
      },
    }),
  ], [canViewOriginal, saveVersion, updateEdit]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Import Details"
        description={importRecord?.file_name ?? `Import #${id}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setFiltersOpen((prev) => !prev)}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {canViewOriginal && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Export Excel
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownloadSheet('hours')} className="cursor-pointer">
                    Hours
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownloadSheet('modified')} className="cursor-pointer">
                    Modified Hours
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownloadSheet('both')} className="cursor-pointer">
                    Both
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canViewOriginal && editedCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {editedCount} unsaved change{editedCount !== 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" onClick={discardChanges} disabled={isSaving}>
                  Discard
                </Button>
              </>
            )}
            {canViewOriginal && (
              <Button size="sm" onClick={saveChanges} disabled={editedCount === 0 || isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            )}
            {canViewOriginal && !isLocked && (
              <Button
                variant="success"
                size="sm"
                onClick={() => setIsPublishConfirmOpen(true)}
                disabled={editedCount > 0 || isSaving || publishMutation.isPending}
                title={editedCount > 0 ? 'Save your changes before publishing' : undefined}
              >
                Publish
              </Button>
            )}
            {canAddEntry && importRecord && !isLocked && (
              <Button size="sm" onClick={openAddRow}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Record
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => (editedCount > 0 ? setShowLeaveConfirm(true) : navigate(ROUTES.TIMESHEETS))}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Import summary card */}
      {importRecord && (
        <Card className="mb-5">
          <CardContent className="flex flex-wrap gap-6 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">File</p>
                <p className="text-sm font-medium truncate max-w-[240px]">{importRecord.file_name}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Imported By</p>
              <p className="text-sm font-medium">
                {importRecord.importer?.employee?.full_name ?? importRecord.importer?.email ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Imported At</p>
              <p className="text-sm tabular-nums">{formatDate(importRecord.created_at)}</p>
            </div>
            {canViewOriginal && (
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <PublishPill value={isLocked} />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Rows</p>
              <p className="text-sm tabular-nums">
                <span className="text-green-600 font-semibold">{importRecord.valid_rows}</span>
                <span className="text-muted-foreground"> / {importRecord.total_rows}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Employees</p>
              <p className="text-sm font-semibold tabular-nums">{employees.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="text-sm font-semibold tabular-nums">{totalHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collapsible filter panel — a hand-rolled duplicate of components/common/FilterPanel's
          collapse animation rather than that shared component itself, which is why it needed
          the same `shrink-0` fix applied separately: this div is a flex child of this page's own
          `flex h-full min-h-0 flex-col` root, right alongside DataTable's (deliberately
          shrinkable) root. Without `shrink-0`, a case where this page's total content (header +
          filters + table) exceeds the viewport would have the browser's flex-shrink squeeze this
          panel along with the table — and because it's `overflow-hidden` (required for the
          slide animation), that squeeze would clip whichever filter row didn't fit, instead of
          the table simply absorbing the shrink and scrolling internally. */}
      <div className={`shrink-0 overflow-hidden transition-all duration-500 ease-in-out ${filtersOpen ? 'max-h-[420px] opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'}`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Employee</Label>
            <SearchableSelect
              options={[
                { label: "All Employees", value: "all" },
                ...employees.map(emp => ({ label: emp, value: emp }))
              ]}
              value={employeeFilter}
              onValueChange={(v) => { setEmployeeFilter(v); setDetailPage(1); }}
              placeholder="All Employees"
              searchPlaceholder="Search employee..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Client</Label>
            <SearchableSelect
              options={[
                { label: "All Clients", value: "all" },
                ...clients.map(client => ({ label: client, value: client }))
              ]}
              value={clientFilter}
              onValueChange={(v) => { setClientFilter(v); setDetailPage(1); }}
              placeholder="All Clients"
              searchPlaceholder="Search client..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Category</Label>
            <SearchableSelect
              options={[
                { label: "All Categories", value: "all" },
                ...activeServiceCategories.map((sc) => ({
                  label: sc.name,
                  value: String(sc.id),
                })),
              ]}
              value={serviceCategoryFilter}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Type</Label>
            <SearchableSelect
              options={[
                { label: "All Types", value: "all" },
                ...filteredServiceTypes.map((t) => ({
                  label: t.service_type_name,
                  value: String(t.id),
                })),
              ]}
              value={serviceTypeFilter}
              onValueChange={handleTypeChange}
              placeholder="All Types"
              searchPlaceholder="Search type..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service PO</Label>
            <SearchableSelect
              options={[
                { label: "All Service POs", value: "all" },
                ...filteredPOOptions.map(po => ({ label: po.name, value: po.name }))
              ]}
              value={poFilter}
              onValueChange={(v) => { setPoFilter(v); setDetailPage(1); }}
              placeholder="All Service POs"
              searchPlaceholder="Search PO..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
        <div className="flex justify-end mb-2 gap-4">
          <p className="text-sm text-muted-foreground">
            {isFiltered ? 'Filtered total' : 'Total'}: <span className="font-semibold text-foreground tabular-nums">{filteredHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} hrs</span>
            {isFiltered && <span> across {filteredRows.length} rows</span>}
          </p>
          {canViewOriginal && (
            <p className="text-sm text-muted-foreground">
              Modified {isFiltered ? 'filtered total' : 'total'}: <span className="font-semibold text-foreground tabular-nums">{filteredModifiedHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} hrs</span>
            </p>
          )}
        </div>
        <DataTable
          columns={columns}
          data={pagedRows}
          isLoading={false}
          rowClassName={(row) => (dirtyRowIds.has(String(row.id)) ? 'bg-amber-50 dark:bg-amber-950/20' : '')}
          pagination={{
            page: detailPage,
            limit: detailPageSize,
            total: filteredRows.length,
          }}
          onPageChange={setDetailPage}
          onPageSizeChange={(s) => { setDetailPageSize(s); setDetailPage(1); }}
          sorting={sorting}
          onSortingChange={(s) => { setSorting(s); setDetailPage(1); }}
          toolbar={null}
        />
        </>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add New Record</DialogTitle>
            <DialogDescription>
              Add a single record to this import — {importRecord?.file_name ?? `Import #${id}`}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={activeEmployees.map((e) => ({
                  value: String(e.id),
                  label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ''}`,
                }))}
                value={addForm.employee_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, employee_id: v }))}
                placeholder="Select employee"
                searchPlaceholder="Search employee..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Service PO <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={servicePOOptions}
                value={addForm.service_po_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, service_po_id: v, sub_project_id: '' }))}
                placeholder="Select Service PO"
                searchPlaceholder="Search PO..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Sub-Project</Label>
              <SearchableSelect
                options={[
                  { label: 'None', value: '' },
                  ...addSubProjects.map((sp) => ({ value: String(sp.id), label: sp.sub_project_name })),
                ]}
                value={addForm.sub_project_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, sub_project_id: v }))}
                disabled={!addForm.service_po_id}
                placeholder="Select sub-project (optional)"
                searchPlaceholder="Search sub-project..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Hours Logged <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                className="h-9 text-sm"
                value={addForm.hours_logged}
                onChange={(e) => setAddForm((f) => ({ ...f, hours_logged: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={isSavingAdd}>
              {isSavingAdd ? 'Saving…' : 'Add New Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isPublishConfirmOpen}
        onOpenChange={setIsPublishConfirmOpen}
        title="Publish this timesheet?"
        description="Once published, this timesheet cannot be unpublished. Modified Hours can still be edited afterward; hours are not changed by publishing itself."
        confirmLabel="Publish"
        variant="default"
        onConfirm={handlePublish}
        isLoading={publishMutation.isPending}
      />

      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        title="Leave without saving?"
        description={unsavedChangesMessage}
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="destructive"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          navigate(ROUTES.TIMESHEETS, { replace: true });
        }}
      />
    </div>
  );
};

export default TimesheetImportDetail;
