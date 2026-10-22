import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertCircle, Download } from 'lucide-react';
import { useBUPerformanceScorecard } from '@/hooks/useReports';
import { extractApiError } from '@/services/apiClient';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import DataTable from '@/components/common/DataTable';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const columnHelper = createColumnHelper();

// The Totals section must reflect every matching company/BU, not just the current server page,
// so the whole matching set is fetched once (capped well above any realistic monthly BU count)
// and paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const exportToExcel = (rows) => {
  const header = [
    'Company Code', 'Company Name', 'Entity ID', 'Active Employees', 'Active POs',
    'Total Invoiced', 'Total Delivery Cost', 'Total Margin', 'Avg Utilization %', 'Original Avg Utilization %',
  ];
  const dataRows = rows.map((r) => [
    r.company_code ?? '',
    r.company_name ?? '',
    r.entity_id ?? '',
    r.active_employees != null ? Number(r.active_employees) : '',
    r.active_pos != null ? Number(r.active_pos) : '',
    r.total_invoiced != null ? Number(r.total_invoiced) : '',
    r.total_delivery_cost != null ? Number(r.total_delivery_cost) : '',
    r.total_margin != null ? Number(r.total_margin) : '',
    r.avg_utilization_pct != null ? Number(r.avg_utilization_pct) : '',
    r.original_avg_utilization_pct != null ? Number(r.original_avg_utilization_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BU Performance Scorecard');
  XLSX.writeFile(wb, 'BU_Performance_Scorecard.xlsx');
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const MarginCell = ({ value }) => {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  const negative = Number(value) < 0;
  return (
    <span className={`tabular-nums font-medium ${negative ? 'text-destructive' : ''}`}>
      {formatCurrency(value)}
    </span>
  );
};

const columns = [
  columnHelper.accessor('company_code', {
    header: 'Company Code',
    size: 150,
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('company_name', {
    header: 'Company Name',
    size: 220,
    cell: (info) => <div className="truncate max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('entity_id', {
    header: 'Entity ID',
    size: 120,
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('active_employees', {
    header: 'Active Employees',
    size: 150,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? '—'}</span>,
  }),
  columnHelper.accessor('active_pos', {
    header: 'Active POs',
    size: 130,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? '—'}</span>,
  }),
  columnHelper.accessor('total_invoiced', {
    header: 'Total Invoiced',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_delivery_cost', {
    header: 'Total Delivery Cost',
    size: 170,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_margin', {
    header: 'Total Margin',
    size: 160,
    cell: (info) => <MarginCell value={info.getValue()} />,
  }),
  columnHelper.accessor('avg_utilization_pct', {
    header: 'Avg Utilization %',
    size: 150,
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
      return <span className="tabular-nums">{formatPercentage(Number(value))}</span>;
    },
  }),
  columnHelper.accessor('original_avg_utilization_pct', {
    header: 'Original Avg Utilization %',
    size: 170,
    cell: (info) => {
      const value = info.getValue();
      if (value == null || value === '') return null;
      return <span className="tabular-nums text-muted-foreground">{formatPercentage(Number(value))}</span>;
    },
  }),
];

const SummaryItem = ({ label, value, negative = false }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${negative ? 'text-destructive' : 'text-foreground'}`}>
      {value}
    </span>
  </div>
);

const BUPerformanceScorecard = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityIds, setEntityIds] = useState([]);
  const [buIds, setBuIds] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // NOT `buId` — unlike every other report, this endpoint doesn't go through
  // authenticateMultiBU/resolveReportCompanyScope (it's scoped to the caller's
  // req.entityIds instead, via requireEntityAdminOrAdmin), so it never reads the
  // X-Company-Id header getReport()/explicitBuScope would set for a `buId` param.
  // Backend has since migrated its BU filter to the standard `businessUnitIds`
  // (comma-separated, proper `Op.in`) — the old `companyId` param still works as a
  // fallback but silently truncated a multi-select to just its first id, so this now
  // sends the real one. `entityIds` is NOT sent: the backend scopes Entity via the
  // caller's own req.entityIds (authorization), not a query filter, so the Entity
  // control here only narrows which BUs the BU dropdown below it offers.
  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    ...(buIds.length > 0 && { businessUnitIds: buIds.join(',') }),
  };

  const { data, isPending, isError, error } = useBUPerformanceScorecard(params);

  const records = data?.data?.records ?? [];

  // Applied in memory — the whole matching set is already here (see MAX_RECORDS_FETCH), so there
  // is nothing to gain from a round-trip. Covers the identifying columns only; the numeric
  // metric columns are left out, since substring-matching a count or an amount misleads more
  // than it helps.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => [r.company_code, r.company_name, r.entity_id]
      .some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [records, search]);

  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);
  const errorMessage = isError ? extractApiError(error) : null;

  // Recomputed client-side from the full matching set rather than trusted from the backend's own
  // `summary` — its `total_invoiced_amount` field doesn't even match the row-level field
  // (`total_invoiced`) the table columns render, a copy-paste mismatch from another report.
  const summary = filteredRecords.length > 0 ? {
    total_invoiced: filteredRecords.reduce((sum, r) => sum + (Number(r.total_invoiced) || 0), 0),
    total_delivery_cost: filteredRecords.reduce((sum, r) => sum + (Number(r.total_delivery_cost) || 0), 0),
    total_margin: filteredRecords.reduce((sum, r) => sum + (Number(r.total_margin) || 0), 0),
  } : null;

  // Already have the full matching set in memory — no need for a second network round-trip.
  // Exports what the search actually leaves on screen, not the unfiltered set.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="BU Performance Scorecard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search Company Code, Name, Entity ID…"
              className="w-full sm:w-full md:w-72"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={(entityIds.length > 0 ? 1 : 0) + (buIds.length > 0 ? 1 : 0)}
            />
            {!errorMessage && filteredRecords.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      {/* Collapsible filter panel */}
      <FilterPanel
        isOpen={filtersOpen}
        maxHeightClass="max-h-[300px]"
        onClear={() => { setEntityIds([]); setBuIds([]); }}
        showClear={entityIds.length > 0 || buIds.length > 0}
      >
        <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setBuIds([]); }} />

        <BusinessUnitFilter multiple value={buIds} entityId={entityIds} onChange={setBuIds} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            clearable={false}
            className="w-full"
          />
        </div>
      </FilterPanel>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!errorMessage && (
        <>
          <DataTable
            columns={columns}
            data={pagedRecords}
            isLoading={isPending}
            pagination={{ page, limit, total: filteredRecords.length }}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
            mobileCards
          />

          {summary && (
            <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
              <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals (all pages)</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <SummaryItem label="Total Invoiced" value={formatCurrency(summary.total_invoiced)} />
                <SummaryItem label="Total Delivery Cost" value={formatCurrency(summary.total_delivery_cost)} />
                <SummaryItem
                  label="Total Margin"
                  value={formatCurrency(summary.total_margin)}
                  negative={Number(summary.total_margin) < 0}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BUPerformanceScorecard;
