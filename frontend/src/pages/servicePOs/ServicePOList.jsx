import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate, useSearchParams, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Eye, Download, Upload, Users, GitBranch, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useServicePOs } from '@/hooks/useServicePOs';
import { servicePOsApi } from '@/api/servicePOs.api';
import { useActiveClients } from '@/hooks/useClients';
import { useCompanies } from '@/hooks/useCompanies';
import { useActiveEntities } from '@/hooks/useEntities';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useCanManageClientProjectPO } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { NO_COMPANY_ROLES, ROLE_NAMES } from '@/constants/roleHierarchy';
import { downloadServicePoSample } from '@/utils/servicePoSample';
import { useDebounce } from '@/hooks/useDebounce';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import { dedupeBusinessUnitIds } from '@/components/common/HierarchicalBuSelector';
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
import { toHierarchicalBuOptions } from '@/utils/buHierarchy';
import EntityFilter from '@/components/common/EntityFilter';
import ServicePOHierarchyDrawer from './ServicePOHierarchyDrawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
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

const exportToExcel = (rows, categoryByTypeId, buOpts) => {
  // buOpts is only populated for company-less actors (Admin/Entity Admin/Platform Admin) — see
  // the identical `isCompanyLessActor` gate on the on-screen "BU Name"/"Sub BU" columns. A
  // BU-scoped actor's export skips these columns since the value would be the same on every row.
  const { isCompanyLessActor, buRootNameById, subBuNameById, buNameById } = buOpts ?? {};
  const header = [
    'Service PO Number', 'Service PO Name', 'Client', 'Project', 'Service Category', 'Service Type', 'Account Manager',
    'Description', 'PO Value', 'Invoice Frequency', 'Invoice Amount',
    'Start Date', 'End Date', 'Status', 'Created By',
    ...(isCompanyLessActor ? ['BU Name', 'Sub BU'] : []),
    'Project Manager',
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
    r.creator?.full_name ?? '',
    ...(isCompanyLessActor
      ? [
          r.bu_name
            ?? r.company?.parent?.company_name
            ?? buRootNameById.get(String(r.company_id))
            ?? r.company?.company_name
            ?? r.company?.name
            ?? buNameById.get(String(r.company_id))
            ?? '',
          r.sub_bu_name
            ?? subBuNameById.get(String(r.company_id))
            ?? '',
        ]
      : []),
    (r.project_managers ?? []).map((pm) => pm.full_name).join(', '),
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
  // hasRole() is an exact match, not hierarchy-aware — Platform Admin has to be listed
  // explicitly alongside Admin or it fails this check despite outranking it.
  const isAdminActor = hasRole(ROLE_NAMES.PLATFORM_ADMIN, ROLE_NAMES.ADMIN);
  const { data: companiesData } = useCompanies({ limit: 200 }, { enabled: isCompanyLessActor });
  // List rows aren't guaranteed to embed the company relation, so resolve company_id against the
  // BU list as a fallback.
  const buNameById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => map.set(String(c.id), c.company_name));
    return map;
  }, [companiesData]);
  // A Service PO's company_id can itself be a Sub-BU's id (see the Sub BU cascade added to
  // ServicePOForm) — the "BU Name" column must always show the top-level Parent BU regardless
  // (a Sub-BU showing up there reads as a completely different, unrelated BU, since it's just
  // another row's own name with no indication it's nested under anything). `subBuNameById` is the
  // Sub-BU's OWN name for the separate "Sub BU" column below, kept apart so neither column loses
  // information the other one needs.
  const companyById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => map.set(String(c.id), c));
    return map;
  }, [companiesData]);
  const buRootNameById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      const parentId = c.parent_business_unit_id ?? c.parent?.id;
      // Depth is capped at 2 levels (a Sub-BU can never itself have children — see
      // CompanyList.jsx), so a single parent lookup is always enough to reach the root.
      const root = parentId != null ? companyById.get(String(parentId)) : null;
      map.set(String(c.id), root ? root.company_name : c.company_name);
    });
    return map;
  }, [companiesData, companyById]);
  const subBuNameById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      if ((c.parent_business_unit_id ?? c.parent?.id) != null) map.set(String(c.id), c.company_name);
    });
    return map;
  }, [companiesData]);
  // `[searchParams]` here (not the `[searchParams, setSearchParams]` pair used lower down) is
  // deliberately read once, synchronously, for every filter's `useState` initializer below — so
  // that navigating here with a filter-carrying URL (either a deep link like
  // `?service_category_id=` from the compliance report, or coming BACK from Map Employees/the PO
  // detail page, whose own Back buttons return to `location.pathname + location.search` captured
  // when the user left) reopens with every filter exactly as it was, not reset to defaults. See
  // the "keep the URL in sync" effect further down, which is what makes that captured
  // `location.search` carry anything in the first place.
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryIdParam = searchParams.get('service_category_id');
  const servicePoIdParam = searchParams.get('service_po_id');
  const entityIdsParam = searchParams.get('entityIds');
  const businessUnitIdsParam = searchParams.get('businessUnitIds');

  // Admin's own Entity step, paired with the Admin-only "Business Unit" select below — narrows
  // which BUs that dropdown offers, AND (unlike the old company_id-only mechanism) rides into the
  // query directly as `entityIds` on its own, so picking just an Entity actually filters the list
  // across every BU under it instead of requiring a BU pick too. companiesData already carries
  // entity_id/entity per BU (same company master every other Entity+BU filter pair derives entity
  // info from), so no extra fetch. Seeded from the URL the same way as every other filter below.
  const [adminEntityFilters, setAdminEntityFilters] = useState(() => (entityIdsParam ? entityIdsParam.split(',') : []));
  // Deactivated Entities must not be offered here. The company master carries `entity.entity_name`
  // but NOT the Entity's own status, so the names derived below can't be status-checked on their
  // own — GET /entities?status=active is the only source of that, and an Admin can read it.
  // Guarded — while this is still loading it returns nothing, and blanking the filter mid-load
  // would strand a selection the user already made.
  const { data: activeEntities } = useActiveEntities({ enabled: isAdminActor });
  const activeEntityIds = useMemo(
    () => new Set((activeEntities ?? []).map((e) => String(e.id))),
    [activeEntities]
  );
  const adminBuEntityOptions = useMemo(() => {
    const byId = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      const id = c.entity_id ?? c.entity?.id;
      const name = c.entity?.entity_name;
      if (id == null || !name || byId.has(id)) return;
      if (activeEntityIds.size > 0 && !activeEntityIds.has(String(id))) return;
      byId.set(id, { id, name });
    });
    return Array.from(byId.values());
  }, [companiesData, activeEntityIds]);
  const companiesForAdminEntity = useMemo(
    () => (adminEntityFilters.length === 0
      ? (companiesData?.data ?? [])
      : (companiesData?.data ?? []).filter((c) => adminEntityFilters.includes(String(c.entity_id ?? c.entity?.id)))),
    [companiesData, adminEntityFilters]
  );
  const buOptions = useMemo(
    () => toHierarchicalBuOptions(companiesForAdminEntity),
    [companiesForAdminEntity]
  );
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit')) || 10);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client_id') || 'all');
  const [categoryFilter, setCategoryFilter] = useState(categoryIdParam || 'all');
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('service_type_id') || 'all');
  const [poFilter, setPoFilter] = useState(servicePoIdParam || 'all');
  const [buFilters, setBuFilters] = useState(() => (businessUnitIdsParam ? businessUnitIdsParam.split(',') : []));
  // Sending a Parent BU id together with one of its own Sub-BU ids makes the backend resolve the
  // Parent back to "itself + every child", silently re-widening the result right back to the whole
  // Parent (confirmed live: checking "DATA + AI" + its "DASS" Sub-BU still returned other Sub-BUs
  // like "NON IBM"). The admin-only picker above is a plain flat MultiSelect with no parent/child
  // exclusivity of its own (unlike BusinessUnitFilter's non-Admin path, which already strips this),
  // so the same dedupe every other hierarchical BU picker in this app applies (see
  // HierarchicalBuSelector.jsx) is applied here too, right at the boundary where the raw selection
  // becomes the `businessUnitIds` request param — never on `buFilters` itself, so the checkboxes
  // still show both rows checked exactly as picked.
  const dedupedBuFilters = useMemo(
    () => dedupeBusinessUnitIds(buFilters, buOptions),
    [buFilters, buOptions]
  );
  const [filtersOpen, setFiltersOpen] = useState(!!categoryIdParam || !!servicePoIdParam);
  const [exporting, setExporting] = useState(false);
  const [hierarchyTarget, setHierarchyTarget] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const canManage = useCanManageClientProjectPO();

  const [sorting, setSorting] = useState(() => {
    const sortBy = searchParams.get('sortBy');
    return sortBy ? [{ id: sortBy, desc: searchParams.get('sortOrder') === 'desc' }] : [];
  });

  // Every non-Admin role reaches Service POs through the X-Company-Id header, so a login mapped
  // to more than one BU gets the standard master BU filter here. An Admin is excluded: their list
  // is deliberately cross-BU (crossBuScopeForAdmin) and they narrow with the ?company_id filter
  // below instead — running both would fight over the same axis.
  // Multi-select via useMasterBuFilter for the non-Admin path — backend support has landed on
  // GET /service-pos (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md). The Admin-only cross-BU
  // `company_ids`/`buFilters` picker just above is a separate control that never reads from
  // useMasterBuFilter (disabled entirely for Admin below) — it's also multi-select now, just via
  // its own state and its own new `company_ids` param (see
  // BACKEND_MULTI_SELECT_SERVICEPO_ADMIN_BU_PROMPT.md).
  const {
    entityId, setEntityId, showEntityFilter, isEntityFiltered, resetEntityId,
    buId, setBuId, showBuFilter, isBuFiltered, resetBuId, buParams,
  } = useMasterBuFilter({ enabled: !isAdminActor, multiple: true });

  // useMasterBuFilter has no concept of an initial value of its own (every other Master screen
  // using it always opens on "All Business Units") — seeded here, once, straight from the same
  // `entityIds`/`businessUnitIds` URL params every other filter above restores itself from.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAdminActor) return;
    if (entityIdsParam) setEntityId(entityIdsParam.split(','));
    if (businessUnitIdsParam) setBuId(businessUnitIdsParam.split(','));
    // Mount-only — this is a one-time restore, not a live sync, so it must not re-fire (and wipe
    // a since-made selection) if the role check or the hook's own setters ever change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the address bar in sync with every filter below so that leaving this screen (Map
  // Employees, a PO's own detail page, both of which capture `location.pathname + location.search`
  // as their own Back target) and coming back restores the exact same search/filters/page/sort
  // instead of resetting to defaults. `replace: true` updates the current history entry in place
  // rather than pushing a new one on every keystroke/filter change.
  useEffect(() => {
    const next = new URLSearchParams();
    if (page > 1) next.set('page', String(page));
    if (limit !== 10) next.set('limit', String(limit));
    if (debouncedSearch) next.set('search', debouncedSearch);
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (clientFilter !== 'all') next.set('client_id', clientFilter);
    if (categoryFilter !== 'all') next.set('service_category_id', categoryFilter);
    if (typeFilter !== 'all') next.set('service_type_id', typeFilter);
    if (poFilter !== 'all') next.set('service_po_id', poFilter);
    if (sorting[0]) {
      next.set('sortBy', sorting[0].id);
      next.set('sortOrder', sorting[0].desc ? 'desc' : 'asc');
    }
    if (isAdminActor) {
      if (adminEntityFilters.length > 0) next.set('entityIds', adminEntityFilters.join(','));
      if (dedupedBuFilters.length > 0) next.set('businessUnitIds', dedupedBuFilters.join(','));
    } else {
      if (entityId.length > 0) next.set('entityIds', entityId.join(','));
      if (buId.length > 0) next.set('businessUnitIds', buId.join(','));
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page, limit, debouncedSearch, statusFilter, clientFilter, categoryFilter, typeFilter, poFilter,
    sorting, isAdminActor, adminEntityFilters, dedupedBuFilters, entityId, buId,
  ]);

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
    // Admin-only — no X-Company-Id is sent for them, so this is the only BU/Entity narrowing they
    // get. Same `entityIds`/`businessUnitIds` (comma-separated) convention the non-Admin path uses
    // just above via useMasterBuFilter — GET /service-pos already supports both independently, so
    // Entity alone now filters across every BU under it instead of requiring a BU pick too.
    ...(isAdminActor && adminEntityFilters.length > 0 && { entityIds: adminEntityFilters.join(',') }),
    ...(isAdminActor && dedupedBuFilters.length > 0 && { businessUnitIds: dedupedBuFilters.join(',') }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending } = useServicePOs(params);
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
    isAdminActor && buFilters.length > 0 ? 1 : 0,
    isAdminActor && adminEntityFilters.length > 0 ? 1 : 0,
    isEntityFiltered ? 1 : 0,
    isBuFiltered ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setClientFilter('all');
    setCategoryFilter('all');
    setTypeFilter('all');
    setPoFilter('all');
    setStatusFilter('all');
    setBuFilters([]);
    setAdminEntityFilters([]);
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  // Export pulls every matching record (not just the current page) — paged in EXPORT_PAGE_LIMIT
  // chunks rather than one `limit: total` request, since the backend hard-caps `limit` at 100
  // (backend/src/utils/pagination.js MAX_LIMIT, same cap reports.api.js's own fetchAll* helpers
  // page around) and silently truncates anything above that: a single big request here was
  // confirmed live to return only the first 100 of 221 rows with no error, so "Export Excel"
  // looked like it worked while quietly dropping every row past the cap.
  const EXPORT_PAGE_LIMIT = 100;
  const handleExport = async () => {
    setExporting(true);
    try {
      const first = await servicePOsApi.getAll({ ...params, page: 1, limit: EXPORT_PAGE_LIMIT });
      const totalRows = first?.meta?.total ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalRows / EXPORT_PAGE_LIMIT));
      const all = Array.isArray(first?.data) ? [...first.data] : [];
      for (let p = 2; p <= totalPages; p++) {
        const res = await servicePOsApi.getAll({ ...params, page: p, limit: EXPORT_PAGE_LIMIT });
        if (Array.isArray(res?.data)) all.push(...res.data);
      }
      exportToExcel(all, categoryNameByTypeId, { isCompanyLessActor, buRootNameById, subBuNameById, buNameById });
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
      size: 260,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="260px" className="font-medium" />,
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
            // bu_name from the API is the authoritative top-level BU name (backend resolves the
            // Sub-BU → Parent walk itself). buRootNameById / company relation are fallbacks for
            // while the company master is still loading or if the API field is absent.
            cell: ({ row }) => (
              <TruncatedCell
                value={
                  row.original.bu_name
                  ?? row.original.company?.parent?.company_name
                  ?? buRootNameById.get(String(row.original.company_id))
                  ?? row.original.company?.company_name
                  ?? row.original.company?.name
                  ?? buNameById.get(String(row.original.company_id))
                }
                maxWidth="180px"
              />
            ),
          }),
          columnHelper.display({
            id: 'sub_bu_name',
            header: 'Sub BU',
            size: 160,
            cell: ({ row }) => (
              <TruncatedCell
                value={
                  row.original.sub_bu_name
                  ?? subBuNameById.get(String(row.original.company_id))
                }
                maxWidth="140px"
              />
            ),
          }),
        ]
      : []),
    // Every employee currently marked Project Manager for this Service PO (GET /service-pos'
    // `project_managers`, an array of `{ id, full_name }` — empty, never null, when nobody's
    // marked PM yet). A Service PO can have more than one, so this joins them rather than picking
    // just one — same "comma-join, em-dash fallback" convention the Consolidated Monthly Report's
    // own PM column already uses for the identical underlying relation.
    columnHelper.display({
      id: 'project_managers',
      header: 'Project Manager',
      size: 200,
      cell: ({ row }) => {
        const pms = row.original.project_managers ?? [];
        return <TruncatedCell value={pms.map((pm) => pm.full_name).join(', ')} maxWidth="180px" />;
      },
    }),
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
      size: 150,
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
    columnHelper.display({
      id: 'created_by',
      header: 'Created By',
      size: 170,
      cell: ({ row }) => <TruncatedCell value={row.original.creator?.full_name} maxWidth="150px" />,
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
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-[clamp(0.5rem,0.8vw,0.75rem)] w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
          {isAdminActor && adminBuEntityOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Entity</Label>
              <MultiSelect
                options={adminBuEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))}
                value={adminEntityFilters}
                onValueChange={(v) => { setAdminEntityFilters(v); setBuFilters([]); setPage(1); }}
                placeholder="All Entities"
                searchPlaceholder="Search entity..."
                className="bg-white"
              />
            </div>
          )}
          {isAdminActor && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Business Unit</Label>
              <MultiSelect
                options={buOptions}
                value={buFilters}
                onValueChange={(v) => { setBuFilters(v); setPage(1); }}
                placeholder="All BUs"
                searchPlaceholder="Search BU..."
                className="bg-white"
              />
            </div>
          )}
          {showEntityFilter && (
            <EntityFilter multiple value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} />
          )}
          {showBuFilter && (
            <BusinessUnitFilter multiple value={buId} entityId={entityId} onChange={(v) => { setBuId(v); setPage(1); }} />
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
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
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
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
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
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
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
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
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
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
            />
          </div>
      </FilterPanel>

      {/* Desktop table — unchanged, including frozen/sticky columns. */}
      <DataTable
        className="hidden md:flex"
        columns={columns}
        data={servicePOs}
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
        onRowClick={(row) => navigate(buildPath(ROUTES.SERVICE_PO_DETAIL, { id: row.id }))}
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
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate font-mono">{po.service_po_code}</span>
                      <StatusBadge status={po.status} className="shrink-0" />
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
