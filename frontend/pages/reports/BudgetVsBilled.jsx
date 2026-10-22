import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import {
  AlertCircle, ChevronDown, ChevronsUpDown, ChevronUp, Download,
  Wallet, ReceiptText, CircleArrowDown, CircleArrowUp, PieChart, TrendingUp, TrendingDown, Table2,
} from 'lucide-react';
import { useBudgetVsBilled } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';
import { useActiveClients } from '@/hooks/useClients';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { extractApiError } from '@/services/apiClient';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

const columnHelper = createColumnHelper();

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const PERIOD_MODE_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'range', label: 'Date Range' },
];

const exportToExcel = (rows) => {
  const header = ['PO Code', 'PO Name', 'Client', 'Budget Cost', 'Billed Amount', 'Variance', 'Variance %'];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client_name ?? '',
    r.budget_cost != null ? Number(r.budget_cost) : '',
    r.billed_amount != null ? Number(r.billed_amount) : '',
    r.variance != null ? Number(r.variance) : '',
    r.variance_pct != null ? Number(r.variance_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Budget vs Billed');
  XLSX.writeFile(wb, 'Budget_vs_Billed.xlsx');
};

const SortableHeader = ({ label, column, sortBy, sortOrder, onSort }) => {
  const isActive = sortBy === column;
  const Icon = isActive ? (sortOrder === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <Icon className={cn('h-3 w-3', !isActive && 'opacity-40')} />
    </button>
  );
};

const BudgetVsBilled = () => {
  const [periodMode, setPeriodMode] = useState('month');
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [dateRange, setDateRange] = useState(null);

  const [clientId, setClientId] = useState('all');
  const [serviceTypeId, setServiceTypeId] = useState('all');
  const [poId, setPoId] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');

  const [sheetKind, setSheetKind] = useState(null); // 'over' | 'under' | null
  const [exporting, setExporting] = useState(false);

  const { data: activeClients = [] } = useActiveClients();
  const { data: activeServiceTypes = [] } = useActiveServiceTypes();
  const { data: activePOs = [] } = useActiveServicePOs();

  // Service Type -> Project (Service PO) cascade, same as ClientServicePOHoursReport.
  const filteredPOs = serviceTypeId === 'all'
    ? activePOs
    : activePOs.filter((po) => String(po.serviceType?.id) === serviceTypeId);

  const handleServiceTypeChange = (v) => {
    setServiceTypeId(v);
    setPoId('all');
    setPage(1);
  };

  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const periodReady = periodMode === 'month'
    ? !!(monthYear?.month && monthYear?.year)
    : !!(dateRange?.startDate && dateRange?.endDate);

  const params = {
    ...(periodMode === 'month'
      ? (monthYear && { month: monthYear.month, year: monthYear.year })
      : (dateRange?.startDate && dateRange?.endDate && { startDate: dateRange.startDate, endDate: dateRange.endDate })),
    ...(clientId !== 'all' && { clientId }),
    ...(poId !== 'all' && { poId }),
    ...(serviceTypeId !== 'all' && { serviceTypeId }),
    ...(sortBy && { sortBy, sortOrder }),
    page,
    limit,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending, isError, error } = useBudgetVsBilled(params);

  const monthly = data?.data?.monthly ?? [];
  const byServicePO = data?.data?.by_service_po?.data ?? [];
  const meta = data?.data?.by_service_po?.meta ?? {};
  const summary = data?.data?.summary ?? null;
  const overBudget = data?.data?.over_budget_service_pos ?? [];
  const underBudget = data?.data?.under_budget_service_pos ?? [];

  const showLoading = periodReady && isPending;
  const errorMessage = periodReady && isError ? extractApiError(error) : null;

  const sheetRows = sheetKind === 'over' ? overBudget : sheetKind === 'under' ? underBudget : [];
  const sheetTitle = sheetKind === 'over' ? 'Over Budget Service POs' : 'Under Budget Service POs';

  const activeFilterCount = [
    entityId !== ALL_ENTITIES,
    buId !== ALL_BUS,
    clientId !== 'all',
    serviceTypeId !== 'all',
    poId !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setClientId('all');
    setServiceTypeId('all');
    setPoId('all');
    setPage(1);
  };

  const columns = useMemo(() => [
    columnHelper.accessor('service_po_code', {
      header: 'PO Code',
      size: 150,
      meta: { sticky: true, left: 0 },
      enableSorting: false,
      cell: (info) => (
        <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
          {info.getValue() || '—'}
        </span>
      ),
    }),
    columnHelper.accessor('service_po_name', {
      header: 'PO Name',
      size: 220,
      meta: { sticky: true, left: 150 },
      enableSorting: false,
      cell: (info) => <div className="truncate font-medium max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    columnHelper.accessor('client_name', {
      header: 'Client',
      size: 200,
      enableSorting: false,
      cell: (info) => <div className="truncate max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
    }),
    columnHelper.accessor('budget_cost', {
      header: () => (
        <SortableHeader label="Budget Cost" column="budget_cost" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 160,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('billed_amount', {
      header: () => (
        <SortableHeader label="Billed Amount" column="billed_amount" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 160,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('variance', {
      header: () => (
        <SortableHeader label="Variance" column="variance" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 160,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        return (
          <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(value)}
          </span>
        );
      },
    }),
    columnHelper.accessor('variance_pct', {
      header: () => (
        <SortableHeader label="Variance %" column="variance_pct" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
      ),
      size: 130,
      meta: { align: 'right' },
      enableSorting: false,
      cell: (info) => {
        const value = info.getValue();
        return (
          <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>
            {formatPercentage(value)}
          </span>
        );
      },
    }),
  ], [sortBy, sortOrder]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const total = meta.total > 0 ? meta.total : 1000;
      const res = await reportsApi.getBudgetVsBilled({ ...params, page: 1, limit: total });
      const allRows = res?.data?.by_service_po?.data ?? [];
      exportToExcel(allRows);
    } finally {
      setExporting(false);
    }
  };

  // Summary tiles — same four totals as before, now rendered as icon cards. Colour and icon
  // follow the value's sign so a negative variance reads red/down and a surplus reads green/up.
  const summaryCards = summary ? [
    {
      label: 'Total Budget Cost',
      value: formatCurrency(summary.total_budget_cost),
      valueClass: 'text-blue-600 dark:text-blue-400',
      Icon: Wallet,
      iconWrap: 'bg-blue-50 dark:bg-blue-500/10',
      iconClass: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Total Billed Amount',
      value: formatCurrency(summary.total_billed_amount),
      valueClass: 'text-foreground',
      Icon: ReceiptText,
      iconWrap: 'bg-emerald-50 dark:bg-emerald-500/10',
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Total Variance',
      value: formatCurrency(summary.total_variance),
      valueClass: summary.total_variance < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
      Icon: summary.total_variance < 0 ? CircleArrowDown : CircleArrowUp,
      iconWrap: summary.total_variance < 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10',
      iconClass: summary.total_variance < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Overall Variance %',
      value: formatPercentage(summary.total_variance_pct),
      valueClass: summary.total_variance_pct < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
      Icon: PieChart,
      iconWrap: 'bg-violet-50 dark:bg-violet-500/10',
      iconClass: 'text-violet-600 dark:text-violet-400',
    },
  ] : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Budget vs Billed
            <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </span>
        }
        description="Budget cost vs billed amount per Service PO, with a monthly trend and over/under-budget breakdown."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="h-9"
            />
            {byServicePO.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[460px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Period <span className="text-destructive">*</span></Label>
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border w-fit shrink-0">
            {PERIOD_MODE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handlePeriodModeChange(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                  periodMode === value ? 'bg-card shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{periodMode === 'month' ? 'Month & Year' : 'Date Range'} <span className="text-destructive">*</span></Label>
          {periodMode === 'month' ? (
            <MonthYearPicker
              value={monthYear}
              onChange={(val) => { setMonthYear(val); setPage(1); }}
              placeholder="Select month"
              clearable={false}
              className="w-full"
            />
          ) : (
            <DateRangePicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); setPage(1); }}
              placeholder="Select date range"
              className="w-full"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Client</Label>
          <SearchableSelect
            options={[
              { label: 'All Clients', value: 'all' },
              ...activeClients.map((c) => ({ label: c.client_name, value: String(c.id) })),
            ]}
            value={clientId}
            onValueChange={(v) => { setClientId(v); setPage(1); }}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Service Type</Label>
          <SearchableSelect
            options={[
              { label: 'All Service Types', value: 'all' },
              ...activeServiceTypes.map((st) => ({ label: st.service_type_name, value: String(st.id) })),
            ]}
            value={serviceTypeId}
            onValueChange={handleServiceTypeChange}
            placeholder="All Service Types"
            searchPlaceholder="Search service type..."
            className="h-9 w-full text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Project (Service PO)</Label>
          <SearchableSelect
            options={[
              { label: 'All Projects', value: 'all' },
              ...filteredPOs.map((po) => ({
                label: po.service_po_name || po.service_po_code || String(po.id),
                value: String(po.id),
              })),
            ]}
            value={poId}
            onValueChange={(v) => { setPoId(v); setPage(1); }}
            placeholder="All Projects"
            searchPlaceholder="Search project..."
            className="h-9 w-full text-sm"
          />
        </div>
      </FilterPanel>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {summaryCards.length > 0 && (
        <div className="mb-3 grid grid-cols-1 rounded-xl border bg-card shadow-sm lg:grid-cols-4">
          {summaryCards.map(({ label, value, valueClass, Icon, iconWrap, iconClass }, i) => (
            <div
              key={label}
              className={cn(
                'flex items-center justify-between gap-3 px-5 py-4',
                i > 0 && 'border-t lg:border-t-0 lg:border-l'
              )}
            >
              <div className="min-w-0">
                <p className="text-[13px] text-muted-foreground">{label}</p>
                <p className={cn('mt-1 text-xl font-bold tabular-nums', valueClass)}>{value}</p>
              </div>
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconWrap)}>
                <Icon className={cn('h-5 w-5', iconClass)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <button
          type="button"
          onClick={() => setSheetKind('over')}
          className="flex items-center justify-between gap-4 rounded-xl border bg-card shadow-sm px-5 py-4 text-left transition-colors hover:bg-muted/40"
        >
          <div>
            <p className="text-[13px] text-muted-foreground">Over Budget</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">{overBudget.length}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
            <TrendingUp className="h-5 w-5 text-red-500 dark:text-red-400" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => setSheetKind('under')}
          className="flex items-center justify-between gap-4 rounded-xl border bg-card shadow-sm px-5 py-4 text-left transition-colors hover:bg-muted/40"
        >
          <div>
            <p className="text-[13px] text-muted-foreground">Under Budget</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{underBudget.length}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
            <TrendingDown className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
          </div>
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-[15px] font-semibold text-foreground">Monthly Trend</h2>
      </div>
      <div className="mb-4 hidden rounded-xl border bg-card shadow-sm overflow-hidden md:block">
        <Table containerClassName="max-h-[220px] overflow-auto">
          <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_0_rgb(0,0,0,0.1)]">
            <TableRow className="hover:bg-transparent border-b bg-slate-50">
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Budget Cost</TableHead>
              <TableHead className="text-right">Billed Amount</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="text-right">Variance %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            ) : !periodReady ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState title="Select a period" description="Choose a month or a date range to load the report." />
                </TableCell>
              </TableRow>
            ) : monthly.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState title="No monthly data" description="No monthly budget vs billed data for the selected filters." />
                </TableCell>
              </TableRow>
            ) : (
              monthly.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium whitespace-nowrap">{m.month}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(m.budget_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(m.billed_amount)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${m.variance < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(m.variance)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${m.variance_pct < 0 ? 'text-destructive' : ''}`}>
                    {formatPercentage(m.variance_pct)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: same `monthly` data as the desktop table above, as a compact card list instead
          of a small horizontally-cramped table. */}
      <div className="mb-4 max-h-[320px] space-y-2 overflow-y-auto md:hidden">
        {showLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !periodReady ? (
          <EmptyState title="Select a period" description="Choose a month or a date range to load the report." />
        ) : monthly.length === 0 ? (
          <EmptyState title="No monthly data" description="No monthly budget vs billed data for the selected filters." />
        ) : (
          monthly.map((m, i) => (
            <div key={i} className="rounded-lg border bg-white p-3">
              <p className="mb-1.5 text-sm font-semibold">{m.month}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Budget Cost</p>
                  <p className="font-medium tabular-nums">{formatCurrency(m.budget_cost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Billed Amount</p>
                  <p className="font-medium tabular-nums">{formatCurrency(m.billed_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Variance</p>
                  <p className={`font-medium tabular-nums ${m.variance < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(m.variance)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Variance %</p>
                  <p className={`font-medium tabular-nums ${m.variance_pct < 0 ? 'text-destructive' : ''}`}>
                    {formatPercentage(m.variance_pct)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mb-2 flex items-center gap-2">
        <Table2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-[15px] font-semibold text-foreground">By Service PO</h2>
      </div>
      <DataTable
        tableContainerClassName="rounded-xl shadow-sm"
        columns={columns}
        data={byServicePO}
        isLoading={showLoading}
        mobileCards
        emptyState={!periodReady ? (
          <EmptyState title="Select a period" description="Choose a month or a date range to load the report." />
        ) : undefined}
        pagination={meta.total != null ? {
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total,
        } : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
      />

      <Sheet open={!!sheetKind} onOpenChange={(open) => !open && setSheetKind(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-white overflow-hidden">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="text-left">{sheetTitle}</SheetTitle>
            <p className="text-xs text-muted-foreground">{sheetRows.length} Service PO{sheetRows.length !== 1 ? 's' : ''}</p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {sheetRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Service POs found.</p>
            ) : (
              <div className="space-y-2">
                {sheetRows.map((row) => (
                  <div key={row.service_po_id} className="rounded-md border px-3 py-2.5">
                    <p className="mb-0.5 text-xs font-semibold text-foreground truncate">{row.service_po_name || '—'}</p>
                    <p className="mb-1.5 text-[11px] text-muted-foreground truncate">
                      {row.service_po_code || '—'} · {row.client_name || '—'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Budget Cost</p>
                        <p className="font-medium tabular-nums">{formatCurrency(row.budget_cost)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Billed Amount</p>
                        <p className="font-medium tabular-nums">{formatCurrency(row.billed_amount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Variance</p>
                        <p className={`font-medium tabular-nums ${row.variance < 0 ? 'text-destructive' : ''}`}>
                          {formatCurrency(row.variance)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BudgetVsBilled;
