import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate, useSearchParams, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Eye, Download, Upload, Users, GitBranch, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useServicePOs } from '@/hooks/useServicePOs';
import { servicePOsApi } from '@/api/servicePOs.api';
import { useActiveClients } from '@/hooks/useClients';
import { useCompanies } from '@/hooks/useCompanies';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useCanWrite } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { NO_COMPANY_ROLES, ROLE_NAMES } from '@/constants/roleHierarchy';
import { downloadServicePoSample } from '@/utils/servicePoSample';
import { useDebounce } from '@/hooks/useDebounce';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatCurrency, formatDate, getInitials } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import ServicePOHierarchyDrawer from './ServicePOHierarchyDrawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
import { getAncestors, servicePOSearchValue, sortServicePOsHierarchically } from '@/utils/servicePOHierarchy';

const columnHelper = createColumnHelper();

const exportToExcel = (rows, categoryByTypeId) => {
  const header = [
    'Service PO Number', 'Service PO Name', 'Client', 'Project', 'Service Category', 'Service Type', 'Account Manager',
    'Description', 'PO Value', 'Invoice Frequency', 'Invoice Amount',
    'Start Date', 'End Date', 'Status',
  ];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client?.client_name ?? '',
    r.project?.project_name ?? '',
    categoryByTypeId.get(String(r.serviceType?.id)) ?? '',
    r.serviceType?.service_type_name ?? '',
    r.account_manager ?? '',
    r.service_description ?? '',
    r.po_value != null ? Number(r.po_value) : '',
    r.invoice_frequency ?? '',
    r.invoice_amount != null ? Number(r.invoice_amount) : '',
    r.start_date ? formatDate(r.start_date) : '',
    r.end_date ? formatDate(r.end_date) : '',
    r.status ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service POs');
  XLSX.writeFile(wb, 'Service_POs.xlsx');
};

