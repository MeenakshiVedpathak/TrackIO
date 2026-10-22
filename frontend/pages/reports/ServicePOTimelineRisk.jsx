import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useServicePOTimelineRisk } from '@/hooks/useReports';
// formatCurrency is only needed by the hidden PO Value column — re-add it to this import when
// that column is restored (see the HIDDEN COLUMNS note below).
import { formatHours, formatPercentage, formatDate } from '@/utils/formatters';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import SearchInput from '@/components/common/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';

const columnHelper = createColumnHelper();

// The "This Page" counts must reflect every matching PO, not just the current server page, so
// the whole matching set is fetched once (capped well above any realistic monthly PO count) and
// paginated client-side from there.
const MAX_RECORDS_FETCH = 5000;

const RISK_LEVEL_CONFIG = {
  on_track: { label: 'On Track', variant: 'success' },
  at_risk: { label: 'At Risk', variant: 'warning' },
  critical: { label: 'Critical', variant: 'destructive' },
  overdue: { label: 'Overdue', variant: 'destructive' },
};

const RiskLevelBadge = ({ value }) => {
  const config = RISK_LEVEL_CONFIG[value] ?? { label: value ?? '—', variant: 'muted' };
  // Overdue is visually distinguished from Critical (both map to the same badge variant)
  // via a bold, darker-red label style.
  return (
    <Badge
      variant={config.variant}
      className={value === 'overdue' ? 'font-bold text-red-700 dark:text-red-400' : ''}
    >
      {config.label}
    </Badge>
  );
};

