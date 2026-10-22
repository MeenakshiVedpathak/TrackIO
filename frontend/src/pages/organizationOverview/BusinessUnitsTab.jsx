import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createColumnHelper } from '@tanstack/react-table';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import DataTable from '@/components/common/DataTable';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotification } from '@/hooks/useNotification';
import { useCompanies } from '@/hooks/useCompanies';
import { cn } from '@/utils/cn';
import { matchesBusinessUnit } from '@/utils/organizationOverview';

const ALL = 'all';
const DEFAULT_LIMIT = 10;
const columnHelper = createColumnHelper();

// Exported as-is, respecting whatever the current search/filters show — not just the current page.
// `buRootNameById`/`subBuNameById` are this tab's own client-side BU-master join (see below) — a
// row here IS a BU itself, which can itself be a Sub-BU, so "BU Name" must always resolve up to
// the top-level Parent BU's own name, and "Sub BU" restates the row's own name only when it
// actually has a parent.
const toExportRows = (rows, buRootNameById, subBuNameById) => rows.map((bu) => ({
  'BU Name': buRootNameById.get(String(bu.id)) ?? bu.name,
  'Sub BU': subBuNameById.get(String(bu.id)) ?? '—',
  Entity: bu.entityName,
  Status: bu.status,
  'Created Date': bu.createdAt ? new Date(bu.createdAt).toLocaleDateString() : '',
}));

// Every column below declares an explicit `size` — DataTable renders with `table-fixed`, so
// columns left without one fight over layout and their text can visually overlap.
const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn('text-sm truncate', className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

// Tab 2 — all data comes from the same normalized `businessUnits` array the parent already holds
// (one API call); search/filters below are pure client-side derivation, no requests.
const BusinessUnitsTab = ({ businessUnits, search, isLoading, toolbarSlot }) => {
  const { success, error: showError } = useNotification();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — purely client-side, no backend param involved.
  const [entityFilters, setEntityFilters] = useState([]);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  // Client-side-only BU hierarchy join — the org-overview response itself has no
  // parent_business_unit_id, so the BU master is fetched separately just for this. A row here IS
  // a BU itself, so "Sub BU" means "is THIS row a Sub-BU", not a lookup of some other BU's child —
  // and "BU Name" must always resolve up to the top-level Parent BU's own name when the row itself
  // is a Sub-BU (same proven pattern as ServicePOList.jsx's buRootNameById/subBuNameById).
  const { data: companiesData } = useCompanies({ status: 'active', limit: 500 }, { staleTime: 1000 * 60 * 10 });
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

  const entityOptions = useMemo(
    () => Array.from(new Set(businessUnits.map((bu) => bu.entityName))).sort(),
    [businessUnits]
  );

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return businessUnits.filter((bu) =>
      (!term || matchesBusinessUnit(bu, term)) &&
      (entityFilters.length === 0 || entityFilters.includes(bu.entityName)) &&
      (statusFilter === ALL || bu.status === statusFilter)
    );
  }, [businessUnits, search, entityFilters, statusFilter]);

  // A filter/search change can strand `page` past the new (smaller) result set — reset back to
  // page 1 whenever the filtered set's own inputs change, same as every other paginated list.
  useEffect(() => setPage(1), [search, entityFilters, statusFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * limit, page * limit),
    [filtered, page, limit],
  );

  const activeCount = entityFilters.length + (statusFilter !== ALL ? 1 : 0);

  const clearFilters = () => {
    setEntityFilters([]);
    setStatusFilter(ALL);
  };

  const handleExportExcel = () => {
    if (filtered.length === 0) {
      showError('No data to export');
      return;
    }
    try {
      const ws = XLSX.utils.json_to_sheet(toExportRows(filtered, buRootNameById, subBuNameById));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Business Units');
      XLSX.writeFile(wb, 'business_units_export.xlsx');
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
      doc.text('Business Units', 14, 15);
      autoTable(doc, {
        head: [['BU Name', 'Sub BU', 'Entity', 'Status', 'Created Date']],
        body: filtered.map((bu) => [buRootNameById.get(String(bu.id)) ?? bu.name, subBuNameById.get(String(bu.id)) ?? '-', bu.entityName, bu.status, bu.createdAt ? new Date(bu.createdAt).toLocaleDateString() : '-']),
        startY: 20,
      });
      doc.save('business_units_export.pdf');
      success('Exported to PDF successfully');
    } catch (err) {
      console.error('PDF Export Error:', err);
      showError('Failed to export PDF');
    }
  };

  const columns = [
    columnHelper.display({
      id: 'name',
      header: 'BU Name',
      size: 220,
      // Resolved through buRootNameById first — this row can itself be a Sub-BU, and that map
      // always walks up to the top-level Parent BU's own name regardless.
      cell: ({ row }) => (
        <TruncatedCell
          value={buRootNameById.get(String(row.original.id)) ?? row.original.name}
          maxWidth="200px"
          className="font-medium"
        />
      ),
    }),
    columnHelper.display({
      id: 'subBuName',
      header: 'Sub BU',
      size: 180,
      cell: ({ row }) => <TruncatedCell value={subBuNameById.get(String(row.original.id))} maxWidth="160px" />,
    }),
    columnHelper.accessor('entityName', {
      header: 'Entity',
      size: 200,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="180px" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 120,
      cell: (info) => (
        <Badge variant={info.getValue() === 'active' ? 'success' : 'muted'} className="capitalize">
          {info.getValue()}
        </Badge>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created Date',
      size: 140,
      cell: (info) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {info.getValue() ? new Date(info.getValue()).toLocaleDateString() : '—'}
        </span>
      ),
    }),
  ];

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
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" gridClassName="grid-cols-1 sm:grid-cols-2" onClear={clearFilters} showClear={activeCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Entity</Label>
          <MultiSelect
            options={entityOptions.map((e) => ({ label: e, value: e }))}
            value={entityFilters}
            onValueChange={setEntityFilters}
            placeholder="All Entities"
            searchPlaceholder="Search entity..."
            className="bg-white"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-[clamp(1.875rem,2vw,2.25rem)] bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterPanel>
      <DataTable
        columns={columns}
        data={paged}
        isLoading={isLoading}
        pagination={filtered.length > 0 ? { page, limit, total: filtered.length } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setLimit(size); setPage(1); }}
      />
    </div>
  );
};

export default BusinessUnitsTab;
