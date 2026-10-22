import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Download, RotateCcw } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import ServicePoBudgetEntrySheet from './ServicePoBudgetEntrySheet';
import ServicePoMonthlyBudgetList from './ServicePoMonthlyBudgetList';
import MonthSummaryStrip from './MonthSummaryStrip';
import { useServicePoMonthlyBudgetList, useServicePoMonthlyBudgetYearSummary } from '@/hooks/useServicePoMonthlyBudget';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useDebounce } from '@/hooks/useDebounce';
import { getInvoiceMasterCountdown } from '@/utils/invoiceMasterWindow';

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

const ServicePoMonthlyBudgetPage = () => {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  // null = sheet closed, otherwise { servicePoId, month, year } for the PO card that was clicked.
  const [editSheet, setEditSheet] = useState(null);

  const monthlyListRef = useRef(null);
  const [canExport, setCanExport] = useState(false);
  const handleExportStateChange = useCallback((can) => setCanExport(can), []);

  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [poFilter, setPoFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 400);

  // Business Unit filter — the Reports-suite convention (components/common/BusinessUnitFilter +
  // explicitBuScope), not the Masters' useMasterBuFilter: this screen is consumed by every
  // BU-mapped login, so the filter renders whenever the login has ANY mapped BU rather than only
  // above two. Defaults to "All Business Units", same as every report. The control hides itself
  // for a login with no BU at all (Platform Admin/Entity Admin), which is already unscoped.
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const isEntityFiltered = entityId !== ALL_ENTITIES;
  const [buId, setBuId] = useState(ALL_BUS);
  const isBuFiltered = buId !== ALL_BUS;

  const { data: activeClients = [] } = useActiveClients();
  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activeServiceCategories = [] } = useActiveServiceCategories();
  const monthSummaries = useServicePoMonthlyBudgetYearSummary(year, buId);
  const { data: records = [], isPending: isListLoading } = useServicePoMonthlyBudgetList(selectedMonth, year, buId);

  // The budget records above are BU-scoped by the request itself, but the Service PO lookups this
  // page also relies on — the "Service PO" dropdown and the month strip's "x/y filled"
  // denominator — come from the shared, cross-BU active-PO cache, which takes no BU parameter.
  // Narrow them here off each PO's own company_id so a chosen BU doesn't leave the dropdown
  // offering POs that can't appear in the grid, or an x/y ratio counting another BU's POs.
  // Guarded on the field actually being present in the payload: if it isn't, fall back to the
  // full list rather than silently rendering an empty dropdown and a 0 denominator.
  const buScopedPOs = useMemo(() => {
    if (!isBuFiltered) return activePOs;
    if (!activePOs.some((po) => po.company_id != null)) return activePOs;
    return activePOs.filter((po) => String(po.company_id) === String(buId));
  }, [activePOs, isBuFiltered, buId]);

  const isCurrentPeriod = selectedMonth === CURRENT_MONTH && year === CURRENT_YEAR;
  const countdown = useMemo(() => getInvoiceMasterCountdown(selectedMonth, year), [selectedMonth, year]);

  // Type → Category, so a PO can be matched against a selected Category via its own Type.
  const typeCategoryMap = useMemo(() => {
    const map = new Map();
    activeServiceTypes.forEach((t) => map.set(String(t.id), String(t.service_category_id)));
    return map;
  }, [activeServiceTypes]);

  // Category → Type: only show types belonging to the selected category
  const filteredServiceTypes = categoryFilter === 'all'
    ? activeServiceTypes
    : activeServiceTypes.filter((t) => String(t.service_category_id) === categoryFilter);

  // Type (or Category, if no type chosen yet) → Service PO
  const filteredPOs = buScopedPOs.filter((po) => {
    const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
    if (typeFilter !== 'all') return poTypeId === typeFilter;
    if (categoryFilter !== 'all') return poTypeId != null && typeCategoryMap.get(poTypeId) === categoryFilter;
    return true;
  });

  // Resolves Category/Type/PO into the concrete set of Service PO ids a budget record's own
  // `service_po_id` must belong to — null means "no restriction from these three filters".
  const allowedPoIds = useMemo(() => {
    if (categoryFilter === 'all' && typeFilter === 'all' && poFilter === 'all') {
      return null;
    }
    const ids = new Set();
    for (const po of buScopedPOs) {
      if (poFilter !== 'all' && String(po.id) !== poFilter) continue;
      const poTypeId = po.serviceType?.id != null ? String(po.serviceType.id) : null;
      if (typeFilter !== 'all' && poTypeId !== typeFilter) continue;
      if (categoryFilter !== 'all' && (poTypeId == null || typeCategoryMap.get(poTypeId) !== categoryFilter)) continue;
      ids.add(po.id);
    }
    return ids;
  }, [buScopedPOs, categoryFilter, typeFilter, poFilter, typeCategoryMap]);

  const handleCategoryChange = (v) => {
    setCategoryFilter(v);
    setTypeFilter('all');
    setPoFilter('all');
  };

  const handleTypeChange = (v) => {
    setTypeFilter(v);
    setPoFilter('all');
  };

  const activeFilterCount = [clientFilter, categoryFilter, typeFilter, poFilter]
    .filter((v) => v !== 'all').length + (isEntityFiltered ? 1 : 0) + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setClientFilter('all');
    setCategoryFilter('all');
    setTypeFilter('all');
    setPoFilter('all');
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
  };

  // Picking a different Entity can strand a BU (and everything chained off it) that no longer
  // belongs to the new Entity — reset the whole chain the same way changing BU does below.
  const handleEntityChange = (v) => {
    setEntityId(v);
    setBuId(ALL_BUS);
    setCategoryFilter('all');
    setTypeFilter('all');
    setPoFilter('all');
  };

  // Narrowing the BU can strand a Service PO / Type / Category selection that belongs to a BU no
  // longer in scope, which reads as an empty grid with no obvious cause — reset the PO chain the
  // same way changing Category resets Type and PO.
  const handleBuChange = (v) => {
    setBuId(v);
    setCategoryFilter('all');
    setTypeFilter('all');
    setPoFilter('all');
  };

  const handleYearChange = (next) => {
    setYear(next);
    // Jumping years keeps the same calendar month selected — only "This month" resets both.
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monthly PO Reporting"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border px-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleYearChange(year - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-sm font-semibold">{year}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleYearChange(year + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {!isCurrentPeriod && (
              <Button
                type="button"
                variant="ghost"
                size="toolbar"
                className="text-xs"
                onClick={() => {
                  setYear(CURRENT_YEAR);
                  setSelectedMonth(CURRENT_MONTH);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> This month
              </Button>
            )}

            {countdown.writable && (
              <Badge
                variant={
                  countdown.severity === 'critical' ? 'destructive'
                    : countdown.severity === 'warning' ? 'warning'
                    : 'info'
                }
                className="gap-1 font-medium"
                title="Time left to fill/edit this period's Monthly PO Reporting"
              >
                <Clock className="h-3 w-3" /> {countdown.label} to fill
              </Badge>
            )}

            <SearchInput
              placeholder="Search PO, code, client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="h-9"
            />

            <Button
              variant="outline"
              size="toolbar"
              disabled={!canExport}
              onClick={() => monthlyListRef.current?.exportExcel()}
            >
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </div>
        }
      />

      {/* All five filters on one row (the panel's default caps at 4 per row, which wrapped
          Service PO onto a second line once Business Unit was added). Steps down on narrower
          viewports rather than squeezing five selects into a phone width. */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[460px]"
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 w-full"
        onClear={clearFilters}
        showClear={activeFilterCount > 0}
      >
        <EntityFilter value={entityId} onChange={handleEntityChange} className="h-9 w-full text-sm" />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={handleBuChange} className="h-9 w-full text-sm" />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <SearchableSelect
            options={[
              { label: 'All Clients', value: 'all' },
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientFilter}
            onValueChange={setClientFilter}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category</Label>
          <SearchableSelect
            showSearch={false}
            options={[
              { label: 'All Categories', value: 'all' },
              ...activeServiceCategories.map((c) => ({ label: c.name, value: String(c.id) })),
            ]}
            value={categoryFilter}
            onValueChange={handleCategoryChange}
            placeholder="All Categories"
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service Type</Label>
          <SearchableSelect
            options={[
              { label: 'All Service Types', value: 'all' },
              ...filteredServiceTypes.map((t) => ({ label: t.service_type_name, value: String(t.id) })),
            ]}
            value={typeFilter}
            onValueChange={handleTypeChange}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service PO</Label>
          <SearchableSelect
            options={[
              { label: 'All POs', value: 'all' },
              ...filteredPOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poFilter}
            onValueChange={setPoFilter}
            placeholder="All POs"
            searchPlaceholder="Search PO..."
            className="h-9 w-full text-sm"
          />
        </div>
      </FilterPanel>

      <MonthSummaryStrip
        year={year}
        summaries={monthSummaries}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        currentMonth={CURRENT_MONTH}
        currentYear={CURRENT_YEAR}
        totalPOCount={buScopedPOs.length}
      />

      <ServicePoMonthlyBudgetList
        ref={monthlyListRef}
        month={selectedMonth}
        year={year}
        records={records}
        isLoading={isListLoading}
        search={debouncedSearch}
        clientFilter={clientFilter}
        poFilterIds={allowedPoIds}
        buId={buId}
        onEdit={(poId) => setEditSheet({ servicePoId: String(poId), month: selectedMonth, year })}
        onExportStateChange={handleExportStateChange}
        countdown={countdown}
      />

      <ServicePoBudgetEntrySheet
        open={editSheet !== null}
        onOpenChange={(next) => !next && setEditSheet(null)}
        month={editSheet?.month ?? selectedMonth}
        year={editSheet?.year ?? year}
        initialServicePoId={editSheet?.servicePoId ?? ''}
        buId={buId}
      />
    </div>
  );
};

export default ServicePoMonthlyBudgetPage;
