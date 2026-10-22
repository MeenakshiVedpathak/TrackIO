import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useClientProfitabilityConcentration } from '@/hooks/useReports';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Progress } from '@/components/ui/progress';

const columnHelper = createColumnHelper();

// The Totals section must reflect every matching client, not just the current server page, so
// the whole matching set is fetched once (capped well above any realistic monthly client count)
// and paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const exportToExcel = (rows) => {
  const header = [
    'Client Name', 'Total Invoiced', 'Total Delivery Cost', 'Total Margin', 'Shortfall', 'Revenue Concentration %',
  ];
  const dataRows = rows.map((r) => [
    r.client_name ?? '',
    r.total_invoiced != null ? Number(r.total_invoiced) : '',
    r.total_delivery_cost != null ? Number(r.total_delivery_cost) : '',
    r.total_margin != null ? Number(r.total_margin) : '',
    r.margin_pct != null ? Number(r.margin_pct) : '',
    r.revenue_concentration_pct != null ? Number(r.revenue_concentration_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  // Excel sheet names are capped at 31 chars — the full report title doesn't fit.
  XLSX.utils.book_append_sheet(wb, ws, 'Profitability Concentration');
  XLSX.writeFile(wb, `Client_Profitability_Concentration.xlsx`);
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const columns = [
  columnHelper.accessor('client_name', {
    header: 'Client Name',
    size: 220,
    cell: (info) => <div className="truncate font-medium max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('total_invoiced', {
    header: 'Total Invoiced',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_delivery_cost', {
    header: 'Total Delivery Cost',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_margin', {
    header: 'Total Margin',
    size: 160,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>
          {formatCurrency(value)}
        </span>
      );
    },
  }),
  columnHelper.accessor('margin_pct', {
    header: 'Shortfall',
    size: 130,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>
          {formatPercentage(value)}
        </span>
      );
    },
  }),
  columnHelper.accessor('revenue_concentration_pct', {
    header: 'Revenue Concentration',
    size: 180,
    cell: (info) => {
      const value = info.getValue();
      return (
        <div className="flex items-center gap-2">
          <Progress value={Number(value)} className="h-1.5 w-16" />
          <span className="tabular-nums text-xs text-muted-foreground">{formatPercentage(value)}</span>
        </div>
      );
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

const ClientProfitabilityConcentration = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useClientProfitabilityConcentration(params);

  const records = data?.data?.records ?? [];

  // Applied in memory — the whole matching set is already here, so there is nothing to gain from
  // a round-trip. Covers the identifying columns only; the numeric/metric columns are left out,
  // since substring-matching an amount or a count misleads more than it helps.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => [r.client_name]
      .some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [records, search]);
  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

  // Recomputed client-side from the full matching set rather than trusted from the backend's own
  // `summary` — its field names (`total_invoiced_amount`) don't even match the row-level field
  // (`total_invoiced`) the table columns render, a copy-paste mismatch from another report.
  const summary = filteredRecords.length > 0 ? {
    total_invoiced: filteredRecords.reduce((sum, r) => sum + (Number(r.total_invoiced) || 0), 0),
    total_delivery_cost: filteredRecords.reduce((sum, r) => sum + (Number(r.total_delivery_cost) || 0), 0),
    total_margin: filteredRecords.reduce((sum, r) => sum + (Number(r.total_margin) || 0), 0),
  } : null;

  // Already have the full matching set in memory — no need for a second network round-trip.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Client Profitability & Concentration"
        description="Revenue concentration and margin per client for the selected month."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder="Search client…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full sm:w-full md:w-72"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={(entityId !== ALL_ENTITIES ? 1 : 0) + (buId !== ALL_BUS ? 1 : 0)}
              className="h-9"
            />
            {filteredRecords.length > 0 && (
              <Button variant="outline" size="sm" className="h-9" onClick={handleExport}>
                <Download className="mr-1.5 h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[340px]" onClear={() => { setEntityId(ALL_ENTITIES); setBuId(ALL_BUS); }} showClear={entityId !== ALL_ENTITIES || buId !== ALL_BUS}>
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={(val) => { setMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>
      </FilterPanel>

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
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Total Invoiced" value={formatCurrency(summary.total_invoiced)} />
            <SummaryItem label="Total Delivery Cost" value={formatCurrency(summary.total_delivery_cost)} />
            <SummaryItem
              label="Total Margin"
              value={formatCurrency(summary.total_margin)}
              negative={summary.total_margin < 0}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientProfitabilityConcentration;
