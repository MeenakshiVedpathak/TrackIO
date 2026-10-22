import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Search, X } from 'lucide-react';
import { useTimesheetImportById } from '@/hooks/useTimesheets';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatDate, formatMonthYear } from '@/utils/formatters';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

// Split an error_message string on ' | ' and normalise each piece so rows that differ only
// by employee/PO name map to the same reason bucket.
const splitReasons = (msg) =>
  (msg ?? '').split(' | ').map((r) => r.trim()).filter(Boolean);

const normaliseReason = (msg) => msg.replace(/"[^"]*"/g, '"X"');

const applySearch = (errors, q) => {
  if (!q.trim()) return errors;
  const lower = q.toLowerCase();
  return errors.filter(
    (e) =>
      (e.row_data?.resourceName ?? '').toLowerCase().includes(lower) ||
      (e.row_data?.servicePOName ?? '').toLowerCase().includes(lower) ||
      (e.error_message ?? '').toLowerCase().includes(lower),
  );
};

const downloadCsv = (errors, importId) => {
  const header = ['Row #', 'Employee', 'Service PO', 'Sub-project', 'Date', 'Hours', 'Reason'];
  const rows = errors.map((e) => [
    e.row_number ?? '',
    e.row_data?.resourceName ?? '',
    e.row_data?.servicePOName ?? '',
    e.row_data?.subProject ?? '',
    e.row_data?.date ?? '',
    e.row_data?.hours ?? '',
    e.error_message ?? '',
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import_failures_${importId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ReasonChips = ({ errors }) => {
  const counts = useMemo(() => {
    const map = new Map();
    errors.forEach((e) => {
      splitReasons(e.error_message).forEach((r) => {
        const key = normaliseReason(r);
        map.set(key, (map.get(key) ?? 0) + 1);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [errors]);

  if (!counts.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.map(([reason, count]) => (
        <span
          key={reason}
          className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        >
          <span className="font-bold tabular-nums">{count}×</span>
          <span>{reason}</span>
        </span>
      ))}
    </div>
  );
};

// Desktop table of failed rows
const FailedRowsTable = ({ errors }) => (
  <table className="w-full text-xs">
    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
      <tr>
        {['Row #', 'Employee', 'Service PO', 'Sub-project', 'Date', 'Hours', 'Reason'].map((h) => (
          <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y">
      {errors.map((e, idx) => {
        const reasons = splitReasons(e.error_message);
        return (
          <tr key={e.id ?? idx} className="hover:bg-muted/30 align-top">
            <td className="px-3 py-2 font-mono tabular-nums">{e.row_number ?? idx + 1}</td>
            <td className="px-3 py-2 max-w-[120px] truncate" title={e.row_data?.resourceName}>{e.row_data?.resourceName ?? '—'}</td>
            <td className="px-3 py-2 max-w-[140px] truncate" title={e.row_data?.servicePOName}>{e.row_data?.servicePOName ?? '—'}</td>
            <td className="px-3 py-2 max-w-[100px] truncate" title={e.row_data?.subProject}>{e.row_data?.subProject ?? '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">{e.row_data?.date ? formatDate(e.row_data.date) : '—'}</td>
            <td className="px-3 py-2 tabular-nums text-right">{e.row_data?.hours ?? '—'}</td>
            <td className="px-3 py-2 text-destructive">
              {reasons.length > 1 ? (
                <ul className="list-disc pl-3 space-y-0.5">
                  {reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              ) : (reasons[0] ?? '—')}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// Mobile card for one failed row
const FailedRowCard = ({ entry, idx }) => {
  const reasons = splitReasons(entry.error_message);
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-mono text-[10px] text-muted-foreground">Row {entry.row_number ?? idx + 1}</p>
        <p className="tabular-nums text-xs font-semibold">{entry.row_data?.hours != null ? `${entry.row_data.hours}h` : ''}</p>
      </div>
      <p className="text-sm font-medium">{entry.row_data?.resourceName ?? '—'}</p>
      <p className="text-xs text-muted-foreground truncate">{entry.row_data?.servicePOName ?? '—'}</p>
      {entry.row_data?.date && (
        <p className="text-xs text-muted-foreground">{formatDate(entry.row_data.date)}</p>
      )}
      <div className="mt-1.5 space-y-0.5">
        {reasons.map((r, i) => (
          <p key={i} className="text-xs text-destructive">• {r}</p>
        ))}
      </div>
    </div>
  );
};

const FOOTER_HINT =
  'Fix the issue (for example the employee or the Service PO), then run Sync again for this Business Unit and month. Work logs that failed stay pending for the next sync.';

// ── Main content (shared between Dialog and Sheet) ────────────────────────────

const FailureContent = ({ importId, isMobile }) => {
  const [search, setSearch] = useState('');

  const { data: detail, isLoading, isError } = useTimesheetImportById(importId, {
    staleTime: 1000 * 60 * 5,
  });

  const errors = detail?.errors ?? [];
  const filteredErrors = useMemo(() => applySearch(errors, search), [errors, search]);

  const status = detail?.status;
  const isFailed = status === 'failed';
  const buName =
    detail?.company?.company_name ??
    detail?.business_unit?.name ??
    detail?.business_unit_name ??
    null;
  const monthLabel = detail?.import_month && detail?.import_year
    ? formatMonthYear(detail.import_month, detail.import_year)
    : null;

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">Unable to load import details. Please try again.</p>
      </div>
    );
  }

  const noDetails = errors.length === 0 && (status === 'partial' || status === 'failed');

  return (
    <div className={cn('flex flex-col gap-4', isMobile ? 'px-4 pb-4' : '')}>
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {buName && <span className="font-medium text-foreground">{buName}</span>}
        {buName && monthLabel && <span>·</span>}
        {monthLabel && <span>{monthLabel}</span>}
        {detail && (
          <>
            <span className="hidden sm:inline">·</span>
            <span className="w-full sm:w-auto">
              <span className="font-semibold text-foreground">{detail.valid_rows ?? 0}</span> synced,{' '}
              <span className="font-semibold text-destructive">{detail.error_rows ?? 0}</span> failed of{' '}
              <span className="font-semibold text-foreground">{detail.total_rows ?? 0}</span>
            </span>
          </>
        )}
      </div>

      {noDetails ? (
        <p className="text-sm text-muted-foreground">Error details are not available for this import.</p>
      ) : (
        <>
          {/* Reason chips */}
          {errors.length > 0 && <ReasonChips errors={errors} />}

          {/* Search + download toolbar */}
          {errors.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employee, PO, reason…"
                  className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
                {search && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearch('')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                onClick={() => downloadCsv(filteredErrors, importId)}
                disabled={filteredErrors.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download CSV</span>
              </Button>
            </div>
          )}

          {/* Content area */}
          {isMobile ? (
            <div className="space-y-2">
              {filteredErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No results match your search.</p>
              ) : (
                filteredErrors.map((e, i) => <FailedRowCard key={e.id ?? i} entry={e} idx={i} />)
              )}
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto rounded-lg border">
              {filteredErrors.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No results match your search.</p>
              ) : (
                <FailedRowsTable errors={filteredErrors} />
              )}
            </div>
          )}
        </>
      )}

      {/* Footer hint */}
      {!isFailed && (
        <p className="text-xs text-muted-foreground border-t pt-3 leading-relaxed">{FOOTER_HINT}</p>
      )}
    </div>
  );
};

// ── Exported component ────────────────────────────────────────────────────────

const ImportFailureDialog = ({ open, onOpenChange, importId, status }) => {
  const isMobile = useIsMobile();
  const isFailed = status === 'failed';
  const title = isFailed ? 'Sync Failed' : 'Partial Import — Failed Rows';

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 rounded-t-2xl p-0">
          <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>Review why rows failed to sync.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pt-4">
            {open && importId && <FailureContent importId={importId} isMobile />}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={cn('h-5 w-5', isFailed ? 'text-destructive' : 'text-amber-500')} />
            {title}
          </DialogTitle>
          <DialogDescription>Review why rows failed to sync and what to fix before running again.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {open && importId && <FailureContent importId={importId} isMobile={false} />}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportFailureDialog;
