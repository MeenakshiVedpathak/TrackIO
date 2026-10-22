import { useState, useRef, useMemo } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Download, Upload, CheckCircle2, AlertCircle, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useClients, useToggleClientStatus, useImportClients } from '@/hooks/useClients';
import { useCompanies } from '@/hooks/useCompanies';
import { clientsApi } from '@/api/clients.api';
import { useCanManageClientProjectPO } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import { getInitials } from '@/utils/formatters';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import SegmentedToggle from '@/components/common/SegmentedToggle';
import EmptyState from '@/components/common/EmptyState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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

// `canManage` is required, not optional: this toggle PATCHes client status, so a read-only role
// (e.g. Delivery Ops, documented as strictly view-only in roleHierarchy.js)
// must see the state but not be able to flip it.
const StatusToggle = ({ client, canManage }) => {
  const { mutate, isPending } = useToggleClientStatus();
  const { error: showError } = useNotification();
  const isActive = client.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending || !canManage}
        onCheckedChange={(checked) =>
          mutate(
            { id: client.id, status: checked ? 'active' : 'inactive' },
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

const ClientList = () => {
  const navigate = useNavigate();
  const { success, error: showError, warning } = useNotification();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const canManage = useCanManageClientProjectPO();

  // Defaults to newest-created first, not the backend's own default (id/creation order
  // ascending) — a freshly created client used to land wherever it fell in that order, often off
  // the first page entirely, reading as if the create had silently failed. Still a real column
  // sort, not a client-side reorder — the user can still click any header to sort by something
  // else, same as before.
  const [sorting, setSorting] = useState([{ id: 'created_at', desc: true }]);

  // BU filter, from the same shared hook every other Master screen uses (ProjectList,
  // ServicePOList, SubProjectList, ...) so availability can't drift between them.
  //
  // This screen previously gated the filter on canScopeAcrossBus() alone, which offered it to
  // Admin/Entity Admin only and sourced its options from GET /companies. That silently excluded
  // BU-SCOPED logins mapped to several BUs (BU Head, multi-BU BU Admin, Service PO Admin /
  // Delivery head): useCompanies is not theirs to read, so their option list was empty and the
  // control never rendered — even though, having more than one BU, they are exactly the users
  // with a choice to make. useMasterBuFilter resolves options per login kind (the BU master for
  // cross-BU logins, the login's own businessUnits[] for BU-scoped ones) and shows the control
  // whenever there is more than one BU to pick between.
  //
  // `buId` stays a pseudo-param: it rides inside the params object so it lands in the React
  // Query key and refetches on change, and clients.api.js turns it into ?company_id=<id>
  // (omitted for 'all'), which the backend accepts for BU-scoped callers too — narrowing to one
  // of their own mapped BUs.
  // Multi-select — backend support for entityIds/businessUnitIds has landed on GET /clients (see
  // BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md).
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter({ multiple: true });

  const params = {
    page,
    limit,
    // Only present while the filter is available; otherwise no company_id is sent at all and
    // the backend resolves scope from the token + X-Company-Id header as before.
    ...buParams,
    status: statusFilter,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useClients(params);
  const importMutation = useImportClients();
  const fileInputRef = useRef(null);

  // Clients only carry `company_id` (see ClientForm), not a nested `company`/entity relation, so
  // Business Unit / Entity Name are resolved against the company master here — same fallback
  // ServicePOList uses for its own BU Name column. Safe for any login this 403s for (BU-scoped
  // roles without company-listing standing): it just comes back empty and both columns show '—'.
  const { data: companiesForLookup } = useCompanies(
    { status: 'active', limit: 200 },
    { staleTime: 1000 * 60 * 10 }
  );
  const companyById = useMemo(() => {
    const map = new Map();
    (companiesForLookup?.data ?? []).forEach((c) => {
      map.set(String(c.id), {
        name: c.company_name ?? c.company_code ?? null,
        entityName: c.entity?.entity_name ?? null,
        // Sub BU column support — a Client's company_id can itself be a Sub-BU's id (2-level BU
        // hierarchy via parent_business_unit_id). Kept here so getSubBuName below only needs
        // companyById, same as getBuName/getEntityName.
        parentBuId: c.parent_business_unit_id ?? c.parent?.id ?? null,
      });
    });
    return map;
  }, [companiesForLookup]);

  // A Client's company_id can itself be a Sub-BU's id (2-level BU hierarchy via
  // parent_business_unit_id) — the "Business Unit" column must always show the top-level Parent BU
  // regardless (a Sub-BU showing up there reads as a completely different, unrelated BU, since it's
  // just another row's own name with no indication it's nested under anything). `subBuNameById` is
  // the Sub-BU's OWN name for the separate "Sub BU" column below, kept apart so neither column loses
  // information the other one needs. Same pattern as ServicePOList.jsx's buRootNameById/subBuNameById.
  const buRootNameById = useMemo(() => {
    const map = new Map();
    companyById.forEach((c, id) => {
      // Depth is capped at 2 levels (a Sub-BU can never itself have children — see
      // CompanyList.jsx), so a single parent lookup is always enough to reach the root.
      const root = c.parentBuId != null ? companyById.get(String(c.parentBuId)) : null;
      map.set(id, root ? root.name : c.name);
    });
    return map;
  }, [companyById]);
  const subBuNameById = useMemo(() => {
    const map = new Map();
    companyById.forEach((c, id) => {
      if (c.parentBuId != null) map.set(id, c.name);
    });
    return map;
  }, [companyById]);

  // Resolved through buRootNameById first — that map always walks up to the top-level Parent BU's
  // own name regardless of whether company_id points at a root BU or a Sub-BU. The embedded
  // `client.company` relation (whichever row company_id actually points to) is only a fallback for
  // while the company master itself is still loading.
  const getBuName = (client) =>
    buRootNameById.get(String(client.company_id)) ?? client.company?.company_name ?? null;
  const getEntityName = (client) =>
    client.company?.entity?.entity_name ?? companyById.get(String(client.company_id))?.entityName ?? null;
  // Sub BU is the client's own BU's name, shown ONLY when that BU itself has a parent (i.e. it is a
  // Sub-BU, not a top-level Parent) — mirrors getBuName's lookup but never walks up to the root.
  const getSubBuName = (client) => subBuNameById.get(String(client.company_id)) ?? null;

  const [previewData, setPreviewData] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [previewLimit, setPreviewLimit] = useState(5);
  const isImporting = importMutation.isPending;

  const clients = data?.data ?? [];
  const meta = data?.meta ?? {};

  const entityNameColumnWidth = useMemo(() => {
    const longest = clients.reduce((max, c) => Math.max(max, (getEntityName(c) ?? '').length), 0);
    return Math.min(320, Math.max(140, (longest * 7.5) + 40));
  }, [clients, companyById]);
  const businessUnitColumnWidth = useMemo(() => {
    const longest = clients.reduce((max, c) => Math.max(max, (getBuName(c) ?? '').length), 0);
    return Math.min(320, Math.max(150, (longest * 7.5) + 40));
  }, [clients, companyById]);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  // Edit is the actions column's only content, so for a read-only role the whole column is
  // dropped rather than rendered as a header over empty cells. That also shifts Client Name into
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
            onClick={() => navigate(buildPath(ROUTES.CLIENT_EDIT, { id: row.original.id }))}
            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    })] : []),
    columnHelper.accessor('client_name', {
      header: 'Client Name',
      size: 250,
      meta: { sticky: true, left: canManage ? 96 : 0 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="230px" className="font-medium" />,
    }),
    columnHelper.accessor('client_code', {
      // Fixed format CLT-YYYYMMDD-XXXX (17 chars) — sized to always show it in full rather
      // than truncating an identifier that's meant to be read/copied as-is.
      header: 'Client Code',
      size: 190,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="170px" />,
    }),
    columnHelper.accessor('industry', {
      header: 'Industry',
      size: 160,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    // Sized to the longest name actually on this page rather than a flat guess — both Entity and
    // BU names vary widely across tenants and a fixed width either clips long ones or wastes space
    // on short ones (same treatment as the equivalent columns on Timesheet Imports).
    columnHelper.display({
      id: 'entity_name',
      header: 'Entity Name',
      size: entityNameColumnWidth,
      cell: ({ row }) => <TruncatedCell value={getEntityName(row.original)} maxWidth={`${entityNameColumnWidth - 20}px`} />,
    }),
    columnHelper.display({
      id: 'business_unit',
      header: 'Business Unit',
      size: businessUnitColumnWidth,
      cell: ({ row }) => <TruncatedCell value={getBuName(row.original)} maxWidth={`${businessUnitColumnWidth - 20}px`} />,
    }),
    columnHelper.display({
      id: 'sub_bu_name',
      header: 'Sub BU',
      size: 150,
      cell: ({ row }) => <TruncatedCell value={getSubBuName(row.original)} maxWidth="130px" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle client={info.row.original} canManage={canManage} />,
    }),
    columnHelper.display({
      id: 'created_by',
      header: 'Created By',
      size: 170,
      cell: ({ row }) => <TruncatedCell value={row.original.creator?.full_name} maxWidth="150px" />,
    }),
  ];

  // Same template for every role now — "BU Name" only ever matches BUs the importing user
  // themselves owns (Admin/Entity Admin/Platform Admin) or is mapped to (BU Admin/PM and other
  // BU-scoped roles, whose own Sub-BUs are namable directly too), so there's nothing role-specific
  // left to vary in the columns, only in the help text below.
  const handleDownloadSample = () => {
    const rows = [
      // Row 1: a BU with no Sub-BUs — Sub BU stays blank.
      { 'Client Name': 'Acme Corp', 'Industry': 'Technology', 'BU Name': 'BU 1', 'Entity Name': '', 'Sub BU': '' },
      // Row 2: a BU that has Sub-BUs — Sub BU is required.
      { 'Client Name': 'Globex Ltd', 'Industry': 'Manufacturing', 'BU Name': 'BU 2', 'Entity Name': '', 'Sub BU': 'Sub BU 2a' },
      // Row 3: this BU Name happens to exist under more than one of the user's Entities — Entity
      // Name is required to pick which one.
      { 'Client Name': 'Initech LLC', 'Industry': 'Finance', 'BU Name': 'BU 3', 'Entity Name': 'Entity 1', 'Sub BU': '' },
      // Row 4 (Client only): BU Name left blank — the client is created with no Business Unit.
      { 'Client Name': 'No-BU Client', 'Industry': 'Retail', 'BU Name': '', 'Entity Name': '', 'Sub BU': '' },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.writeFile(wb, "client_sample.xlsx");
  };

  // The real backend caps `limit` at 200 per request (bakend/src/validations/clientValidation.js)
  // and rejects anything higher outright, so export pages through it instead of asking for
  // everything (e.g. meta.total) in one call.
  const EXPORT_PAGE_LIMIT = 200;

  const fetchAllClientsForExport = async (filterParams) => {
    const all = [];
    let clientPage = 1;
    let total = Infinity;
    while (all.length < total) {
      const res = await clientsApi.getAll({ ...filterParams, page: clientPage, limit: EXPORT_PAGE_LIMIT });
      const batch = res?.data ?? [];
      if (!batch.length) break;
      all.push(...batch);
      total = res?.meta?.total ?? all.length;
      clientPage += 1;
    }
    return all;
  };

  const handleExportExcel = async () => {
    try {
      const data = await fetchAllClientsForExport({
        status: statusFilter,
        ...buParams,
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      if (data.length === 0) {
        showError('No data to export.');
        return;
      }
      const exportData = data.map((c) => ({
        'Client Name': c.client_name,
        'Client Code': c.client_code,
        'Industry': c.industry,
        'Status': c.status,
        'Created By': c.creator?.full_name ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clients');
      XLSX.writeFile(wb, 'clients_export.xlsx');
      success('Exported to Excel successfully.');
    } catch (error) {
      console.error('Excel Export Error:', error);
      showError('Failed to export Excel.');
    }
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
        if (data.length > 0) {
          setPreviewData(data);
          setPreviewLimit(5);
          setPreviewFile(file);
          setIsPreviewOpen(true);
        }
      } catch (error) {
        showError('Failed to parse Excel file.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Shared by both the mutation's onSuccess and its onError-with-a-body branch below — either way
  // the response carries the same { total, imported, error_rows } shape, and either way the user
  // needs the same "how many actually made it in" toast, not just a silent result screen.
  const notifyImportResult = (result) => {
    const data = result?.data || result;
    const errors = data.error_rows || data.errors || data.failed || [];
    const total = data.total ?? data.total_processed ?? 0;
    const imported = data.imported ?? data.success_count ?? 0;
    if (errors.length > 0) {
      warning(`Imported ${imported} of ${total}. ${errors.length} row(s) need fixing — see Error Rows.`);
    } else {
      success(`Imported ${imported} of ${total} rows successfully.`);
    }
  };

  const handleConfirmImport = () => {
    if (!previewFile) return;

    importMutation.mutate(previewFile, {
      onSuccess: (res) => {
        setImportResult(res);
        notifyImportResult(res);
        setIsPreviewOpen(false);
        setPreviewFile(null);
        setPreviewData(null);
      },
      onError: (err) => {
        if (err?.response?.status === 403) {
          showError(extractApiError(err));
        } else if (err.response?.data) {
          setImportResult(err.response.data);
          notifyImportResult(err.response.data);
          setIsPreviewOpen(false);
          setPreviewFile(null);
          setPreviewData(null);
        } else {
          showError(extractApiError(err));
        }
      }
    });
  };

  const renderImportResults = () => {
    if (!importResult) return null;

    const data = importResult.data || importResult;
    const errors = data.error_rows || data.errors || data.failed || [];
    const total = data.total ?? data.total_processed ?? 0;
    const imported = data.imported ?? data.success_count ?? 0;
    // `skipped` (from the API) counts DUPLICATE rows only — validation errors (BU not found, Sub
    // BU required, Client Name required, etc.) come back in `errors` with `skipped` still 0. The
    // error table used to be gated on `skipped > 0`, so a sheet that was 100% validation errors
    // (no duplicates at all) rendered NO error table and just "0 imported" with nothing to explain
    // why — this is what actually needs fixing, not skipped.
    const skipped = data.skipped ?? data.error_count ?? 0;
    // Rows that failed for a reason OTHER than "duplicate" — a plain validation failure.
    const failed = Math.max(0, errors.length - skipped);

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
              {skipped} duplicates skipped
            </Badge>
          )}
          {failed > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {failed} failed
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
                        <TableCell className="font-mono text-xs align-top">
                          {row.row ?? row.rowNumber ?? row.row_number ?? idx + 1}
                        </TableCell>
                        <TableCell className="text-sm text-destructive whitespace-pre-line">
                          {row.errors?.length > 0
                            ? row.errors.join('\n')
                            : row.message ?? row.error_message ?? row.error ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {errors.length === 0 && (
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
        title="Clients"
        description="Manage client accounts"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <SearchInput
                placeholder="Search clients…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-[250px]"
                inputClassName="bg-white"
              />
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {clients.length > 0 && (
                <Button variant="outline" size="toolbar" onClick={handleExportExcel}>
                  <Download className="h-4 w-4" /> Export Excel
                </Button>
              )}
              {canManage && (
                <>
                  <Button variant="outline" size="toolbar" onClick={handleDownloadSample}>
                    <Download className="h-4 w-4" /> Sample
                  </Button>
                  <Button
                    variant="outline"
                    size="toolbar"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    <Upload className="h-4 w-4" />
                    {isImporting ? 'Importing…' : 'Import Excel'}
                  </Button>
                </>
              )}
              {canManage && !isPreviewOpen && !importResult && (
                <Button size="toolbar" onClick={() => navigate(ROUTES.CLIENT_NEW)}>
                  <Plus className="h-4 w-4" /> Add Client
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters/more
                move into their own row below the header (see the md:hidden block after
                PageHeader). */}
            {canManage && !isPreviewOpen && !importResult && (
              <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.CLIENT_NEW)}>
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

      {/* Mobile toolbar — client count, full-width search, and a compact Filters + More row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? clients.length} client{(meta.total ?? clients.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search clients..."
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
          {(clients.length > 0 || canManage) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="toolbar" className="h-10 bg-white">
                  <MoreVertical className="h-4 w-4" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {clients.length > 0 && (
                  <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                    <Download className="h-4 w-4" /> Export Excel
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuItem onClick={handleDownloadSample} className="cursor-pointer">
                      <Download className="h-4 w-4" /> Sample
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer"
                      disabled={isImporting}
                    >
                      <Upload className="h-4 w-4" /> {isImporting ? 'Importing…' : 'Import Excel'}
                    </DropdownMenuItem>
                  </>
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
          <SegmentedToggle
            options={[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(1); }}
            className="bg-white"
          />
        </div>
      </FilterPanel>

      {importResult ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Import Results</h3>
            <Button variant="outline" onClick={() => setImportResult(null)}>
              Back to Clients
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
                            onClick={() => setPreviewLimit(prev => Math.min(prev + 10, previewData.length - 1))}
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
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirmImport} disabled={isImporting}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isImporting ? 'Importing…' : 'Confirm Import'}
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
            data={clients}
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
            onRowClick={canManage ? (row) => navigate(buildPath(ROUTES.CLIENT_EDIT, { id: row.id })) : undefined}
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
              ) : clients.length === 0 ? (
                <EmptyState title="No records found" description="Try adjusting your search or filters." />
              ) : (
                clients.map((client) => (
                  <div
                    key={client.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                      canManage && 'active:bg-slate-50'
                    )}
                    onClick={canManage ? () => navigate(buildPath(ROUTES.CLIENT_EDIT, { id: client.id })) : undefined}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback>{getInitials(client.client_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{client.client_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {client.client_code}
                        {' · '}
                        <span className={client.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                          {client.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </p>
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
                          <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.CLIENT_EDIT, { id: client.id }))}>
                            <Pencil className="h-4 w-4" /> Edit Client
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
        </>
      )}

      <Outlet />
    </div>
  );
};

export default ClientList;
