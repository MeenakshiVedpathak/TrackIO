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
import { matchesUser } from '@/utils/organizationOverview';

const ALL = 'all';
const DEFAULT_LIMIT = 10;
const columnHelper = createColumnHelper();

// Exported as-is, respecting whatever the current search/filters show — not just the current page.
// `buRootNameById`/`subBuNameById` are this tab's own client-side BU-master join (see below),
// keyed by BU id.
const toExportRows = (rows, buRootNameById, subBuNameById) => rows.map((u) => ({
  Name: u.name,
  Email: u.email,
  'Employee ID': u.employeeId,
  'Role(s)': u.roles.join(', '),
  BU: buRootNameById.get(String(u.buId)) ?? u.buName,
  'Sub BU': subBuNameById.get(String(u.buId)) ?? '—',
  Entity: u.entityName,
  Status: u.status,
}));

// Every column below declares an explicit `size` — DataTable renders with `table-fixed`, so
// columns left without one (as Email/Employee ID originally were) fight over layout and their
// text visually overlaps instead of truncating.
const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn('text-sm truncate', className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

// Tab 4 — all data comes from the same normalized `users` array the parent already holds (one
// API call); search/filters below are pure client-side derivation, no requests.
const UsersTab = ({ users, search, isLoading, toolbarSlot }) => {
  const { success, error: showError } = useNotification();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select — purely client-side, no backend param involved.
  const [entityFilters, setEntityFilters] = useState([]);
  const [buFilters, setBuFilters] = useState([]);
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  // Client-side-only BU hierarchy join — the org-overview response itself has no
  // parent_business_unit_id, so the BU master is fetched separately just for this, and joined
  // against each user's own `buId` (from normalizeUser).
  const { data: companiesData } = useCompanies({ status: 'active', limit: 500 }, { staleTime: 1000 * 60 * 10 });
  // A user's `buId` can itself be a Sub-BU's id — the "BU" column must always show the top-level
  // Parent BU regardless (same proven pattern as ServicePOList.jsx's buRootNameById/subBuNameById:
  // resolve through companyById to the row's parent, else fall back to its own name).
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

  const entityOptions = useMemo(() => Array.from(new Set(users.map((u) => u.entityName))).sort(), [users]);
  // Narrowed by the Entity choice above it — offering another Entity's BUs here just produced
  // an empty table (no user is in both), the same cascade every other Entity+BU filter pair in
  // the app already does (see components/common/BusinessUnitFilter's `entityId` prop).
  const buOptions = useMemo(
    () => Array.from(new Set(
      users.filter((u) => entityFilters.length === 0 || entityFilters.includes(u.entityName)).map((u) => u.buName)
    )).sort(),
    [users, entityFilters]
  );
  const roleOptions = useMemo(() => Array.from(new Set(users.flatMap((u) => u.roles))).sort(), [users]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return users.filter((u) =>
      (!term || matchesUser(u, term)) &&
      (entityFilters.length === 0 || entityFilters.includes(u.entityName)) &&
      (buFilters.length === 0 || buFilters.includes(u.buName)) &&
      (roleFilter === ALL || u.roles.includes(roleFilter)) &&
      (statusFilter === ALL || u.status === statusFilter)
    );
  }, [users, search, entityFilters, buFilters, roleFilter, statusFilter]);

  // A filter/search change can strand `page` past the new (smaller) result set — reset back to
  // page 1 whenever the filtered set's own inputs change, same as every other paginated list.
  useEffect(() => setPage(1), [search, entityFilters, buFilters, roleFilter, statusFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * limit, page * limit),
    [filtered, page, limit],
  );

  const activeCount = entityFilters.length + buFilters.length
    + (roleFilter !== ALL ? 1 : 0) + (statusFilter !== ALL ? 1 : 0);

  const clearFilters = () => {
    setEntityFilters([]);
    setBuFilters([]);
    setRoleFilter(ALL);
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
      XLSX.utils.book_append_sheet(wb, ws, 'Users');
      XLSX.writeFile(wb, 'users_export.xlsx');
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
      doc.text('Users', 14, 15);
      autoTable(doc, {
        head: [['Name', 'Email', 'Employee ID', 'Role(s)', 'BU', 'Sub BU', 'Entity', 'Status']],
        body: filtered.map((u) => [u.name, u.email, u.employeeId, u.roles.join(', '), buRootNameById.get(String(u.buId)) ?? u.buName, subBuNameById.get(String(u.buId)) ?? '-', u.entityName, u.status]),
        startY: 20,
      });
      doc.save('users_export.pdf');
      success('Exported to PDF successfully');
    } catch (err) {
      console.error('PDF Export Error:', err);
      showError('Failed to export PDF');
    }
  };

  const columns = [
    columnHelper.accessor('name', {
      header: 'Name',
      size: 180,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="160px" className="font-medium" />,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" />,
    }),
    columnHelper.accessor('employeeId', {
      header: 'Employee ID',
      size: 120,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="100px" />,
    }),
    columnHelper.accessor('roles', {
      header: 'Role(s)',
      size: 220,
      cell: (info) => {
        const roles = info.getValue();
        if (!roles.length) return <span className="text-sm text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => <Badge key={role} variant="secondary" className="text-[10px]">{role}</Badge>)}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'buName',
      header: 'BU',
      size: 170,
      // Resolved through buRootNameById first — a user's buId can itself be a Sub-BU's id, and
      // that map always walks up to the top-level Parent BU's own name regardless.
      cell: ({ row }) => (
        <TruncatedCell
          value={buRootNameById.get(String(row.original.buId)) ?? row.original.buName}
          maxWidth="150px"
        />
      ),
    }),
    columnHelper.display({
      id: 'subBuName',
      header: 'Sub BU',
      size: 150,
      cell: ({ row }) => <TruncatedCell value={subBuNameById.get(String(row.original.buId))} maxWidth="130px" />,
    }),
    columnHelper.accessor('entityName', {
      header: 'Entity',
      size: 150,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="130px" />,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 100,
      cell: (info) => (
        <Badge variant={info.getValue() === 'active' ? 'success' : 'muted'} className="capitalize">
          {info.getValue()}
        </Badge>
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
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" gridClassName="grid-cols-2 sm:grid-cols-4" onClear={clearFilters} showClear={activeCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Entity</Label>
          <MultiSelect
            options={entityOptions.map((e) => ({ label: e, value: e }))}
            value={entityFilters}
            onValueChange={(v) => { setEntityFilters(v); setBuFilters([]); }}
            placeholder="All Entities"
            searchPlaceholder="Search entity..."
            className="bg-white"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">BU</Label>
          <MultiSelect
            options={buOptions.map((bu) => ({ label: bu, value: bu }))}
            value={buFilters}
            onValueChange={setBuFilters}
            placeholder="All BUs"
            searchPlaceholder="Search BU..."
            className="bg-white"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Role</Label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-[clamp(1.875rem,2vw,2.25rem)] bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Roles</SelectItem>
              {roleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
            </SelectContent>
          </Select>
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

export default UsersTab;
