import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import EmptyState from '@/components/common/EmptyState';
import ServicePOHierarchyNode from './components/ServicePOHierarchyNode';
import { matchesServicePONode } from '@/utils/organizationOverview';

const ALL = 'all';

const FILTER_FIELDS = [
  { label: 'Entity', key: 'entityName' },
  { label: 'BU', key: 'buName' },
  { label: 'Project', key: 'projectName' },
  { label: 'Client', key: 'clientName' },
  { label: 'Service PO', key: 'servicePOName' },
];

// Tab 3 — table shows one row per Service PO (already flattened + tree-built in
// OrganizationOverview.jsx via normalizeProject); each row's own `children` is its Parent/Child
// hierarchy, built from the backend's own parent_id-linked `hierarchy` array — never recreated
// or re-derived on the frontend.
const ProjectsServicePOsTab = ({ servicePOs, search, isLoading }) => {
  const roots = servicePOs;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ entityName: ALL, buName: ALL, projectName: ALL, clientName: ALL, servicePOName: ALL });
  const [expanded, setExpanded] = useState(new Set());

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

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      <div className="shrink-0 flex justify-end">
        <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} activeCount={activeCount} />
      </div>
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[260px]" gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" onClear={clearFilters} showClear={activeCount > 0}>
        {FILTER_FIELDS.map(({ label, key }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label className="text-xs">{label}</Label>
            <Select value={filters[key]} onValueChange={(v) => setFilters((f) => ({ ...f, [key]: v }))}>
              <SelectTrigger className="h-9 bg-white text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All {label}s</SelectItem>
                {optionsByKey[key].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </FilterPanel>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-white">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-50">
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service PO</TableHead>
              <TableHead>BU</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState title="No projects / Service POs found" description="Try adjusting your search or filters." />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((root) => {
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
                      <TableCell className="text-sm">{root.buName}</TableCell>
                      <TableCell className="text-sm">{root.entityName}</TableCell>
                    </TableRow>
                    {hasChildren && isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/20">
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
      </div>
    </div>
  );
};

export default ProjectsServicePOsTab;
