import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChevronRight, ChevronDown, ChevronLeft, FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import EmptyState from '@/components/common/EmptyState';
import { useNotification } from '@/hooks/useNotification';
import { useCompanies } from '@/hooks/useCompanies';
import ServicePOHierarchyNode from './components/ServicePOHierarchyNode';
import { matchesServicePONode } from '@/utils/organizationOverview';

const ALL = 'all';
const DEFAULT_LIMIT = 10;

const FILTER_FIELDS = [
  { label: 'Entity', key: 'entityName' },
  { label: 'BU', key: 'buName' },
  { label: 'Project', key: 'projectName' },
  { label: 'Client', key: 'clientName' },
  { label: 'Service PO', key: 'servicePOName' },
];

// Exported as-is (flattened root rows only, matching what's on screen) — a row's own
// Parent/Child hierarchy is a drill-down detail, not part of this one-row-per-Service-PO export.
// `buRootNameById`/`subBuNameById` are this tab's own client-side BU-master join (see below),
// keyed by BU id — each root row here is a Service PO (normalizeServicePO), which can carry its
// own buId independent of its parent project's.
const toExportRows = (rows, buRootNameById, subBuNameById) => rows.map((r) => ({
  Project: r.projectName,
  Client: r.clientName,
  'Service PO': r.servicePOName,
  'PO Code': r.poCode !== '—' ? r.poCode : '',
  'Business Unit': buRootNameById.get(String(r.buId)) ?? r.buName,
  'Sub BU': subBuNameById.get(String(r.buId)) ?? '—',
  Entity: r.entityName,
}));