const TruncatedCell = ({ value, maxWidth = '150px', className, wrap = false }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  if (wrap) {
    return (
      <div className={cn("text-sm whitespace-normal break-words leading-snug py-1", className)} style={{ maxWidth }}>
        {value}
      </div>
    );
  }
  return (
    <div className={cn("text-sm truncate", className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

const ServicePOList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasRole } = useAuth();
  // Cosmetic only — picks the admin (per-row "BU Name") template vs the BU-scoped one; the
  // backend enforces the real BU authorization per row.
  const isCompanyLessActor = hasRole(...NO_COMPANY_ROLES);
  // An Admin's list is deliberately NOT narrowed by the global BU switcher (see
  // servicePOs.api.js's crossBuScopeForAdmin) — they get every BU's POs at once, so they're the
  // only role that needs a BU filter of their own here. Every other role, BU Admin included, is
  // already scoped to one BU by the switcher, which makes the filter redundant for them.
  const isAdminActor = hasRole(ROLE_NAMES.ADMIN);
  const { data: companiesData } = useCompanies({ limit: 200 }, { enabled: isCompanyLessActor });
  // List rows aren't guaranteed to embed the company relation, so resolve company_id against the
  // BU list as a fallback.
  const buNameById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => map.set(String(c.id), c.company_name));
    return map;
  }, [companiesData]);
  // Admin's own Entity step, paired with the Admin-only "Business Unit" select below — narrows
  // which BUs that dropdown offers. companiesData already carries entity_id/entity per BU (same
  // company master every other Entity+BU filter pair derives entity info from), so no extra fetch.
  const [adminEntityFilter, setAdminEntityFilter] = useState('all');
  const adminBuEntityOptions = useMemo(() => {
    const byId = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      const id = c.entity_id ?? c.entity?.id;
      const name = c.entity?.entity_name;
      if (id != null && name && !byId.has(id)) byId.set(id, { id, name });
    });
    return Array.from(byId.values());
  }, [companiesData]);
  const companiesForAdminEntity = useMemo(
    () => (adminEntityFilter === 'all'
      ? (companiesData?.data ?? [])
      : (companiesData?.data ?? []).filter((c) => String(c.entity_id ?? c.entity?.id) === String(adminEntityFilter))),
    [companiesData, adminEntityFilter]
  );
  const buOptions = useMemo(
    () => [
      { label: 'All BUs', value: 'all' },
      ...companiesForAdminEntity.map((c) => ({ label: c.company_name, value: String(c.id) })),
    ],
    [companiesForAdminEntity]
  );
  const [searchParams] = useSearchParams();
  const categoryIdParam = searchParams.get('service_category_id');
  const servicePoIdParam = searchParams.get('service_po_id');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState(categoryIdParam || 'all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [poFilter, setPoFilter] = useState(servicePoIdParam || 'all');
  const [buFilter, setBuFilter] = useState('all');
  // Same problem the Timesheet Imports Entity filter had: this endpoint has no way to scope a
  // single request to "every BU under this Entity" (only one company_id, or every reachable BU),
  // so picking an Entity while "All BUs" stayed selected would silently keep showing every BU
  // across every Entity rather than narrowing. Require an explicit BU pick when the selected
  // Entity has more than one, and auto-pick it when there's only one (effect below).
  const needsAdminBuChoice = isAdminActor && adminEntityFilter !== 'all' && buFilter === 'all' && companiesForAdminEntity.length > 1;
  const [filtersOpen, setFiltersOpen] = useState(!!categoryIdParam || !!servicePoIdParam);
  const [exporting, setExporting] = useState(false);
  const [hierarchyTarget, setHierarchyTarget] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const canManage = useCanWrite();

  const [sorting, setSorting] = useState([]);

  // Every non-Admin role reaches Service POs through the X-Company-Id header, so a login mapped
  // to more than one BU gets the standard master BU filter here. An Admin is excluded: their list
  // is deliberately cross-BU (crossBuScopeForAdmin) and they narrow with the ?company_id filter
  // below instead — running both would fight over the same axis.
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter({ enabled: !isAdminActor });

  const params = {
    page,
    limit,
    ...buParams,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(clientFilter !== 'all' && { client_id: clientFilter }),
    ...(categoryFilter !== 'all' && { service_category_id: categoryFilter }),
    ...(typeFilter !== 'all' && { service_type_id: typeFilter }),
    ...(poFilter !== 'all' && { service_po_id: poFilter }),
    // Admin-only, and the only BU narrowing they get — no X-Company-Id is sent for them.
    ...(isAdminActor && buFilter !== 'all' && { company_id: buFilter }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  useEffect(() => {
    if (isAdminActor && adminEntityFilter !== 'all' && buFilter === 'all' && companiesForAdminEntity.length === 1) {
      setBuFilter(String(companiesForAdminEntity[0].id));
    }
  }, [isAdminActor, adminEntityFilter, buFilter, companiesForAdminEntity]);

  const { data, isPending } = useServicePOs(params, { enabled: !needsAdminBuChoice });
  const { data: clients = [] } = useActiveClients();
  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: serviceTypes = [] } = useActiveServiceTypes();
  const { data: serviceCategories = [] } = useActiveServiceCategories();

  const servicePOs = data?.data ?? [];
  const meta = data?.meta ?? {};

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = categoryFilter === 'all'
    ? serviceTypes
    : serviceTypes.filter((t) => String(t.service_category_id) === categoryFilter);

  // Type (or Category, if no type chosen yet) → Service PO
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    serviceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [serviceTypes]);

  // Service type id → category name, for the export (list API doesn't nest category under serviceType)
  const categoryNameByTypeId = useMemo(() => {
    const categoryNameById = new Map(serviceCategories.map((c) => [String(c.id), c.name]));
    const map = new Map();
    serviceTypes.forEach((t) => map.set(String(t.id), categoryNameById.get(String(t.service_category_id)) ?? ''));
    return map;
  }, [serviceTypes, serviceCategories]);

  const filteredPOs = sortServicePOsHierarchically(
    activePOs.filter((po) => {
      const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
      if (typeFilter !== 'all') return poTypeId === typeFilter;
      if (categoryFilter !== 'all') return poTypeId != null && typeCategoryMap.get(poTypeId) === categoryFilter;
      return true;
    })
  );

  const handleCategoryChange = (v) => {
    setCategoryFilter(v);
    setTypeFilter('all');
    setPoFilter('all');
    setPage(1);
  };

  const handleTypeChange = (v) => {
    setTypeFilter(v);
    setPoFilter('all');
    setPage(1);
  };

  const activeFilterCount = [
    clientFilter !== 'all' ? 1 : 0,
    categoryFilter !== 'all' ? 1 : 0,
    typeFilter !== 'all' ? 1 : 0,
    poFilter !== 'all' ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
    isAdminActor && buFilter !== 'all' ? 1 : 0,
    isAdminActor && adminEntityFilter !== 'all' ? 1 : 0,
    isEntityFiltered ? 1 : 0,
    isBuFiltered ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setClientFilter('all');
    setCategoryFilter('all');
    setTypeFilter('all');
    setPoFilter('all');
    setStatusFilter('all');
    setBuFilter('all');
    setAdminEntityFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  // Export pulls every matching record (not just the current page) with one extra request.
  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await servicePOsApi.getAll({ ...params, page: 1, limit: total });
      const all = Array.isArray(res?.data) ? res.data : [];
      exportToExcel(all, categoryNameByTypeId);
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 160,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            title="View"
            onClick={() => navigate(buildPath(ROUTES.SERVICE_PO_DETAIL, { id: row.original.id }))}
            className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            <Eye className="h-3 w-3" />
          </Button>
          {canManage && (
            <Button
              size="sm"
              title="Map Employees"
              // `from` is what the mapping screen's Back button returns to — without it that
              // screen falls back to the PO detail page, which is not where this click came from.
              onClick={() => navigate(
                buildPath(ROUTES.SERVICE_PO_MAP_EMPLOYEES, { id: row.original.id }),
                { state: { from: location.pathname + location.search } }
              )}
              className="h-6 w-6 p-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
            >
              <Users className="h-3 w-3" />
            </Button>
          )}
          {/* Centralised POs are Admin-managed: a BU Admin/Service PO Admin can view and map
              employees onto one, but not edit it (mirrors the backend, which keeps update/close/
              delete strictly BU-scoped even once the list/view/allocate reads are widened to
              include centralised rows). */}
          {canManage && (isAdminActor || !row.original.is_centralised) && (
            <Button
              size="sm"
              title="Edit"
              onClick={() => navigate(buildPath(ROUTES.SERVICE_PO_EDIT, { id: row.original.id }))}
              className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('service_po_code', {
      header: 'Service PO Number',
      size: 180,
      meta: { sticky: true, left: 160 },
      cell: (info) => (
        <div className="font-mono text-xs font-semibold text-muted-foreground truncate" style={{ maxWidth: "160px" }} title={info.getValue()}>
          {info.getValue()}
        </div>
      ),
    }),
    columnHelper.accessor('service_po_name', {
      header: 'Service PO Name',
      size: 200,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" className="font-medium" wrap />,
    }),
    columnHelper.display({
      id: 'hierarchy',
      header: 'Activity/task',
      size: 160,
      // Same Admin-managed rule as the Edit button above — a BU Admin/Service PO Admin can view
      // and map a centralised PO but not manage its hierarchy either.
      cell: ({ row }) => (
        (isAdminActor || !row.original.is_centralised) ? (
          <Button
            size="sm"
            variant="outline"
            title="Manage Hierarchy"
            className="h-7 gap-1.5 text-xs"
            onClick={(e) => { e.stopPropagation(); setHierarchyTarget(row.original); }}
          >
            <GitBranch className="h-3.5 w-3.5" /> Manage
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
      ),
    }),
    columnHelper.accessor('client.client_name', {
      header: 'Client',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" />,
    }),
    columnHelper.accessor('project.project_name', {
      header: 'Project',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" />,
    }),
    ...(isCompanyLessActor
      ? [
          columnHelper.display({
            id: 'bu_name',
            header: 'BU Name',
            size: 200,
            cell: ({ row }) => (
              <TruncatedCell
                value={
                  row.original.company?.company_name
                  ?? row.original.company?.name
                  ?? buNameById.get(String(row.original.company_id))
                }
                maxWidth="180px"
              />
            ),
          }),
        ]
      : []),
    columnHelper.accessor('serviceType.service_type_name', {
      header: 'Service Type',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" />,
    }),
    columnHelper.accessor('service_description', {
      header: 'Description',
      size: 200,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" className="text-muted-foreground" />,
    }),
    columnHelper.accessor('po_value', {
      header: 'PO Value',
      size: 130,
      cell: (info) =>
        info.getValue() != null ? (
          formatCurrency(info.getValue())
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    columnHelper.accessor('invoice_frequency', {
      header: 'Invoice Freq.',
      size: 120,
      cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
    }),
    columnHelper.accessor('start_date', {
      header: 'Start Date',
      size: 130,
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('end_date', {
      header: 'End Date',
      size: 130,
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 160,
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor('is_centralised', {
      header: 'Centralised',
      size: 120,
      cell: (info) =>
        info.getValue() ? (
          <Badge variant="secondary">Centralised</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Service POs"
        // description="Manage service purchase orders"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <SearchInput
                placeholder="Search POs…"
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
              {servicePOs.length > 0 && (
                <Button variant="outline" size="toolbar" onClick={handleExport} disabled={exporting}>
                  <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
                </Button>
              )}
              {canManage && (
                <Button variant="outline" size="toolbar" onClick={() => downloadServicePoSample(isCompanyLessActor)}>
                  <Download className="h-4 w-4" /> Sample
                </Button>
              )}
              {canManage && (
                <Button variant="outline" size="toolbar" onClick={() => navigate(ROUTES.SERVICE_PO_IMPORT)}>
                  <Upload className="h-4 w-4" /> Import Excel
                </Button>
              )}
              {canManage && (
                <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(ROUTES.SERVICE_PO_NEW)}>
                  <Plus className="h-4 w-4" /> Add Service PO
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters/more
                move into their own row below the header (see the md:hidden block after
                PageHeader). */}
            {canManage && (
              <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.SERVICE_PO_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </>
        }
      />

      {/* Mobile toolbar — service PO count, full-width search, and a compact Filters + More row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? servicePOs.length} service PO{(meta.total ?? servicePOs.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search service POs..."
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
          {(servicePOs.length > 0 || canManage) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="toolbar" className="h-10 bg-white">
                  <MoreVertical className="h-4 w-4" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {servicePOs.length > 0 && (
                  <DropdownMenuItem onClick={handleExport} disabled={exporting} className="cursor-pointer">
                    <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onClick={() => downloadServicePoSample(isCompanyLessActor)} className="cursor-pointer">
                    <Download className="h-4 w-4" /> Sample
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onClick={() => navigate(ROUTES.SERVICE_PO_IMPORT)} className="cursor-pointer">
                    <Upload className="h-4 w-4" /> Import Excel
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Up to seven filters (Entity, Business Unit, Client, Category, Service Type, Service PO,
          Status) on one row for an Admin whose BUs span more than one Entity — the panel's default
          caps at 4 per row, which wrapped the extras onto a second line. Steps down on narrower
          viewports rather than squeezing seven selects into a phone width. A single-BU login has
          five (no Entity/BU cells) and still fills one row. */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[460px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
          {isAdminActor && adminBuEntityOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Entity</Label>
              <SearchableSelect
                options={[{ label: 'All Entities', value: 'all' }, ...adminBuEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))]}
                value={adminEntityFilter}
                onValueChange={(v) => { setAdminEntityFilter(v ?? 'all'); setBuFilter('all'); setPage(1); }}
                placeholder="All Entities"
                searchPlaceholder="Search entity..."
                className="h-9 w-full text-sm bg-white"
              />
            </div>
          )}
          {isAdminActor && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Business Unit</Label>
              <SearchableSelect
                options={buOptions}
                value={buFilter}
                onValueChange={(v) => { setBuFilter(v); setPage(1); }}
                placeholder="All BUs"
                searchPlaceholder="Search BU..."
                className="h-9 w-full text-sm bg-white"
              />
            </div>
          )}
          {showEntityFilter && (
            <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} />
          )}
          {showBuFilter && (
            <BusinessUnitFilter value={buId} entityId={entityId} onChange={(v) => { setBuId(v); setPage(1); }} />
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Client</Label>
            <SearchableSelect
              options={[
                { label: "All Clients", value: "all" },
                ...clients.map((c) => ({
                  label: c.client_name,
                  value: String(c.id)
                }))
              ]}
              value={clientFilter}
              onValueChange={(v) => { setClientFilter(v); setPage(1); }}
              placeholder="All Clients"
              searchPlaceholder="Search client..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Category</Label>
            <SearchableSelect
              options={[
                { label: "All Categories", value: "all" },
                ...serviceCategories.map((sc) => ({
                  label: sc.name,
                  value: String(sc.id)
                }))
              ]}
              value={categoryFilter}
              onValueChange={handleCategoryChange}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Type</Label>
            <SearchableSelect
              options={[
                { label: "All Service Types", value: "all" },
                ...filteredServiceTypes.map((t) => ({
                  label: t.service_type_name,
                  value: String(t.id)
                }))
              ]}
              value={typeFilter}
              onValueChange={handleTypeChange}
              placeholder="All Service Types"
              searchPlaceholder="Search type..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service PO</Label>
            <SearchableSelect
              options={[
                { label: "All POs", value: "all" },
                ...filteredPOs.map((po) => {
                  const name = po.service_po_name || po.service_po_code || String(po.id);
                  const ancestors = getAncestors(po);
                  const depth = ancestors.length; // 0 = root, 1 = parent, 2 = child
                  return {
                    value: String(po.id),
                    searchValue: servicePOSearchValue(po, po.service_po_name, po.service_po_code),
                    label: (
                      <span className="flex flex-col" style={{ paddingLeft: `${depth * 18}px` }}>
                        {depth > 0 && (
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {ancestors.map((a) => a.name).join(' › ')}
                          </span>
                        )}
                        <span className="flex items-baseline gap-1.5">
                          {depth > 0 && <span className="text-muted-foreground">{'└'}</span>}
                          <span>{name}</span>
                        </span>
                      </span>
                    ),
                  };
                })
              ]}
              value={poFilter}
              onValueChange={(v) => { setPoFilter(v); setPage(1); }}
              placeholder="All POs"
              searchPlaceholder="Search PO..."
              className="h-9 w-full text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Status</Label>
            <SearchableSelect
              showSearch={false}
              options={[
                { label: "All statuses", value: "all" },
                { label: "In Progress", value: "in-progress" },
                { label: "Completed", value: "completed" },
                { label: "On Hold", value: "on-hold" },
                { label: "Pending", value: "pending" },
                { label: "Cancelled", value: "cancelled" },
                { label: "Closed", value: "closed" },
              ]}
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
              placeholder="All statuses"
              className="h-9 w-full text-sm bg-white"
            />
          </div>
      </FilterPanel>

      {/* Desktop table — unchanged, including frozen/sticky columns. */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={servicePOs}
        isLoading={isPending && !needsAdminBuChoice}
        emptyState={needsAdminBuChoice ? (
          <EmptyState
            title="Pick a Business Unit"
            description={`${companiesForAdminEntity.length} Business Units belong to this Entity — pick one to see its Service POs.`}
          />
        ) : undefined}
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
        onRowClick={(row) => navigate(buildPath(ROUTES.SERVICE_PO_DETAIL, { id: row.id }))}
      />

      {/* Mobile — compact card list instead of the frozen-column table, same data/handlers. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {isPending && !needsAdminBuChoice ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : needsAdminBuChoice ? (
            <EmptyState
              title="Pick a Business Unit"
              description={`${companiesForAdminEntity.length} Business Units belong to this Entity — pick one to see its Service POs.`}
            />
          ) : servicePOs.length === 0 ? (
            <EmptyState title="No records found" description="Try adjusting your search or filters." />
          ) : (
            servicePOs.map((po) => {
              const canEditRow = canManage && (isAdminActor || !po.is_centralised);
              const canManageHierarchyRow = isAdminActor || !po.is_centralised;
              return (
                <div
                  key={po.id}
                  className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors active:bg-slate-50"
                  onClick={() => navigate(buildPath(ROUTES.SERVICE_PO_DETAIL, { id: po.id }))}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>{getInitials(po.service_po_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{po.service_po_name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate font-mono">{po.service_po_code}</span>
                      <StatusBadge status={po.status} className="shrink-0" />
                    </p>
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
                      <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.SERVICE_PO_DETAIL, { id: po.id }))}>
                        <Eye className="h-4 w-4" /> View
                      </DropdownMenuItem>
                      {canManage && (
                        <DropdownMenuItem
                          onClick={() => navigate(
                            buildPath(ROUTES.SERVICE_PO_MAP_EMPLOYEES, { id: po.id }),
                            { state: { from: location.pathname + location.search } }
                          )}
                        >
                          <Users className="h-4 w-4" /> Map Employees
                        </DropdownMenuItem>
                      )}
                      {canEditRow && (
                        <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.SERVICE_PO_EDIT, { id: po.id }))}>
                          <Pencil className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                      )}
                      {canManageHierarchyRow && (
                        <DropdownMenuItem onClick={() => setHierarchyTarget(po)}>
                          <GitBranch className="h-4 w-4" /> Manage Hierarchy
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>

        {meta.total != null && !needsAdminBuChoice && (() => {
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

      <ServicePOHierarchyDrawer
        servicePO={hierarchyTarget}
        open={!!hierarchyTarget}
        onOpenChange={(open) => !open && setHierarchyTarget(null)}
      />

      <Outlet />
    </div>
  );
};

export default ServicePOList;
