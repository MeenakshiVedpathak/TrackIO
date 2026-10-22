import { useState, useRef } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Download, Upload, CheckCircle2, AlertCircle, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useProjects, useToggleProjectStatus, useImportProjects } from '@/hooks/useProjects';
import { projectsApi } from '@/api/projects.api';
import { useCanManageClientProjectPO } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { useDebounce } from '@/hooks/useDebounce';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatDate, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
 
const columnHelper = createColumnHelper();

// Mirrors every column the table itself shows (minus Actions, which has nothing to export) —
// "Business Unit"/"Sub BU" resolve the same way the `creator_bu`/`creator_sub_bu` display columns
// below do, off the row's own `creator` relation, so the two never drift apart.
const exportProjectsToExcel = (rows) => {
  const header = [
    'Project Name', 'Project Code', 'Client', 'Business Unit', 'Sub BU', 'Created By',
    'Description', 'Status', 'Total Service POs', 'Created Date',
  ];
  const dataRows = rows.map((r) => {
    const creator = r.creator;
    const buEntry = creator?.business_units?.find((bu) => bu.id === creator.company_id);
    const rootName = buEntry?.parent_business_unit_name ?? buEntry?.name ?? creator?.company_name ?? '';
    const subBuName = buEntry?.parent_business_unit_id != null ? buEntry.name : '';
    return [
      r.project_name ?? '',
      r.project_code ?? '',
      r.client_name ?? r.client?.client_name ?? '',
      rootName,
      subBuName,
      creator?.full_name ?? '',
      r.project_description ?? '',
      r.status ?? '',
      r.total_service_pos ?? 0,
      r.created_at ? formatDate(r.created_at) : '',
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Projects');
  XLSX.writeFile(wb, 'Projects.xlsx');
};

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn("text-sm truncate", className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};
 
// `canManage` is required, not optional: this toggle PATCHes project status, so a read-only role
// (e.g. Delivery Ops, documented as strictly view-only in roleHierarchy.js)
// must see the state but not be able to flip it.
const StatusToggle = ({ project, canManage }) => {
  const { mutate, isPending } = useToggleProjectStatus();
  const { error: showError } = useNotification();
  const isActive = project.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending || !canManage}
        onCheckedChange={(checked) =>
          mutate(
            { id: project.id, status: checked ? 'active' : 'inactive' },
            { onError: (err) => showError(extractApiError(err)) }
          )
        }
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};
 
const ProjectList = () => {
  const navigate = useNavigate();
  const { error: showError } = useNotification();
 
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
 
  const debouncedSearch = useDebounce(search, 400);
  const canManage = useCanManageClientProjectPO();

  // Defaults to newest-created first, not the backend's own default (id/creation order
  // ascending) — a freshly created project used to land wherever it fell in that order, often off
  // the first page entirely, reading as if the create had silently failed. Still a real column
  // sort, not a client-side reorder — the user can still click any header to sort by something
  // else, same as ClientList.jsx's own fix for this.
  const [sorting, setSorting] = useState([{ id: 'created_at', desc: true }]);
 
  const importMutation = useImportProjects();
  const fileInputRef = useRef(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [previewLimit, setPreviewLimit] = useState(5);
 
  // Business Unit filter. Renders only for a login mapped to more than one BU, and starts on
  // "All Business Units" — the list opens cross-BU and narrowing to one is an explicit choice.
  // Multi-select is live for THIS screen only — backend support for entityIds/businessUnitIds
  // has only landed on /projects so far (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md). Every
  // other Master screen keeps calling useMasterBuFilter() with its default single-select mode.
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter({ multiple: true });

  const params = {
    page,
    limit,
    ...buParams,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sort_by: sorting[0].id, sort_order: sorting[0].desc ? 'DESC' : 'ASC' }),
  };
 
  const { data, isPending } = useProjects(params);

  const projects = data?.data ?? [];
  const meta = data?.meta ?? {};

  const [exporting, setExporting] = useState(false);

  // Export pulls every matching record (not just the current page) — paged in EXPORT_PAGE_LIMIT
  // chunks rather than one `limit: total` request, since the backend hard-caps `limit` at 100 and
  // silently truncates anything above that (same reasoning as ServicePOList.jsx's own export).
  const EXPORT_PAGE_LIMIT = 100;
  const handleExport = async () => {
    setExporting(true);
    try {
      const first = await projectsApi.getAll({ ...params, page: 1, limit: EXPORT_PAGE_LIMIT });
      const totalRows = first?.meta?.total ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalRows / EXPORT_PAGE_LIMIT));
      const all = Array.isArray(first?.data) ? [...first.data] : [];
      for (let p = 2; p <= totalPages; p++) {
        const res = await projectsApi.getAll({ ...params, page: p, limit: EXPORT_PAGE_LIMIT });
        if (Array.isArray(res?.data)) all.push(...res.data);
      }
      exportProjectsToExcel(all);
    } finally {
      setExporting(false);
    }
  };
 
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };
 
  // Edit is the actions column's only content, so for a read-only role the whole column is
  // dropped rather than rendered as a header over empty cells. That also shifts Project Name into
  // the freed sticky slot — `meta.left` offsets are hand-maintained against the columns actually
  // present, so they have to follow whether Actions is there or not.
  const columns = [
    ...(canManage ? [columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 96,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(buildPath(ROUTES.PROJECT_EDIT, { id: row.original.id }))}
            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    })] : []),
    columnHelper.accessor('project_name', {
      header: 'Project Name',
      size: 250,
      meta: { sticky: true, left: canManage ? 96 : 0 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="230px" className="font-medium" />,
    }),
    columnHelper.accessor('project_code', {
      header: 'Project Code',
      size: 190,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="170px" />,
    }),
    columnHelper.display({
      id: 'client',
      header: 'Client',
      size: 200,
      cell: ({ row }) => (
        <TruncatedCell value={row.original.client_name ?? row.original.client?.client_name} maxWidth="180px" />
      ),
    }),
    // A Project's own "Business Unit" reads as whichever BU its CREATOR belongs to, not the
    // Project's own `company`/`company_id` (both exist on the row, but product intent here is
    // "e.g. a Project created by a UV Tech BU Admin should show UV Tech") — resolved off the
    // `creator` object the backend now includes (see BACKEND_CREATED_BY_AND_PROJECT_BU_PROMPT.md).
    // The creator's OWN entry in `creator.business_units` (matched by `creator.company_id`)
    // already carries that BU's own parent info, so Sub BU needs no extra lookup/request either.
    columnHelper.display({
      id: 'creator_bu',
      header: 'Business Unit',
      size: 180,
      cell: ({ row }) => {
        const creator = row.original.creator;
        const buEntry = creator?.business_units?.find((bu) => bu.id === creator.company_id);
        const rootName = buEntry?.parent_business_unit_name ?? buEntry?.name ?? creator?.company_name;
        return <TruncatedCell value={rootName} maxWidth="160px" />;
      },
    }),
    columnHelper.display({
      id: 'creator_sub_bu',
      header: 'Sub BU',
      size: 150,
      cell: ({ row }) => {
        const creator = row.original.creator;
        const buEntry = creator?.business_units?.find((bu) => bu.id === creator.company_id);
        const subBuName = buEntry?.parent_business_unit_id != null ? buEntry.name : null;
        return <TruncatedCell value={subBuName} maxWidth="130px" />;
      },
    }),
    columnHelper.display({
      id: 'created_by',
      header: 'Created By',
      size: 170,
      cell: ({ row }) => <TruncatedCell value={row.original.creator?.full_name} maxWidth="150px" />,
    }),
    columnHelper.accessor('project_description', {
      header: 'Description',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" className="text-muted-foreground" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle project={info.row.original} canManage={canManage} />,
    }),
    columnHelper.accessor('total_service_pos', {
      header: 'Total Service POs',
      size: 150,
      cell: (info) => <span className="text-sm font-medium">{info.getValue() ?? 0}</span>,
    }),
    columnHelper.accessor('created_at', {
      header: 'Created Date',
      size: 140,
      cell: (info) => formatDate(info.getValue()),
    }),
  ];
 
  // Row 1 carries every column in order, which is what fixes the header order for the whole
  // sheet — json_to_sheet takes its columns from the keys as first seen.
  //
  // Same template for every role now — "BU Name" only ever matches BUs the importing user
  // themselves owns (Admin/Entity Admin/Platform Admin) or is mapped to (BU Admin/PM and other
  // BU-scoped roles, whose own Sub-BUs are namable directly too), so there's nothing role-specific
  // left to vary in the columns, only in the help text below.
  const handleDownloadSample = () => {
    const rows = [
      // Row 1: a BU with no Sub-BUs — Sub BU stays blank.
      {
        'Project Name': 'Website Revamp',
        'Project Code': '',
        'Client Code': '',
        'Client Name': 'Acme Corporation',
        'Description': 'Q3 marketing site redesign',
        'Status': 'active',
        'BU Name': 'BU 1',
        'Entity Name': '',
        'Sub BU': '',
      },
      // Row 2: a BU that has Sub-BUs — Sub BU is required.
      {
        'Project Name': 'Mobile App Rollout',
        'Project Code': 'PRJ-MOBILE-01',
        'Client Code': 'CLT-20240615-B7M2',
        'Client Name': '',
        'Description': 'iOS/Android release',
        'Status': 'active',
        'BU Name': 'BU 2',
        'Entity Name': '',
        'Sub BU': 'Sub BU 2a',
      },
      // Row 3: this BU Name happens to exist under more than one of the user's Entities — Entity
      // Name is required to pick which one.
      {
        'Project Name': 'Data Migration',
        'Project Code': '',
        'Client Code': '',
        'Client Name': 'Globex Inc',
        'Description': '',
        'Status': 'inactive',
        'BU Name': 'BU 3',
        'Entity Name': 'Entity 1',
        'Sub BU': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    XLSX.writeFile(wb, 'project_sample.xlsx');
  };
 
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
 
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length === 0) {
          showError('That file has no rows to import.');
          return;
        }
        setPreviewData(data);
        setPreviewLimit(5);
        setPreviewFile(file);
        setIsPreviewOpen(true);
      } catch (error) {
        showError('Failed to parse Excel file.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    // Mirrors the parse path's input reset — without it, re-picking the file that just failed
    // fires no change event and the button looks dead.
    reader.onerror = () => {
      showError('Failed to read the selected file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };
 
  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
    setPreviewData(null);
  };
 
  const handleConfirmImport = () => {
    if (!previewFile) return;
 
    importMutation.mutate(previewFile, {
      onSuccess: (res) => {
        setImportResult(res);
        closePreview();
      },
      onError: (err) => {
        if (err?.response?.status === 403) {
          showError(extractApiError(err));
          return;
        }
        // Row-level rejections can come back on a 4xx body too, so a structured response is a
        // result to render, not a toast.
        if (err.response?.data) {
          setImportResult(err.response.data);
          closePreview();
        } else {
          showError(extractApiError(err));
        }
      },
    });
  };
 
  const renderImportResults = () => {
    if (!importResult) return null;
 
    const data = importResult.data || importResult;
    const errors = data.error_rows || [];
    const total = data.total ?? 0;
    const imported = data.imported ?? 0;
    // The server's own count drives the badge; error_rows only drives the table under it.
    const skipped = data.skipped ?? errors.length;
 
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">Total rows:</span>
            <span className="font-mono text-xs font-semibold">{total}</span>
          </div>
          <Badge className="gap-1.5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {imported} imported
          </Badge>
          {skipped > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {skipped} skipped / failed
            </Badge>
          )}
        </div>
 
        {errors.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error Rows ({errors.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-destructive/5">
                      <TableHead className="w-24 sticky top-0 bg-red-50">Row #</TableHead>
                      <TableHead className="sticky top-0 bg-red-50">Error Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errors.map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-destructive/5">
                        <TableCell className="font-mono text-xs">{row.row_number ?? idx + 1}</TableCell>
                        <TableCell className="text-sm text-destructive">
                          {row.errors?.length > 0 ? row.errors.join(', ') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
 
        {skipped === 0 && errors.length === 0 && (
          <div className="text-center py-8 text-green-600 bg-green-50 rounded-md border border-green-100">
            All records were imported successfully!
          </div>
        )}
      </div>
    );
  };
 
  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Projects"
        description="Manage projects"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-3 md:flex">
              <SearchInput
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search projects…"
                className="w-[250px]"
                inputClassName="bg-white"
              />
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {projects.length > 0 && (
                <Button variant="outline" size="toolbar" className="bg-white" onClick={handleExport} disabled={exporting}>
                  <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
                </Button>
              )}
              {canManage && (
                <Button variant="outline" size="toolbar" className="bg-white" onClick={handleDownloadSample}>
                  <Download className="h-4 w-4" /> Sample
                </Button>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="toolbar"
                  className="bg-white"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                >
                  <Upload className="h-4 w-4" />
                  {importMutation.isPending ? 'Importing…' : 'Import Excel'}
                </Button>
              )}
              {canManage && (
                <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.PROJECT_NEW)}>
                  <Plus className="h-4 w-4" /> Add Project
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters/more
                move into their own row below the header (see the md:hidden block after
                PageHeader). */}
            {canManage && (
              <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white md:hidden" onClick={() => navigate(ROUTES.PROJECT_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
            {/* The Import Excel file input must stay mounted (not conditionally rendered only in
                the desktop block above) so both the desktop button and the mobile "More" menu
                item can trigger the same ref-driven picker. */}
            {canManage && (
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx,.csv"
                onChange={handleFileUpload}
              />
            )}
          </>
        }
      />

      {/* Mobile toolbar — project count, full-width search, and a compact Filters + More row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? projects.length} project{(meta.total ?? projects.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search projects..."
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
          />
          {(projects.length > 0 || canManage) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="toolbar" className="h-10 bg-white">
                  <MoreVertical className="h-4 w-4" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {projects.length > 0 && (
                  <DropdownMenuItem onClick={handleExport} disabled={exporting} className="cursor-pointer">
                    <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onClick={handleDownloadSample} className="cursor-pointer">
                    <Download className="h-4 w-4" /> Sample
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer"
                    disabled={importMutation.isPending}
                  >
                    <Upload className="h-4 w-4" /> {importMutation.isPending ? 'Importing…' : 'Import Excel'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        {showEntityFilter && (
          <EntityFilter multiple value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} />
        )}
        {showBuFilter && (
          <BusinessUnitFilter multiple value={buId} entityId={entityId} onChange={(v) => { setBuId(v); setPage(1); }} />
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white">
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
 
      {importResult ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Import Results</h3>
            <Button variant="outline" onClick={() => setImportResult(null)}>
              Back to Projects
            </Button>
          </div>
          {renderImportResults()}
        </div>
      ) : isPreviewOpen ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-lg font-medium text-slate-800">Preview Import Data</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[min(518px,60vh)]">
              {previewData && previewData.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {previewData[0]?.map((header, i) => (
                        <TableHead key={i} className="whitespace-nowrap font-semibold sticky top-0 bg-muted/50">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(1, previewLimit + 1).map((row, i) => (
                      <TableRow key={i}>
                        {previewData[0].map((_, colIndex) => (
                          <TableCell key={colIndex} className="whitespace-nowrap py-3 text-sm">
                            {row[colIndex] != null ? row[colIndex].toString() : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {previewData.length > previewLimit + 1 && (
                      <TableRow>
                        <TableCell colSpan={previewData[0].length} className="text-center bg-muted/10 py-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => setPreviewLimit((prev) => Math.min(prev + 10, previewData.length - 1))}
                          >
                            Show more rows ({previewData.length - previewLimit - 1} remaining)
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-3 bg-muted/10">
              <Button variant="outline" onClick={closePreview} disabled={importMutation.isPending}>
                Cancel
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirmImport} disabled={importMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {importMutation.isPending ? 'Importing…' : 'Confirm Import'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table — unchanged, including frozen/sticky columns. */}
          <DataTable
            className="hidden md:flex"
            columns={columns}
            data={projects}
            isLoading={isPending}
            toolbar={null}
            pagination={
              meta.total != null
                ? {
                    page: meta.page ?? page,
                    limit: meta.limit ?? limit,
                    total: meta.total,
                  }
                : undefined
            }
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1); }}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
            onRowClick={canManage ? (row) => navigate(buildPath(ROUTES.PROJECT_EDIT, { id: row.id })) : undefined}
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
              ) : projects.length === 0 ? (
                <EmptyState title="No records found" description="Try adjusting your search or filters." />
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                      canManage && 'active:bg-slate-50'
                    )}
                    onClick={canManage ? () => navigate(buildPath(ROUTES.PROJECT_EDIT, { id: project.id })) : undefined}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback>{getInitials(project.project_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{project.project_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {project.project_code}
                        {' · '}
                        <span className={project.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                          {project.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                      {(project.client_name ?? project.client?.client_name) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {project.client_name ?? project.client?.client_name}
                        </p>
                      )}
                    </div>
                    {/* Edit-only menu, so it's dropped entirely for a read-only role rather than
                        opening to a single action that role isn't allowed to take. */}
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
                          <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.PROJECT_EDIT, { id: project.id }))}>
                            <Pencil className="h-4 w-4" /> Edit Project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
        </>
      )}
 
      <Outlet />
    </div>
  );
};
 
export default ProjectList;
 
 