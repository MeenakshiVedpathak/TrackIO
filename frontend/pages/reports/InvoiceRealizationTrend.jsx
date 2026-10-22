import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, AlertCircle } from 'lucide-react';
import { useInvoiceRealizationTrend } from '@/hooks/useReports';
import { formatCurrency, formatMonthYear } from '@/utils/formatters';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const columnHelper = createColumnHelper();

// The Totals section must reflect every matching Service PO, not just the current server page,
// so the whole matching set is fetched once (capped well above any realistic PO count for a
// 6-month range) and paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

// Matches how every other amount figure in this report suite treats negative values (e.g.
// Service PO Summary's Unbilled Amount, every report's Total Margin) — negative is flagged red,
// zero/positive stays neutral. A positive unbilled balance is routine (not yet billed, not a
// problem), so it doesn't get a "warning" color of its own.
const negativeColorClass = (value) => (value != null && value < 0 ? 'text-destructive' : 'text-foreground');

const exportToExcel = (rows) => {
  const header = ['PO Code', 'PO Name', 'Client', 'Total Invoiced', 'Total Billed', 'Total Unbilled', 'Months Outstanding'];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client_name ?? '',
    r.total_invoiced != null ? Number(r.total_invoiced) : '',
    r.total_billed != null ? Number(r.total_billed) : '',
    r.total_unbilled != null ? Number(r.total_unbilled) : '',
    r.months_outstanding ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice Realization Trend');
  XLSX.writeFile(wb, 'Invoice_Realization_Trend.xlsx');
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const startMonthDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);

const columns = [
  columnHelper.accessor('service_po_code', {
    header: 'PO Code',
    size: 140,
    meta: { sticky: true, left: 0 },
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('service_po_name', {
    header: 'PO Name',
    size: 220,
    meta: { sticky: true, left: 140 },
    cell: (info) => <div className="truncate font-medium max-w-[200px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('client_name', {
    header: 'Client',
    size: 200,
    cell: (info) => <div className="truncate max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('total_invoiced', {
    header: 'Total Invoiced',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_billed', {
    header: 'Total Billed',
    size: 160,
    cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  }),
  columnHelper.accessor('total_unbilled', {
    header: 'Total Unbilled',
    size: 160,
    cell: (info) => (
      <span className={`tabular-nums font-medium ${negativeColorClass(info.getValue())}`}>
        {formatCurrency(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor('months_outstanding', {
    header: 'Months Outstanding',
    size: 160,
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? '—'}</span>,
  }),
];

const SummaryItem = ({ label, value, colorClass }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${colorClass ?? 'text-foreground'}`}>{value}</span>
  </div>
);

const InvoiceRealizationTrend = () => {
  const [fromMonthYear, setFromMonthYear] = useState({
    month: startMonthDate.getMonth() + 1,
    year: startMonthDate.getFullYear(),
  });
  const [toMonthYear, setToMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedRow, setSelectedRow] = useState(null);

  const params = {
    ...(fromMonthYear && { startMonth: fromMonthYear.month, startYear: fromMonthYear.year }),
    ...(toMonthYear && { endMonth: toMonthYear.month, endYear: toMonthYear.year }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useInvoiceRealizationTrend(params);

  const records = data?.data?.records ?? [];

  // Applied in memory — the whole matching set is already here, so there is nothing to gain from
  // a round-trip. Covers the identifying columns only; the numeric/metric columns are left out,
  // since substring-matching an amount or a count misleads more than it helps.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => [r.service_po_code, r.service_po_name, r.client_name]
      .some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [records, search]);
  const pagedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

  // Recomputed client-side from the full matching set rather than trusted from the backend's
  // direct `total_invoiced_amount`/`total_billed_amount`/`total_unbilled_amount` fields — those
  // names don't even match the row-level fields (`total_invoiced`/`total_billed`/`total_unbilled`)
  // the table columns render, a copy-paste mismatch from another report.
  const summary = filteredRecords.length > 0 ? {
    total_invoiced: filteredRecords.reduce((sum, r) => sum + (Number(r.total_invoiced) || 0), 0),
    total_billed: filteredRecords.reduce((sum, r) => sum + (Number(r.total_billed) || 0), 0),
    total_unbilled: filteredRecords.reduce((sum, r) => sum + (Number(r.total_unbilled) || 0), 0),
  } : null;

  // Already have the full matching set in memory — no need for a second network round-trip.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Invoice Realization Trend"
        description="Invoiced vs billed amounts per Service PO across a month range, with a monthly trend drill-down."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search PO Code, PO Name, Client…"
              className="w-full sm:w-full md:w-72"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={(entityId !== ALL_ENTITIES ? 1 : 0) + (buId !== ALL_BUS ? 1 : 0)}
              className="h-9"
            />
            {filteredRecords.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[300px]" onClear={() => { setEntityId(ALL_ENTITIES); setBuId(ALL_BUS); }} showClear={entityId !== ALL_ENTITIES || buId !== ALL_BUS}>
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">From <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={fromMonthYear}
            onChange={(val) => { setFromMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">To <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={toMonthYear}
            onChange={(val) => { setToMonthYear(val); setPage(1); }}
            placeholder="Select month"
            className="w-full"
          />
        </div>
      </FilterPanel>

      {filteredRecords.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {/*
            Fixed, business-friendly wording — deliberately not sourced from the backend's own
            `note` field, which described this in raw schema/table terms (see the bug this fixed).
          */}
          <p>"Months Outstanding" is an estimate — it counts how many months in this range had an unbilled balance for the Service PO. It isn't based on actual invoice due dates.</p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={pagedRecords}
        isLoading={isPending}
        pagination={{ page, limit, total: filteredRecords.length }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        onRowClick={(row) => setSelectedRow(row)}
        mobileCards
      />

      {summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals (all pages)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Total Invoiced" value={formatCurrency(summary.total_invoiced)} />
            <SummaryItem label="Total Billed" value={formatCurrency(summary.total_billed)} />
            <SummaryItem
              label="Total Unbilled"
              value={formatCurrency(summary.total_unbilled)}
              colorClass={negativeColorClass(summary.total_unbilled)}
            />
          </div>
        </div>
      )}

      <Sheet open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-white overflow-hidden">
          {selectedRow && (
            <>
              <SheetHeader className="px-5 py-4 border-b">
                <SheetTitle className="text-left">{selectedRow.service_po_name || '—'}</SheetTitle>
                <p className="text-xs text-muted-foreground">{selectedRow.client_name || '—'}</p>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Monthly Trend ({(selectedRow.monthly_trend ?? []).length})
                </p>
                {(selectedRow.monthly_trend ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No monthly trend data available.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedRow.monthly_trend.map((m, i) => (
                      <div key={i} className="rounded-md border px-3 py-2.5">
                        <p className="mb-1.5 text-xs font-semibold text-foreground">{formatMonthYear(m.month, m.year)}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Invoice Amount</p>
                            <p className="font-medium tabular-nums">{formatCurrency(m.invoice_amount)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Billed Amount</p>
                            <p className="font-medium tabular-nums">{formatCurrency(m.billed_amount)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Unbilled</p>
                            <p className={`font-medium tabular-nums ${negativeColorClass(m.unbilled)}`}>
                              {formatCurrency(m.unbilled)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default InvoiceRealizationTrend;
