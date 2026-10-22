import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/common/DataTable';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { matchesUser } from '@/utils/organizationOverview';

const ALL = 'all';
const columnHelper = createColumnHelper();

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
const UsersTab = ({ users, search, isLoading }) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityFilter, setEntityFilter] = useState(ALL);
  const [buFilter, setBuFilter] = useState(ALL);
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const entityOptions = useMemo(() => Array.from(new Set(users.map((u) => u.entityName))).sort(), [users]);
  const buOptions = useMemo(() => Array.from(new Set(users.map((u) => u.buName))).sort(), [users]);
  const roleOptions = useMemo(() => Array.from(new Set(users.flatMap((u) => u.roles))).sort(), [users]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return users.filter((u) =>
      (!term || matchesUser(u, term)) &&
      (entityFilter === ALL || u.entityName === entityFilter) &&
      (buFilter === ALL || u.buName === buFilter) &&
      (roleFilter === ALL || u.roles.includes(roleFilter)) &&
      (statusFilter === ALL || u.status === statusFilter)
    );
  }, [users, search, entityFilter, buFilter, roleFilter, statusFilter]);

  const activeCount = [entityFilter, buFilter, roleFilter, statusFilter].filter((v) => v !== ALL).length;

  const clearFilters = () => {
    setEntityFilter(ALL);
    setBuFilter(ALL);
    setRoleFilter(ALL);
    setStatusFilter(ALL);
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
    columnHelper.accessor('buName', {
      header: 'BU',
      size: 170,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="150px" />,
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
      <div className="shrink-0 flex justify-end">
        <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} activeCount={activeCount} />
      </div>
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" gridClassName="grid-cols-2 sm:grid-cols-4" onClear={clearFilters} showClear={activeCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Entity</Label>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-9 bg-white text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Entities</SelectItem>
              {entityOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">BU</Label>
          <Select value={buFilter} onValueChange={setBuFilter}>
            <SelectTrigger className="h-9 bg-white text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All BUs</SelectItem>
              {buOptions.map((bu) => <SelectItem key={bu} value={bu}>{bu}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Role</Label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 bg-white text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Roles</SelectItem>
              {roleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 bg-white text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterPanel>
      <DataTable columns={columns} data={filtered} isLoading={isLoading} />
    </div>
  );
};

export default UsersTab;