// Tab 3 — table shows one row per Service PO (already flattened + tree-built in
// OrganizationOverview.jsx via normalizeProject); each row's own `children` is its Parent/Child
// hierarchy, built from the backend's own parent_id-linked `hierarchy` array — never recreated
// or re-derived on the frontend.
const ProjectsServicePOsTab = ({ servicePOs, search, isLoading, toolbarSlot }) => {
  const roots = servicePOs;
  const { success, error: showError } = useNotification();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ entityName: ALL, buName: ALL, projectName: ALL, clientName: ALL, servicePOName: ALL });
  const [expanded, setExpanded] = useState(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  // Client-side-only BU hierarchy join — the org-overview response itself has no
  // parent_business_unit_id, so the BU master is fetched separately just for this, and joined
  // against each row's own `buId` (a Service PO's own BU can differ from its parent project's).
  const { data: companiesData } = useCompanies({ status: 'active', limit: 500 }, { staleTime: 1000 * 60 * 10 });
  // A Service PO's own buId can itself be a Sub-BU's id — the "BU" column must always show the
  // top-level Parent BU regardless (same proven pattern as ServicePOList.jsx's
  // buRootNameById/subBuNameById: resolve through companyById to the row's parent, else fall back
  // to its own name).
  const companyById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => map.set(String(c.id), c));
    return map;
  }, [companiesData]);
  const buRootNameById = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      const parentId = c.parent_business_unit_id ?? c.parent?.id;
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

  const optionsFor = (key) => Array.from(new Set(roots.map((r) => r[key]).filter(Boolean))).sort();
  const optionsByKey = useMemo(
    () => Object.fromEntries(FILTER_FIELDS.map(({ key }) => [key, optionsFor(key)])),
    [roots]
  );

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return roots.filter((root) =>
      (!term || matchesServicePONode(root, term)) &&
      FILTER_FIELDS.every(({ key }) => filters[key] === ALL || root[key] === filters[key])
    );
  }, [roots, search, filters]);

  // A filter/search change can strand `page` past the new (smaller) result set — reset back to
  // page 1 whenever the filtered set's own inputs change, same as every other paginated list.
  useEffect(() => setPage(1), [search, filters]);

  const pagedRoots = useMemo(
    () => filtered.slice((page - 1) * limit, page * limit),
    [filtered, page, limit],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

  const activeCount = Object.values(filters).filter((v) => v !== ALL).length;

  const clearFilters = () => {
    setFilters({ entityName: ALL, buName: ALL, projectName: ALL, clientName: ALL, servicePOName: ALL });
  };

  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Exports whatever the current search/filters show (`filtered`), not just the current page —
  // an Admin narrowing to one Entity/BU expects the export to cover that whole narrowed set.
  const handleExportExcel = () => {
    if (filtered.length === 0) {
      showError('No data to export');
      return;
    }
    try {
      const ws = XLSX.utils.json_to_sheet(toExportRows(filtered, buRootNameById, subBuNameById));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Projects & Service POs');
      XLSX.writeFile(wb, 'projects_service_pos_export.xlsx');
      success('Exported to Excel successfully');
    } catch (err) {
      console.error('Excel Export Error:', err);
      showError('Failed to export Excel');
    }
  };

  const handleExportPDF = () => {
    if (filtered.length === 0) {
      showError('No data to export');
      return;
    }
    try {
      const doc = new jsPDF();
      doc.text('Projects / Service POs', 14, 15);
      autoTable(doc, {
        head: [['Project', 'Client', 'Service PO', 'PO Code', 'Business Unit', 'Sub BU', 'Entity']],
        body: filtered.map((r) => [r.projectName, r.clientName, r.servicePOName, r.poCode !== '—' ? r.poCode : '-', buRootNameById.get(String(r.buId)) ?? r.buName, subBuNameById.get(String(r.buId)) ?? '-', r.entityName]),
        startY: 20,
      });
      doc.save('projects_service_pos_export.pdf');
      success('Exported to PDF successfully');
    } catch (err) {
      console.error('PDF Export Error:', err);
      showError('Failed to export PDF');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      {/* Rendered into the tab-bar row (see OrganizationOverview.jsx) instead of its own row here
          — this tab is only ever visible while its own portal target exists, so no fallback. */}
      {toolbarSlot && createPortal(
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="toolbar" className="bg-white">
                <FileDown className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4 text-red-500" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} activeCount={activeCount} />
        </div>,
        toolbarSlot
      )}
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[260px]" gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" onClear={clearFilters} showClear={activeCount > 0}>
        {FILTER_FIELDS.map(({ label, key }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label className="text-xs">{label}</Label>
            <Select value={filters[key]} onValueChange={(v) => setFilters((f) => ({ ...f, [key]: v }))}>
              <SelectTrigger className="h-[clamp(1.875rem,2vw,2.25rem)] bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All {label}s</SelectItem>
                {optionsByKey[key].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </FilterPanel>

      {/* `containerClassName` (not a second wrapping div) is what makes this Table's own
          overflow-auto container the ONLY scrolling ancestor — sticky resolves against the
          nearest scrolling ancestor, and an extra outer `overflow-auto` div here used to give the
          header a scroll container that itself never scrolled, breaking the sticky effect. Same
          pattern as DataTable.jsx and every other sticky-header table in this app. */}
      <Table containerClassName="flex-1 min-h-0 rounded-lg border bg-white">
          <TableHeader className="sticky top-0 z-10 bg-slate-50">
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service PO</TableHead>
              <TableHead>BU</TableHead>
              <TableHead>Sub BU</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState title="No projects / Service POs found" description="Try adjusting your search or filters." />
                </TableCell>
              </TableRow>
            ) : (
              pagedRoots.map((root) => {
                const hasChildren = root.children?.length > 0;
                const isOpen = expanded.has(root.id);
                return (
                  <Fragment key={root.id}>
                    <TableRow
                      className={hasChildren ? 'cursor-pointer' : undefined}
                      onClick={() => hasChildren && toggleExpanded(root.id)}
                    >
                      <TableCell>
                        {hasChildren && (
                          isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{root.projectName}</TableCell>
                      <TableCell className="text-sm">{root.clientName}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{root.servicePOName}</span>
                          {root.poCode !== '—' && <Badge variant="outline" className="text-[10px] font-normal">{root.poCode}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{buRootNameById.get(String(root.buId)) ?? root.buName}</TableCell>
                      <TableCell className="text-sm">{subBuNameById.get(String(root.buId)) ?? '—'}</TableCell>
                      <TableCell className="text-sm">{root.entityName}</TableCell>
                    </TableRow>
                    {hasChildren && isOpen && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/20">
                          <div className="space-y-1 py-1">
                            {root.children.map((child) => (
                              <ServicePOHierarchyNode key={child.id} node={child} />
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
      </Table>

      {filtered.length > 0 && (
        <div className="flex shrink-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, filtered.length)} of {filtered.length} results
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">Rows per page</span>
              <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-16 bg-white text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsServicePOsTab;
