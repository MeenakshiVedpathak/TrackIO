import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ChevronRight, Clock, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import EmptyState from '@/components/common/EmptyState';
import { useServicePoMonthlyBudgetServicePOs } from '@/hooks/useServicePoMonthlyBudget';
import { useNotification } from '@/hooks/useNotification';
import { formatCurrency, formatDate, formatMonthYear, getStatusColor } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const COUNTDOWN_STYLES = {
  critical: 'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  normal: 'text-muted-foreground',
  locked: 'text-muted-foreground',
};

const ServicePoMonthlyBudgetList = forwardRef(({
  month, year, records, isLoading, search = '', clientFilter = 'all', poFilterIds = null,
  buId, onEdit, onExportStateChange, countdown,
}, ref) => {
  const { success, error: showError } = useNotification();
  // Same BU scope the page applied to `records` — the two lists are merged below into one card
  // per PO, so they must be scoped to the same set or the grid shows POs the records can't fill.
  const { data: servicePos = [], isPending: isServicePosLoading } = useServicePoMonthlyBudgetServicePOs(buId);

  // Every PO the caller can see gets a card, filled or not — `getMonthList` only returns rows
  // that were actually saved, so a PO with nothing entered yet would otherwise never appear.
  const allRecords = useMemo(() => {
    const savedByPoId = new Map(records.map((r) => [String(r.service_po_id), r]));
    return servicePos.map((po) => {
      const saved = savedByPoId.get(String(po.service_po_id));
      return saved
        ? { ...saved, filled: true, is_billable: po.is_billable, status: po.status }
        : {
            service_po_id: po.service_po_id,
            service_po_name: po.service_po_name,
            service_po_code: po.service_po_code,
            client: po.client,
            is_billable: po.is_billable,
            status: po.status,
            invoice_amount: null,
            billed_amount: null,
            updated_at: null,
            filled: false,
          };
    });
  }, [servicePos, records]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRecords.filter((r) => {
      if (clientFilter !== 'all' && String(r.client?.id) !== clientFilter) return false;
      if (poFilterIds && !poFilterIds.has(r.service_po_id)) return false;
      if (!term) return true;
      return [r.service_po_name, r.service_po_code, r.client?.client_name]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term));
    });
  }, [allRecords, search, clientFilter, poFilterIds]);

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      showError('No data to export.');
      return;
    }
    const exportData = filteredRecords.map((r) => ({
      'Service PO': r.service_po_name || '',
      'PO Code': r.service_po_code || '',
      'Client': r.client?.client_name || '',
      'Invoice Amount': Number(r.invoice_amount ?? 0),
      'Invoice Description': r.invoice_description || '',
      'Billable Amount': Number(r.billed_amount ?? 0),
      'Billable Remark': r.billed_remark || '',
      'Updated': formatDate(r.updated_at),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Budgets');
    XLSX.writeFile(wb, `Monthly_PO_Reporting_${formatMonthYear(month, year).replace(/\s+/g, '_')}.xlsx`);
    success('Exported to Excel successfully.');
  };

  const loading = isLoading || isServicePosLoading;
  const canExport = !loading && filteredRecords.length > 0;

  useEffect(() => {
    onExportStateChange?.(canExport);
    return () => onExportStateChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canExport]);

  useImperativeHandle(ref, () => ({ exportExcel: handleExportExcel }));

  if (allRecords.length === 0 && !loading) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={ClipboardList}
          title="No Service POs available"
          description="No Service POs are assigned to you yet."
        />
      </div>
    );
  }

  if (!loading && filteredRecords.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState title="No records found" description="Try adjusting your search or filters." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[170px] animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredRecords.map((r) => {
          const statusLabel = r.is_billable ? 'Billable' : r.status || '—';
          const statusVariant = r.is_billable ? 'success' : getStatusColor(r.status);
          // A filled PO stays clickable (view/edit) even after its window locks — but an unfilled
          // one that's locked has nothing to view and can no longer be added, so the card is inert.
          const isClickable = r.filled || countdown?.writable;

          return (
            <button
              key={r.service_po_id}
              type="button"
              onClick={isClickable ? () => onEdit(r.service_po_id) : undefined}
              disabled={!isClickable}
              className={cn(
                'group flex flex-col rounded-xl border bg-card p-3 text-left text-sm shadow-card transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                !r.filled && 'border-dashed',
                isClickable
                  ? 'hover:border-primary hover:shadow-md'
                  : 'cursor-not-allowed opacity-70'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ClipboardList className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={r.service_po_name}>
                      {r.service_po_name || '—'}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground" title={r.service_po_code}>
                      {r.service_po_code ? `(${r.service_po_code})` : ''}
                    </p>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>

              <Separator className="my-2.5" />

              {r.filled ? (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Invoice Amount</p>
                    <p className="text-xs font-semibold tabular-nums">{formatCurrency(r.invoice_amount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Billable Amount</p>
                    <p className="text-xs font-semibold tabular-nums">{formatCurrency(r.billed_amount)}</p>
                  </div>
                </div>
              ) : countdown?.writable ? (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-center dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Not filled yet — click to add</p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/40 px-2 py-2 text-center">
                  <p className="text-[11px] font-medium text-muted-foreground">Not filled — period locked</p>
                </div>
              )}

              <div className="mt-2.5 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">Status</p>
                  <Badge variant={statusVariant} className="mt-1 font-normal">{statusLabel}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Client</p>
                  <p className="truncate text-xs font-medium" title={r.client?.client_name}>
                    {r.client?.client_name || '—'}
                  </p>
                </div>
              </div>

              <Separator className="my-2.5" />

              <div className="flex items-center justify-between text-[11px]">
                {r.filled ? (
                  <span className="text-muted-foreground">Updated {formatDate(r.updated_at, 'DD-MMM-YYYY')}</span>
                ) : countdown?.writable ? (
                  <span className={cn('flex items-center gap-1 font-medium', COUNTDOWN_STYLES[countdown.severity])}>
                    <Clock className="h-3 w-3" /> {countdown.label} to fill
                  </span>
                ) : (
                  <span className="text-muted-foreground">Locked</span>
                )}
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Showing 1 to {filteredRecords.length} of {filteredRecords.length} entries
      </p>
    </div>
  );
});

ServicePoMonthlyBudgetList.displayName = 'ServicePoMonthlyBudgetList';

export default ServicePoMonthlyBudgetList;
