import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/common/DataTable';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { matchesBusinessUnit } from '@/utils/organizationOverview';

const ALL = 'all';
const columnHelper = createColumnHelper();

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
const BusinessUnitsTab = ({ businessUnits, search, isLoading }) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityFilter, setEntityFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const entityOptions = useMemo(
    () => Array.from(new Set(businessUnits.map((bu) => bu.entityName))).sort(),
    [businessUnits]
  );

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return businessUnits.filter((bu) =>
      (!term || matchesBusinessUnit(bu, term)) &&
      (entityFilter === ALL || bu.entityName === entityFilter) &&
      (statusFilter === ALL || bu.status === statusFilter)
    );
  }, [businessUnits, search, entityFilter, statusFilter]);

  const activeCount = [entityFilter, statusFilter].filter((v) => v !== ALL).length;

  const clearFilters = () => {
    setEntityFilter(ALL);
    setStatusFilter(ALL);
  };

  const columns = [
    columnHelper.accessor('name', {
      header: 'BU Name',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="200px" className="font-medium" />,
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
      <div className="shrink-0 flex justify-end">
        <FilterToggleButton isOpen={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} activeCount={activeCount} />
      </div>
      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" gridClassName="grid-cols-1 sm:grid-cols-2" onClear={clearFilters} showClear={activeCount > 0}>
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

export default BusinessUnitsTab;
