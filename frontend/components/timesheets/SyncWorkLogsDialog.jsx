import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSyncEmployeeWorkLogs, useConfirmImport } from '@/hooks/useTimesheets';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatDate, formatMonthYear } from '@/utils/formatters';
import ImportPreviewPanel from './ImportPreviewPanel';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';

const now = new Date();
const currentMonthYear = { month: now.getMonth() + 1, year: now.getFullYear() };

// One dialog, one step of choices (Entity -> Business Unit -> Month/Year), then Sync -> Preview ->
// Confirm — previously Entity/BU lived in a separate dialog TimesheetList opened first, which read
// as two popups for one action. `activeBusinessUnits` is the login's own active BU mappings (each
// possibly carrying entity_id/entity_name); Entity only renders when they actually span more than
// one, same "nothing to narrow" rule as every other Entity/BU filter pair in the app.
const SyncWorkLogsDialog = ({ open, onOpenChange, activeBusinessUnits = [] }) => {
  const isMobile = useIsMobile();
  const [entityId, setEntityId] = useState('all');
  const [buId, setBuId] = useState('');
  const [monthYear, setMonthYear] = useState(currentMonthYear);
  const [preview, setPreview] = useState(null);
  // Mobile-only: drives the standalone "Work logs synced successfully!" screen (mockup's Success
  // State) shown after the sheet itself closes on confirm — mirrors ResourceBudgetPage's mobile
  // success Dialog pattern. Desktop keeps its existing toast-and-close behavior untouched.
  const [mobileSuccess, setMobileSuccess] = useState(null);

  const { success, error: showError } = useNotification();
  const syncMutation = useSyncEmployeeWorkLogs();
  const confirmMutation = useConfirmImport();

  const buEntityOptions = useMemo(() => {
    const byId = new Map();
    activeBusinessUnits.forEach((bu) => {
      const id = bu.entity_id ?? bu.entityId;
      const name = bu.entity_name ?? bu.entityName;
      if (id != null && name && !byId.has(id)) byId.set(id, { id, name });
    });
    return Array.from(byId.values());
  }, [activeBusinessUnits]);

  const buOptionsForEntity = (id) =>
    id && id !== 'all'
      ? activeBusinessUnits.filter((bu) => String(bu.entity_id ?? bu.entityId) === String(id))
      : activeBusinessUnits;

  // Re-seed on every open (not just mount) — a single-BU login gets it pre-selected, a multi-BU
  // one starts blank so they must choose, and a stale choice from the last time this dialog was
  // open never survives into a new one.
  useEffect(() => {
    if (!open) return;
    setEntityId('all');
    setBuId(activeBusinessUnits.length === 1 ? String(activeBusinessUnits[0].id) : '');
    setMonthYear(currentMonthYear);
    setPreview(null);
    syncMutation.reset();
    confirmMutation.reset();
  }, [open, activeBusinessUnits]);

  const buName = activeBusinessUnits.find((bu) => String(bu.id) === buId)?.name ?? null;
  const needsBuChoice = activeBusinessUnits.length > 1;
  // A BU pick is only required when there's actually more than one to choose from — same rule
  // as the Upload dialog's Continue button just below in TimesheetList.jsx. A login with zero
  // mapped BUs (a cross-BU role like Admin/Entity Admin/Platform Admin with no explicit BU
  // mapping — confirmed live: rut_business_units comes back `[]` for one) never gets `buId` set
  // at all, since the effect above only auto-fills it for the exactly-one case; requiring it
  // unconditionally here left Sync permanently disabled with no dropdown ever rendering to fix
  // it from (needsBuChoice is also false for 0, same as for 1).
  const canSync = (!needsBuChoice || !!buId) && !!monthYear;
  // '' (no BU to send) must become null, not Number('') === 0 — sendEmployeeWorkLogs/confirm
  // already treat a null buId as "let the backend infer scope from role reach", the same
  // contract explicitBuScope relies on elsewhere.
  const buIdForRequest = buId ? Number(buId) : null;

  const resetAndClose = (nextOpen) => onOpenChange(nextOpen);

  const handleSync = () => {
    syncMutation.mutate({ month: monthYear.month, year: monthYear.year, buId: buIdForRequest }, {
      onSuccess: (result) => {
        setPreview({
          importId: result?.importId,
          totalRows: result?.totalRows ?? 0,
          validCount: result?.validRows ?? 0,
          errorCount: result?.errorRows ?? 0,
          valid_rows: result?.preview ?? [],
          error_rows: result?.errors ?? [],
          canConfirm: result?.canConfirm ?? false,
        });
      },
      // Mobile shows a dedicated full-screen error state (driven by syncMutation.isError) instead
      // of a toast — see the mobile branch below.
      onError: (err) => { if (!isMobile) showError(extractApiError(err)); },
    });
  };

  const handleConfirm = () => {
    confirmMutation.mutate({ importId: preview.importId, buId: buIdForRequest }, {
      onSuccess: (res) => {
        const inserted = res?.data?.insertedRows ?? res?.insertedRows ?? preview.validCount;
        if (isMobile) {
          // Sheet closes; the standalone success screen (mobileSuccess) takes over next render.
          onOpenChange(false);
          setMobileSuccess({ inserted });
        } else {
          success(`${inserted} row(s) synced to the Timesheet.`);
          resetAndClose(false);
        }
      },
      onError: (err) => { if (!isMobile) showError(extractApiError(err)); },
    });
  };

  // Mobile: the same state/handlers above drive a bottom-sheet flow (select → syncing → preview →
  // confirming) plus two standalone full-bleed screens for success/error, matching the app's
  // established mobile pattern (FilterPanel's bottom sheet, ResourceBudgetPage's success Dialog).
  // Desktop's Dialog below is completely untouched and only reached when this returns early.
  if (isMobile) {
    const mobileStep = syncMutation.isError && !preview
      ? 'sync-error'
      : syncMutation.isPending
      ? 'syncing'
      : !preview
      ? 'select'
      : !preview.canConfirm
      ? 'empty'
      : confirmMutation.isError
      ? 'confirm-error'
      : confirmMutation.isPending
      ? 'confirming'
      : 'preview';

    const isLoadingStep = mobileStep === 'syncing' || mobileStep === 'confirming';
    const isErrorStep = mobileStep === 'sync-error' || mobileStep === 'confirm-error';

    return (
      <>
        <Sheet open={open} onOpenChange={resetAndClose}>
          <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 rounded-t-2xl p-0">
            {!isLoadingStep && !isErrorStep && (
              <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
                <SheetTitle>Sync Employee Work Logs</SheetTitle>
                <SheetDescription>
                  {buName
                    ? `Pull pending ${buName} work logs into the official Timesheet for a given month.`
                    : 'Pull pending employee-entered work logs into the official Timesheet for a given month.'}
                </SheetDescription>
              </SheetHeader>
            )}

            {mobileStep === 'select' && (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-1 gap-4">
                    {needsBuChoice && buEntityOptions.length > 1 && (
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Entity</Label>
                        <SearchableSelect
                          options={[{ label: 'All Entities', value: 'all' }, ...buEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))]}
                          value={entityId}
                          onValueChange={(v) => { setEntityId(v ?? 'all'); setBuId(''); }}
                          placeholder="All Entities"
                          searchPlaceholder="Search entity..."
                          showSearch={buEntityOptions.length > 6}
                          className="h-11 w-full bg-white"
                        />
                      </div>
                    )}
                    {needsBuChoice && (
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Business Unit</Label>
                        <SearchableSelect
                          options={buOptionsForEntity(entityId).map((bu) => ({ label: bu.name, value: String(bu.id) }))}
                          value={buId}
                          onValueChange={setBuId}
                          placeholder="Select a Business Unit"
                          searchPlaceholder="Search business unit..."
                          showSearch={activeBusinessUnits.length > 6}
                          className="h-11 w-full bg-white"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Month &amp; Year</Label>
                      <MonthYearPicker value={monthYear} onChange={setMonthYear} clearable={false} className="h-11 w-full bg-white" />
                    </div>
                  </div>
                </div>
                <SheetFooter className="shrink-0 flex-row gap-2 border-t p-3">
                  <Button variant="outline" className="h-11 flex-1" onClick={() => resetAndClose(false)}>
                    Cancel
                  </Button>
                  <Button className="h-11 flex-1" onClick={handleSync} disabled={!canSync}>
                    Sync
                  </Button>
                </SheetFooter>
              </>
            )}

            {isLoadingStep && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
                <p className="text-base font-semibold">
                  {mobileStep === 'syncing' ? 'Syncing employee work logs…' : 'Importing rows…'}
                </p>
                <p className="text-sm text-muted-foreground">Please do not close this screen.</p>
              </div>
            )}

            {mobileStep === 'empty' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No pending employee work log entries found for this month.
                </p>
                <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
                  Try a different month
                </Button>
              </div>
            )}

            {isErrorStep && (
              <>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                    <AlertCircle className="h-7 w-7 text-red-600" />
                  </div>
                  <p className="text-base font-semibold">Sync failed</p>
                  <p className="text-sm text-muted-foreground">
                    {extractApiError(mobileStep === 'sync-error' ? syncMutation.error : confirmMutation.error)}
                  </p>
                </div>
                <SheetFooter className="shrink-0 flex-row gap-2 border-t p-3">
                  <Button variant="outline" className="h-11 flex-1" onClick={() => resetAndClose(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="h-11 flex-1"
                    onClick={() => (mobileStep === 'sync-error' ? syncMutation.reset() : confirmMutation.reset())}
                  >
                    Try Again
                  </Button>
                </SheetFooter>
              </>
            )}

            {mobileStep === 'preview' && (
              <>
                <div className="grid shrink-0 grid-cols-3 gap-2 border-b p-3">
                  <div className="rounded-lg border bg-muted/20 p-2 text-center">
                    <p className="text-[11px] text-muted-foreground">Import ID</p>
                    <p className="truncate text-sm font-semibold">{preview.importId}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2 text-center">
                    <p className="text-[11px] text-muted-foreground">Total rows</p>
                    <p className="text-sm font-semibold">{preview.totalRows}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2 text-center">
                    <p className="text-[11px] text-muted-foreground">Employees</p>
                    <p className="text-sm font-semibold">
                      {new Set(preview.valid_rows.map((r) => r.employeeId ?? r.resourceName).filter(Boolean)).size}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="gap-1.5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {preview.validCount} valid
                    </Badge>
                    {preview.errorCount > 0 && (
                      <Badge variant="destructive" className="gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {preview.errorCount} error{preview.errorCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>

                  {preview.valid_rows.map((row, idx) => (
                    <div key={idx} className="rounded-lg border bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{row.resourceName ?? '—'}</p>
                        <span className="shrink-0 tabular-nums text-sm font-semibold">
                          {row.hours != null ? `${Number(row.hours).toFixed(2)}h` : '—'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{row.servicePOName || (row.poId ? `PO #${row.poId}` : '—')}</span>
                        <span className="shrink-0 tabular-nums">{row.date ? formatDate(row.date) : '—'}</span>
                      </div>
                    </div>
                  ))}

                  {preview.error_rows.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                      <p className="font-mono text-xs text-muted-foreground">
                        Row {row.rowNumber ?? row.row_number ?? idx + 1}
                      </p>
                      <p className="mt-1 text-sm text-destructive">
                        {row.errors?.length > 0
                          ? row.errors.join(', ')
                          : row.message ?? row.error_message ?? row.error ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <SheetFooter className="shrink-0 flex-row gap-2 border-t p-3">
                  <Button variant="outline" className="h-11 flex-1" onClick={() => setPreview(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="h-11 flex-1"
                    onClick={handleConfirm}
                    disabled={!preview.canConfirm || preview.validCount === 0}
                  >
                    Confirm Import
                  </Button>
                </SheetFooter>
              </>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={!!mobileSuccess} onOpenChange={(o) => !o && setMobileSuccess(null)}>
          <DialogContent className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="mt-4 text-base font-semibold">Work logs synced successfully!</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mobileSuccess?.inserted} row{mobileSuccess?.inserted === 1 ? '' : 's'} have been imported into the
              official Timesheet for {formatMonthYear(monthYear.month, monthYear.year)}.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button className="h-11 w-full" onClick={() => setMobileSuccess(null)}>
                View Timesheet Imports
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() => {
                  setMobileSuccess(null);
                  setPreview(null);
                  onOpenChange(true);
                }}
              >
                Sync Another Month
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className={preview ? 'sm:max-w-3xl' : 'sm:max-w-[420px]'}>
        <DialogHeader>
          <DialogTitle>Sync Employee Work Logs</DialogTitle>
          <DialogDescription>
            {buName
              ? `Pull pending ${buName} work logs into the official Timesheet for a given month.`
              : 'Pull pending employee-entered work logs into the official Timesheet for a given month.'}
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <>
            <div className="grid gap-4 py-4">
              {needsBuChoice && buEntityOptions.length > 1 && (
                <div className="grid gap-2">
                  <Label>Entity</Label>
                  <SearchableSelect
                    options={[{ label: 'All Entities', value: 'all' }, ...buEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))]}
                    value={entityId}
                    onValueChange={(v) => { setEntityId(v ?? 'all'); setBuId(''); }}
                    placeholder="All Entities"
                    searchPlaceholder="Search entity..."
                    showSearch={buEntityOptions.length > 6}
                  />
                </div>
              )}
              {needsBuChoice && (
                <div className="grid gap-2">
                  <Label>Business Unit</Label>
                  <SearchableSelect
                    options={buOptionsForEntity(entityId).map((bu) => ({ label: bu.name, value: String(bu.id) }))}
                    value={buId}
                    onValueChange={setBuId}
                    placeholder="Select a Business Unit"
                    searchPlaceholder="Search business unit..."
                    showSearch={activeBusinessUnits.length > 6}
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Month &amp; Year</Label>
                <MonthYearPicker value={monthYear} onChange={setMonthYear} clearable={false} className="w-full" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => resetAndClose(false)} disabled={syncMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleSync} disabled={!canSync || syncMutation.isPending}>
                {syncMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Syncing…
                  </span>
                ) : (
                  'Sync'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : !preview.canConfirm ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No pending employee work log entries found for this month.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setPreview(null)}>
              Try a different month
            </Button>
          </div>
        ) : (
          <ImportPreviewPanel
            preview={preview}
            onConfirm={handleConfirm}
            onCancel={() => setPreview(null)}
            isConfirming={confirmMutation.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SyncWorkLogsDialog;
