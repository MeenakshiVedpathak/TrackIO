import { useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useEmployeeRoleBuMapping } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useRoles } from '@/hooks/useRoles';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { extractReportRows } from '@/utils/reportEnvelope';
import { downloadBlob } from '@/utils/download';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import EntityFilter from '@/components/common/EntityFilter';
import { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';

const columnHelper = createColumnHelper();

// Roles/BUs/Sub-BUs all render the same way: the backend already comma-separates them into one
// string per employee (see the hook's own comment), so this just wraps that string instead of
// truncating it — a long list of roles/BUs is exactly the case this report exists to surface, so
// hiding it behind an ellipsis would defeat the point. `whitespace-normal break-words` (not
// `truncate`) lets a long value grow the ROW's height instead of the column's width — the
// column's own `size` below stays the one thing controlling table width.
const WrappingCell = (info) => (
  <span className="whitespace-normal break-words text-sm">{info.getValue() || <span className="text-muted-foreground">—</span>}</span>
);

const columns = [
  columnHelper.accessor('employee_name', {
    header: 'Employee Name',
    size: 200,
    cell: (info) => <span className="whitespace-normal break-words text-sm font-medium">{info.getValue() || '—'}</span>,
  }),
  columnHelper.accessor('roles', { header: 'Roles', size: 220, cell: WrappingCell }),
  columnHelper.accessor('business_units', { header: 'BUs', size: 220, cell: WrappingCell }),
  columnHelper.accessor('sub_business_units', { header: 'Sub BUs', size: 220, cell: WrappingCell }),
];

// Employee Role & Organization Mapping — a flat, server-paginated/searched table of every
// employee's current roles + Business Unit + Sub-BU mapping in one row, cross-referenced by
// Entity/BU/Sub-BU/Role/name-or-code search. No month/date period involved at all (unlike most
// reports in this suite) — it's a point-in-time snapshot of the org structure, not a trend.
//
// BU and Sub BU are deliberately two INDEPENDENT filters (not the combined
// `<BusinessUnitFilter multiple>` control most other reports use, which merges root+child
// selections into one array/param) — the backend wants them as separate `buIds`/`subBuIds` query
// params, so this reads `units` straight off useSelectableBusinessUnits itself and splits it by
// `parentId` locally instead.
const EmployeeRoleBuMappingReport = () => {
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [subBuIds, setSubBuIds] = useState([]);
  const [roleIds, setRoleIds] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { error: showError } = useNotification();

  const debouncedSearch = useDebounce(search, 400);

  // Entity-narrowed BU list (root + sub, `parentId` intact) — the same raw hook
  // `<BusinessUnitFilter>` uses internally, read directly here so BU and Sub BU can be split into
  // two separate filters instead of that component's own combined output.
  const { units: buUnits } = useSelectableBusinessUnits(entityIds);

  const rootBuOptions = useMemo(
    () => buUnits.filter((u) => u.parentId == null).map((u) => ({ label: u.name, value: String(u.id) })),
    [buUnits]
  );

  // Children of the selected BU(s) — or, with no BU picked yet, children of every root BU the
  // selected Entities offer, so Sub BU isn't stuck empty just because BU hasn't been touched.
  const subBuOptions = useMemo(() => {
    const parentIds = buIds.length > 0
      ? new Set(buIds.map(String))
      : new Set(rootBuOptions.map((o) => o.value));
    return buUnits
      .filter((u) => u.parentId != null && parentIds.has(String(u.parentId)))
      .map((u) => ({ label: u.name, value: String(u.id) }));
  }, [buUnits, buIds, rootBuOptions]);

  // Drops any BU/Sub-BU selection that no longer belongs once its parent filter narrows — an
  // Entity change reshapes rootBuOptions, which cascades into subBuOptions below, pruning both
  // in one effect pass instead of each filter's onChange handler having to reason about the
  // others. Each effect only calls setState when something would actually change, so this
  // settles in one extra render rather than looping.
  useEffect(() => {
    const valid = new Set(rootBuOptions.map((o) => o.value));
    setBuIds((prev) => (prev.some((id) => !valid.has(id)) ? prev.filter((id) => valid.has(id)) : prev));
  }, [rootBuOptions]);
  useEffect(() => {
    const valid = new Set(subBuOptions.map((o) => o.value));
    setSubBuIds((prev) => (prev.some((id) => !valid.has(id)) ? prev.filter((id) => valid.has(id)) : prev));
  }, [subBuOptions]);

  const { data: rolesData } = useRoles({ limit: 100 });
  const roleOptions = (rolesData?.data ?? []).map((r) => ({ label: r.role_name, value: String(r.id) }));

  const params = {
    ...(entityIds.length > 0 && { entityIds: entityIds.join(',') }),
    ...(buIds.length > 0 && { buIds: buIds.join(',') }),
    ...(subBuIds.length > 0 && { subBuIds: subBuIds.join(',') }),
    ...(roleIds.length > 0 && { roleIds: roleIds.join(',') }),
    ...(debouncedSearch && { search: debouncedSearch }),
    page,
    limit,
    // Sentinel — always drops the navbar's X-Company-Id header so entityIds/buIds/subBuIds above
    // narrow the login's full role reach instead of whatever BU happens to be globally active.
    buId: ALL_BUS,
  };

  const { data, isPending } = useEmployeeRoleBuMapping(params);
  const records = extractReportRows(data);
  const meta = data?.meta ?? {};

  const activeFilterCount = [
    entityIds.length > 0,
    buIds.length > 0,
    subBuIds.length > 0,
    roleIds.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityIds([]);
    setBuIds([]);
    setSubBuIds([]);
    setRoleIds([]);
    setSearch('');
    setPage(1);
  };

  // Full filtered set, exported server-side — not just the current page (this report is
  // server-paginated, so the rest of the result set isn't in memory), same reasoning
  // ProjectWiseTimesheetReport's own export documents.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { page: _p, limit: _l, ...exportParams } = params;
      const result = await reportsApi.exportEmployeeRoleBuMapping(exportParams);
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Employee Role & Organization Mapping"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search employee name or code…"
              className="w-full sm:w-full md:w-72"
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={isExporting} className="order-2 md:order-none">
                <Download className="h-4 w-4" />{isExporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="order-1 h-[clamp(1.875rem,2vw,2.25rem)] md:order-none"
            />
          </div>
        }
      />

      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[320px]"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter
          multiple
          value={entityIds}
          onChange={(v) => { setEntityIds(v); setPage(1); }}
        />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Business Unit</Label>
          <MultiSelect
            options={rootBuOptions}
            value={buIds}
            onValueChange={(v) => { setBuIds(v); setPage(1); }}
            placeholder="All Business Units"
            searchPlaceholder="Search business unit..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Sub BU</Label>
          <MultiSelect
            options={subBuOptions}
            value={subBuIds}
            onValueChange={(v) => { setSubBuIds(v); setPage(1); }}
            placeholder="All Sub BUs"
            searchPlaceholder="Search sub BU..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Role</Label>
          <MultiSelect
            options={roleOptions}
            value={roleIds}
            onValueChange={(v) => { setRoleIds(v); setPage(1); }}
            placeholder="All Roles"
            searchPlaceholder="Search role..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
      </FilterPanel>

      <DataTable
        mobileCards
        columns={columns}
        data={records}
        isLoading={isPending}
        pagination={meta.total != null ? { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />
    </div>
  );
};

export default EmployeeRoleBuMappingReport;
