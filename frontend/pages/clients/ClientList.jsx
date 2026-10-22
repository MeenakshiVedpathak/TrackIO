import { useState, useRef } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Download, Upload, CheckCircle2, AlertCircle, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useClients, useToggleClientStatus, useImportClients } from '@/hooks/useClients';
import { clientsApi } from '@/api/clients.api';
import { useCanWrite } from '@/hooks/usePermissions';
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

const StatusToggle = ({ client }) => {
  const { mutate, isPending } = useToggleClientStatus();
  const isActive = client.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          mutate({ id: client.id, status: checked ? 'active' : 'inactive' })
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
  const { success, error: showError } = useNotification();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const canManage = useCanWrite();

  const [sorting, setSorting] = useState([]);

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
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter();

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

  const [previewData, setPreviewData] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [previewLimit, setPreviewLimit] = useState(5);
  const isImporting = importMutation.isPending;

  const clients = data?.data ?? [];
  const meta = data?.meta ?? {};

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  const columns = [
    columnHelper.display({
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
    }),
    columnHelper.accessor('client_name', {
      header: 'Client Name',
      size: 250,
      meta: { sticky: true, left: 96 },
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
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      cell: (info) => <StatusToggle client={info.row.original} />,
    }),
  ];

  const handleDownloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([{
      'Client Name': 'Acme Corp',
      'Industry': 'Technology'
    }]);
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

  const handleConfirmImport = () => {
    if (!previewFile) return;

    importMutation.mutate(previewFile, {
      onSuccess: (res) => {
        setImportResult(res);
        setIsPreviewOpen(false);
        setPreviewFile(null);
        setPreviewData(null);
      },
      onError: (err) => {
        if (err.response?.data) {
          setImportResult(err.response.data);
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
    const skipped = data.skipped ?? data.error_count ?? errors.length ?? 0;

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
              {skipped} skipped
            </Badge>
          )}
        </div>

        {skipped > 0 && errors.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error Rows ({skipped})
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
                        <TableCell className="font-mono text-xs">
                          {row.row ?? row.rowNumber ?? row.row_number ?? idx + 1}
                        </TableCell>
                        <TableCell className="text-sm text-destructive">
                          {row.errors?.length > 0
                            ? row.errors.join(', ')
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

        {skipped === 0 && (
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
            className="h-10"
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
          <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} />
        )}
        {showBuFilter && (
          <BusinessUnitFilter value={buId} entityId={entityId} onChange={(v) => { setBuId(v); setPage(1); }} />
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
            <div className="overflow-auto max-h-[60vh]">
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
            onRowClick={(row) => navigate(buildPath(ROUTES.CLIENT_EDIT, { id: row.id }))}
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
                      'active:bg-slate-50'
                    )}
                    onClick={() => navigate(buildPath(ROUTES.CLIENT_EDIT, { id: client.id }))}
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
                    {/* Edit is not gated by canManage here — mirrors the desktop actions column,
                        which renders this same ghost icon button unconditionally. */}
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
