import { useState } from 'react';
import * as XLSX from 'xlsx';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import { useServiceLineBusinessMix } from '@/hooks/useReports';
import { formatCurrency, formatHours, formatPercentage, formatMonthYear } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import DataTable from '@/components/common/DataTable';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import BusinessUnitFilter, { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import EntityFilter, { ALL_ENTITIES } from '@/components/common/EntityFilter';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const columnHelper = createColumnHelper();

const exportToExcel = (rows) => {
  const header = [
    'Service Category', 'Service Type', 'Hours Delivered', 'Delivery Cost',
    'Invoiced Amount', 'Margin', 'Margin/Hour', 'Revenue Growth %',
  ];
  const dataRows = rows.map((r) => [
    r.service_category_name ?? '',
    r.service_type_name ?? '',
    r.hours_delivered != null ? Number(r.hours_delivered) : '',
    r.delivery_cost != null ? Number(r.delivery_cost) : '',
    r.invoiced_amount != null ? Number(r.invoiced_amount) : '',
    r.margin != null ? Number(r.margin) : '',
    r.margin_per_hour != null ? Number(r.margin_per_hour) : '',
    r.revenue_growth_pct != null ? Number(r.revenue_growth_pct) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service Line Business Mix');
  XLSX.writeFile(wb, `Service_Line_Business_Mix.xlsx`);
};

const now = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const MoneyCell = ({ value }) => (
  <span className={cn('tabular-nums', value < 0 && 'text-destructive')}>
    {formatCurrency(value)}
  </span>
);

const GrowthCell = ({ value }) => {
  if (value == null) return <span className="text-muted-foreground">—</span>;

  const num = Number(value);
  if (num === 0) {
    return <span className="tabular-nums text-muted-foreground">0.0%</span>;
  }

  const isPositive = num > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
      <Icon className="h-3.5 w-3.5" />
      {isPositive ? '+' : '-'}
      {formatPercentage(Math.abs(num))}
    </span>
  );
};

const columns = [
  columnHelper.accessor('service_category_name', {
    header: 'Service Category',
    size: 200,
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('service_type_name', {
    header: 'Service Type',
    size: 200,
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('hours_delivered', {
    header: 'Hours Delivered',
    size: 150,
    cell: (info) => <span className="tabular-nums">{formatHours(info.getValue())}</span>,
  }),
  columnHelper.accessor('delivery_cost', {
    header: 'Delivery Cost',
    size: 160,
    cell: (info) => <MoneyCell value={info.getValue()} />,
  }),
  columnHelper.accessor('invoiced_amount', {
    header: 'Invoiced Amount',
    size: 160,
    cell: (info) => <MoneyCell value={info.getValue()} />,
  }),
  columnHelper.accessor('margin', {
    header: 'Margin',
    size: 150,
    cell: (info) => <MoneyCell value={info.getValue()} />,
  }),
  columnHelper.accessor('margin_per_hour', {
    header: 'Margin/Hour',
    size: 150,
    cell: (info) => <MoneyCell value={info.getValue()} />,
  }),
  columnHelper.accessor('revenue_growth_pct', {
    header: 'Revenue Growth',
    size: 160,
    cell: (info) => <GrowthCell value={info.getValue()} />,
  }),
];

const SummaryItem = ({ label, value, negative = false }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={cn('text-sm font-semibold tabular-nums', negative ? 'text-destructive' : 'text-foreground')}>
      {value}
    </span>
  </div>
);

const ServiceLineBusinessMix = () => {
  const [monthYear, setMonthYear] = useState({
    month: prevMonth.getMonth() + 1,
    year: prevMonth.getFullYear(),
  });
  const [compareMonthYear, setCompareMonthYear] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityId, setEntityId] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);

  const params = {
    ...(monthYear && { month: monthYear.month, year: monthYear.year }),
    ...(compareMonthYear && { compareMonth: compareMonthYear.month, compareYear: compareMonthYear.year }),
    buId,
    ...(entityId !== ALL_ENTITIES && { entityId }),
  };

  const { data, isPending } = useServiceLineBusinessMix(params);

  // Envelope is { success, data: { data: [...rows], summary, comparison_period } }, so the rows
  // live at data.data.data — the sibling of summary/comparison_period, NOT data.data.records
  // (which never existed and silently left the table empty while the Totals card still worked).
  const records = data?.data?.data ?? [];
  const comparisonPeriod = data?.data?.comparison_period ?? null;

  const activeFilterCount = [compareMonthYear !== null, entityId !== ALL_ENTITIES, buId !== ALL_BUS].filter(Boolean).length;

  const clearFilters = () => {
    setEntityId(ALL_ENTITIES);
    setBuId(ALL_BUS);
    setCompareMonthYear(null);
  };

  const handleExport = () => exportToExcel(records);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Service Line Business Mix"
        description="Hours, cost, and margin by Service Category/Type, with optional month-over-month comparison."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((p) => !p)}
              activeCount={activeFilterCount}
              className="h-9"
            />
            {records.length > 0 && (
              <Button variant="outline" size="toolbar" onClick={handleExport}>
                <Download className="h-4 w-4" />Export Excel
              </Button>
            )}
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[300px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <EntityFilter value={entityId} onChange={(v) => { setEntityId(v); setBuId(ALL_BUS); }} />

        <BusinessUnitFilter value={buId} entityId={entityId} onChange={setBuId} />

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Month &amp; Year <span className="text-destructive">*</span></Label>
          <MonthYearPicker
            value={monthYear}
            onChange={setMonthYear}
            placeholder="Select month"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Compare To (optional)</Label>
          <MonthYearPicker
            value={compareMonthYear}
            onChange={setCompareMonthYear}
            placeholder="No comparison"
            clearable
            className="w-full"
          />
        </div>
      </FilterPanel>

      {comparisonPeriod && (
        <p className="mb-2 text-xs text-muted-foreground">
          Compared to {formatMonthYear(comparisonPeriod.month, comparisonPeriod.year)}
        </p>
      )}

      <DataTable
        columns={columns}
        data={records}
        isLoading={isPending}
        mobileCards
        emptyState={
          <EmptyState
            title="No business mix data"
            description="No records found for the selected month. Try a different month or check back once delivery data is available."
          />
        }
      />

      {data?.data?.summary && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totals</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SummaryItem label="Total Hours Delivered" value={formatHours(data.data.summary.total_hours_delivered)} />
            <SummaryItem label="Total Delivery Cost" value={formatCurrency(data.data.summary.total_delivery_cost)} />
            <SummaryItem label="Total Invoiced Amount" value={formatCurrency(data.data.summary.total_invoiced_amount)} />
            <SummaryItem
              label="Total Margin"
              value={formatCurrency(data.data.summary.total_margin)}
              negative={data.data.summary.total_margin < 0}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceLineBusinessMix;