// ── HIDDEN COLUMNS ────────────────────────────────────────────────────────────────────────────
// po_value, expected_man_hours, consumed_hours_pct and projected_exhaustion_date come back null
// on EVERY record from GET /reports/service-po-timeline-risk, so all four rendered as a solid
// column of "—" in both the table and the export. The first two are stored Service PO fields the
// endpoint simply isn't selecting (po_value is accepted by the Service PO import and rendered by
// Service PO Master's own list); the other two are derived from them, which is why they're null
// too. Commented out rather than deleted — same convention as ServicePOSummary's own
// expected_man_hours column — so restoring them is an uncomment once the backend returns them.
// Note that risk_level, still shown, is elapsed-time-only until consumed_hours_pct exists.
// ──────────────────────────────────────────────────────────────────────────────────────────────
const exportToExcel = (rows) => {
  const header = [
    'PO Code', 'PO Name', 'Client', 'Status', 'Start Date', 'End Date',
    // 'PO Value', 'Expected Man Hours',
    'Hours Delivered To Date', 'Elapsed Time %',
    // 'Consumed Hours %',
    'Risk Level',
    // 'Projected Exhaustion Date',
  ];
  const dataRows = rows.map((r) => [
    r.service_po_code ?? '',
    r.service_po_name ?? '',
    r.client_name ?? '',
    r.status ?? '',
    r.start_date ? formatDate(r.start_date) : '',
    r.end_date ? formatDate(r.end_date) : '',
    // r.po_value != null ? Number(r.po_value) : '',
    // r.expected_man_hours != null ? Number(r.expected_man_hours) : '',
    r.hours_delivered_to_date != null ? Number(r.hours_delivered_to_date) : '',
    r.elapsed_time_pct != null ? Number(r.elapsed_time_pct) : '',
    // r.consumed_hours_pct != null ? Number(r.consumed_hours_pct) : '',
    RISK_LEVEL_CONFIG[r.risk_level]?.label ?? r.risk_level ?? '',
    // r.projected_exhaustion_date ? formatDate(r.projected_exhaustion_date) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service PO Timeline Risk');
  XLSX.writeFile(wb, `Service_PO_Timeline_Risk.xlsx`);
};

const columns = [
  columnHelper.accessor('service_po_code', {
    header: 'PO Code',
    size: 160,
    meta: { sticky: true, left: 0 },
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  columnHelper.accessor('service_po_name', {
    header: 'PO Name',
    size: 240,
    meta: { sticky: true, left: 160 },
    cell: (info) => <div className="truncate font-medium max-w-[220px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('client_name', {
    header: 'Client',
    size: 200,
    cell: (info) => <div className="truncate max-w-[180px]" title={info.getValue()}>{info.getValue() || '—'}</div>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 150,
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('start_date', {
    header: 'Start Date',
    size: 120,
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor('end_date', {
    header: 'End Date',
    size: 120,
    cell: (info) => formatDate(info.getValue()),
  }),
  // Hidden — see the HIDDEN COLUMNS note above.
  // columnHelper.accessor('po_value', {
  //   header: 'PO Value',
  //   size: 150,
  //   cell: (info) => <span className="tabular-nums">{formatCurrency(info.getValue())}</span>,
  // }),
  // columnHelper.accessor('expected_man_hours', {
  //   header: 'Expected Man Hours',
  //   size: 170,
  //   cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  // }),
  columnHelper.accessor('hours_delivered_to_date', {
    header: 'Hours Delivered To Date',
    size: 190,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('elapsed_time_pct', {
    header: 'Elapsed Time %',
    size: 140,
    cell: (info) => <span className="tabular-nums">{formatPercentage(info.getValue())}</span>,
  }),
  // Hidden — see the HIDDEN COLUMNS note above.
  // columnHelper.accessor('consumed_hours_pct', {
  //   header: 'Consumed Hours %',
  //   size: 150,
  //   cell: (info) => <span className="tabular-nums">{formatPercentage(info.getValue())}</span>,
  // }),
  columnHelper.accessor('risk_level', {
    header: 'Risk Level',
    size: 130,
    cell: (info) => <RiskLevelBadge value={info.getValue()} />,
  }),
  // Hidden — see the HIDDEN COLUMNS note above.
  // columnHelper.accessor('projected_exhaustion_date', {
  //   header: 'Projected Exhaustion Date',
  //   size: 190,
  //   cell: (info) => {
  //     const value = info.getValue();
  //     return value ? formatDate(value) : <span className="text-muted-foreground">—</span>;
  //   },
  // }),
];

const SummaryItem = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

const ServicePOTimelineRisk = () => {
  const [asOfDate, setAsOfDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buId, setBuId] = useState(ALL_BUS);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const params = {
    ...(asOfDate && { asOfDate }),
    page: 1,
    limit: MAX_RECORDS_FETCH,
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useServicePOTimelineRisk(params);

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

  const activeFilterCount = (asOfDate ? 1 : 0) + (buId !== ALL_BUS ? 1 : 0) + (entityId !== ALL_ENTITIES ? 1 : 0);

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setAsOfDate('');
    setPage(1);
  };

  // Already have the full matching set in memory — no need for a second network round-trip.
  const handleExport = () => exportToExcel(filteredRecords);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Service PO Timeline Risk"
        description="Burn-rate risk per Service PO based on elapsed time vs hours consumed."
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
              activeCount={activeFilterCount}
              className="h-9"
            />
            {filteredRecords.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      >
        {data?.as_of_date && (
          <p className="mt-1 text-xs text-muted-foreground">As of {formatDate(data.as_of_date)}</p>
        )}
      </PageHeader>

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[340px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">As Of Date</Label>
          <DatePicker
            value={asOfDate}
            onChange={(d) => { setAsOfDate(d); setPage(1); }}
            className="w-full text-sm"
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

      {data?.data && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Pages</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {/*
              Counted from the full matching set (all pages), not just what's currently displayed
              — the same risk_level the table column already renders — rather than trusted from
              the backend's own _on_page aggregates, which came back 0 regardless of how many rows
              actually had each risk_level.
            */}
            <SummaryItem label="Overdue" value={filteredRecords.filter((r) => r.risk_level === 'overdue').length} />
            <SummaryItem label="Critical" value={filteredRecords.filter((r) => r.risk_level === 'critical').length} />
            <SummaryItem label="At Risk" value={filteredRecords.filter((r) => r.risk_level === 'at_risk').length} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePOTimelineRisk;
