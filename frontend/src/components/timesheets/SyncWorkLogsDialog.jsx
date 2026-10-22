import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2, CheckCircle2, AlertCircle, AlertTriangle,
  ChevronDown, ChevronUp, Calendar, RefreshCw,
} from 'lucide-react';
import { useSyncEmployeeWorkLogs, useConfirmImport } from '@/hooks/useTimesheets';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatDate, formatMonthYear, getInitials } from '@/utils/formatters';
import { QUERY_KEYS } from '@/constants/queryKeys';
import ImportPreviewPanel from './ImportPreviewPanel';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { BusinessUnitCascadeSelect, SubBusinessUnitSelect, useBuHierarchy } from '@/components/common/BusinessUnitCascadeSelect';
import { cn } from '@/utils/cn';

const now = new Date();
const currentMonthYear = { month: now.getMonth() + 1, year: now.getFullYear() };

const DIALOG_DESCRIPTION =
  'Syncs each mapped employee\'s full month (all Service POs). Employees already synced from another BU are skipped.';

// SYNC = blue, RESYNC = amber
const ModeBadge = ({ mode }) => {
  if (!mode) return null;
  const isResync = mode === 'RESYNC';
  return (
    <span className={cn(
      'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold',
      isResync
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    )}>
      {mode}
    </span>
  );
};

// Table of failed rows from the confirm response
const ErrorRowsTable = ({ errors }) => {
  if (!errors?.length) return null;
  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
        <tr>
          <th className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Row #</th>
          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Employee</th>
          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Service PO</th>
          <th className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Date</th>
          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Reason</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {errors.map((e, i) => (
          <tr key={i} className="hover:bg-muted/30">
            <td className="px-3 py-2 tabular-nums font-mono">{e.rowNumber ?? i + 1}</td>
            <td className="px-3 py-2 max-w-[120px] truncate" title={e.row?.resourceName}>{e.row?.resourceName ?? '—'}</td>
            <td className="px-3 py-2 max-w-[140px] truncate" title={e.row?.servicePOName}>{e.row?.servicePOName ?? '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">{e.row?.date ? formatDate(e.row.date) : '—'}</td>
            <td className="px-3 py-2 text-destructive">{e.errors?.join(', ') ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Expandable skipped-employees list used in the "all already synced" state and in the mobile
// empty step.
const SkippedEmployeesMobileList = ({ employees }) => {
  const [open, setOpen] = useState(false);
  if (!employees?.length) return null;
  return (
    <div className="mt-2 text-left">
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:underline"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? 'Hide' : 'Show'} {employees.length} employee{employees.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5 pl-1">
          {employees.map((e) => (
            <li key={e.employeeId ?? e.employeeCode} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{e.employeeName}</span>
              {e.employeeCode ? ` (${e.employeeCode})` : ''}
              {e.syncedBusinessUnitName ? (
                <span> — synced from <span className="font-medium">{e.syncedBusinessUnitName}</span></span>
              ) : null}
              {e.message && !e.syncedBusinessUnitName ? (
                <span> — {e.message}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Expandable skipped-employees list for the desktop "all already synced" state.
const SkippedEmployeesDesktopList = ({ employees }) => {
  const [open, setOpen] = useState(true);
  if (!employees?.length) return null;
  return (
    <div className="rounded-xl border overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        {employees.length} employee{employees.length !== 1 ? 's' : ''} already synced
      </button>
      {open && (
        <div className="border-t divide-y">
          {employees.map((e) => (
            <div key={e.employeeId ?? e.employeeCode} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(e.employeeName)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {e.employeeName}
                  {e.employeeCode ? <span className="font-normal text-muted-foreground"> ({e.employeeCode})</span> : ''}
                </p>
                {(e.syncedBusinessUnitName || e.message) && (
                  <p className="text-xs text-muted-foreground">
                    {e.syncedBusinessUnitName ? `Synced from ${e.syncedBusinessUnitName}` : e.message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Desktop result view shown after confirm when there are errors or skipped employees.
const ConfirmResultView = ({ result, onClose }) => {
  const { insertedRows = 0, errorRows = 0, errors = [], skippedEmployees = [], syncContext } = result;
  const hasErrors = errorRows > 0;
  const mode = syncContext?.mode;
  const buLabel = syncContext?.businessUnitName;
  const replacedRows = syncContext?.replacedRows ?? 0;

  return (
    <div className="space-y-4 pt-2 pb-1">
      {/* Status banner */}
      <div className={cn(
        'flex items-center gap-4 rounded-xl border px-5 py-4',
        hasErrors
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
      )}>
        <div className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-white dark:bg-transparent',
          hasErrors
            ? 'border-amber-400 dark:bg-amber-900/50'
            : 'border-emerald-400 dark:bg-emerald-900/50',
        )}>
          {hasErrors
            ? <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            : <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn('font-semibold', hasErrors ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-800 dark:text-emerald-200')}>
              {hasErrors ? 'Sync partially completed' : 'Sync completed'}
            </p>
            {mode && <ModeBadge mode={mode} />}
          </div>
          <p className={cn('mt-0.5 text-sm', hasErrors ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
            {insertedRows} synced{errorRows > 0 ? `, ${errorRows} failed` : ''}{buLabel ? ` • ${buLabel}` : ''}
          </p>
          {mode === 'RESYNC' && replacedRows > 0 && (
            <p className={cn('text-xs mt-0.5', hasErrors ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500')}>
              Replaced {replacedRows} existing row{replacedRows !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Failed rows table */}
      {errors.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Failed Rows</p>
          <div className="max-h-[260px] overflow-y-auto rounded-lg border">
            <ErrorRowsTable errors={errors} />
          </div>
        </div>
      )}

      {/* Skipped employees */}
      {skippedEmployees.length > 0 && (
        <SkippedEmployeesDesktopList employees={skippedEmployees} />
      )}

      <div className="flex justify-end pt-1">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
};

const SyncWorkLogsDialog = ({ open, onOpenChange, activeBusinessUnits = [] }) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [entityId, setEntityId] = useState('all');
  const [buRootId, setBuRootId] = useState('');
  const [buSubId, setBuSubId] = useState('');
  const [monthYear, setMonthYear] = useState(currentMonthYear);
  const [preview, setPreview] = useState(null);
  // Unified result state for both mobile and desktop after confirm — replaces old `mobileSuccess`.
  // null = no result yet; set = show result view (success or partial).
  const [confirmResult, setConfirmResult] = useState(null);

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

  const currentBuScope = buOptionsForEntity(entityId);
  const cascadeUnits = useMemo(() => {
    const idsInScope = new Set(currentBuScope.map((bu) => String(bu.id)));
    return currentBuScope.map((bu) => {
      const parentId = bu.parent_business_unit_id ?? bu.parentId ?? null;
      return {
        id: bu.id,
        name: bu.name,
        parentId: parentId != null && idsInScope.has(String(parentId)) ? parentId : null,
      };
    });
  }, [currentBuScope]);
  const { childrenOf } = useBuHierarchy(cascadeUnits);
  const subBuOptions = useMemo(
    () => childrenOf(buRootId).map((u) => ({ value: String(u.id), label: u.name })),
    [childrenOf, buRootId]
  );
  const needsSubBuChoice = subBuOptions.length > 0;

  useEffect(() => {
    if (!open) return;
    setEntityId('all');
    setBuRootId(activeBusinessUnits.length === 1 ? String(activeBusinessUnits[0].id) : '');
    setBuSubId('');
    setMonthYear(currentMonthYear);
    setPreview(null);
    setConfirmResult(null);
    syncMutation.reset();
    confirmMutation.reset();
  }, [open, activeBusinessUnits]);

  const buId = needsSubBuChoice ? buSubId : buRootId;
  const buName = activeBusinessUnits.find((bu) => String(bu.id) === buId)?.name ?? null;
  const needsBuChoice = activeBusinessUnits.length > 1;
  const canSync = (!needsBuChoice || (!!buRootId && (!needsSubBuChoice || !!buSubId))) && !!monthYear;
  const buIdForRequest = buId ? Number(buId) : null;

  const resetAndClose = (nextOpen) => onOpenChange(nextOpen);

  // Called from result-view Close — invalidates history so the list refreshes.
  const closeAfterResult = () => {
    queryClient.invalidateQueries({ queryKey: ['timesheets', 'import', 'history'] });
    setConfirmResult(null);
    resetAndClose(false);
  };

  const handleSync = () => {
    if (!canSync) return;
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
          skippedCount: result?.skippedCount ?? 0,
          skippedEmployees: result?.skippedEmployees ?? [],
          serverMessage: result?.message ?? null,
          syncContext: result?.syncContext ?? result?.data?.syncContext ?? null,
        });
      },
      onError: (err) => { if (!isMobile) showError(extractApiError(err)); },
    });
  };

  const handleConfirm = () => {
    confirmMutation.mutate({ importId: preview.importId, buId: buIdForRequest }, {
      onSuccess: (res) => {
        const d = res?.data ?? res ?? {};
        const insertedRows = d.insertedRows ?? preview.validCount;
        const errorRows    = d.errorRows ?? 0;
        const errors       = d.errors ?? [];
        const skippedEmployees = d.skippedEmployees ?? [];
        const syncContext  = d.syncContext ?? null;

        const hasPartial = errorRows > 0 || skippedEmployees.length > 0;

        if (isMobile) {
          onOpenChange(false);
          setConfirmResult({ insertedRows, errorRows, errors, skippedEmployees, syncContext });
        } else {
          if (hasPartial) {
            // Stay open and show the result view.
            setConfirmResult({ insertedRows, errorRows, errors, skippedEmployees, syncContext });
          } else {
            const mode = syncContext?.mode;
            const buLabel = syncContext?.businessUnitName ?? buName;
            const label = mode ? `${mode}: ` : '';
            success(`${label}${insertedRows} row${insertedRows !== 1 ? 's' : ''} synced to the Timesheet${buLabel ? ` for ${buLabel}` : ''}.`);
            queryClient.invalidateQueries({ queryKey: ['timesheets', 'import', 'history'] });
            resetAndClose(false);
          }
        }
      },
      onError: (err) => { if (!isMobile) showError(extractApiError(err)); },
    });
  };

  const allAlreadySynced = preview && !preview.canConfirm && (preview.skippedCount ?? 0) > 0 && (preview.errorCount ?? 0) === 0;
  const previewHasErrors = preview && !preview.canConfirm && (preview.errorCount ?? 0) > 0;

  // ── MOBILE BRANCH ────────────────────────────────────────────────────────────
  if (isMobile) {
    const mobileStep = confirmResult
      ? 'result'
      : syncMutation.isError && !preview
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
    const isErrorStep   = mobileStep === 'sync-error' || mobileStep === 'confirm-error';
    const mode = preview?.syncContext?.mode ?? confirmResult?.syncContext?.mode;

    return (
      <>
        <Sheet open={open} onOpenChange={resetAndClose}>
          <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 rounded-t-2xl p-0">
            {!isLoadingStep && !isErrorStep && mobileStep !== 'result' && (
              <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <SheetTitle>Sync Employee Work Logs</SheetTitle>
                  {mode && <ModeBadge mode={mode} />}
                </div>
                <SheetDescription>
                  {buName ? `${buName} — ${DIALOG_DESCRIPTION}` : DIALOG_DESCRIPTION}
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
                          onValueChange={(v) => { setEntityId(v ?? 'all'); setBuRootId(''); setBuSubId(''); }}
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
                        <BusinessUnitCascadeSelect
                          units={cascadeUnits}
                          value={buRootId}
                          onValueChange={(v) => { setBuRootId(v ?? ''); setBuSubId(''); }}
                          placeholder="Select a Business Unit"
                          searchPlaceholder="Search business unit..."
                          className="h-11 w-full bg-white"
                        />
                      </div>
                    )}
                    {needsSubBuChoice && (
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Sub BU</Label>
                        <SubBusinessUnitSelect
                          options={subBuOptions}
                          value={buSubId}
                          onValueChange={(v) => setBuSubId(v ?? '')}
                          placeholder="Select a Sub BU"
                          searchPlaceholder="Search sub BU..."
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
                  <Button variant="outline" className="h-11 flex-1" onClick={() => resetAndClose(false)}>Cancel</Button>
                  <Button className="h-11 flex-1" onClick={handleSync} disabled={!canSync}>Sync</Button>
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
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                {previewHasErrors ? (
                  <>
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">No rows could be synced</p>
                        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Fix the issues below and try again.</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <ErrorRowsTable errors={preview.error_rows} />
                    </div>
                  </>
                ) : allAlreadySynced ? (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 mx-auto">
                      <CheckCircle2 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-sm font-semibold text-center">All employees already synced</p>
                    <p className="text-sm text-muted-foreground text-center">
                      All employees of this BU are already synced for{' '}
                      {formatMonthYear(monthYear.month, monthYear.year)} from another Business Unit.
                    </p>
                    <SkippedEmployeesMobileList employees={preview.skippedEmployees} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center mt-8">
                    No pending employee work log entries found for this month.
                  </p>
                )}
                <div className="mt-auto pt-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setPreview(null)}>
                    <Calendar className="h-4 w-4" /> Try a different month
                  </Button>
                </div>
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
                  <Button variant="outline" className="h-11 flex-1" onClick={() => resetAndClose(false)}>Cancel</Button>
                  <Button className="h-11 flex-1" onClick={() => (mobileStep === 'sync-error' ? syncMutation.reset() : confirmMutation.reset())}>
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
                  {(preview.skippedCount ?? 0) > 0 && (
                    <Alert className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs">
                        {preview.serverMessage ?? `${preview.skippedCount} employee${preview.skippedCount !== 1 ? 's' : ''} already synced — skipped.`}
                        <SkippedEmployeesMobileList employees={preview.skippedEmployees} />
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {preview.syncContext?.mode && <ModeBadge mode={preview.syncContext.mode} />}
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
                      <p className="font-mono text-xs text-muted-foreground">Row {row.rowNumber ?? row.row_number ?? idx + 1}</p>
                      <p className="mt-1 text-sm text-destructive">
                        {row.errors?.length > 0 ? row.errors.join(', ') : row.message ?? row.error_message ?? row.error ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <SheetFooter className="shrink-0 flex-row gap-2 border-t p-3">
                  <Button variant="outline" className="h-11 flex-1" onClick={() => setPreview(null)}>Cancel</Button>
                  <Button
                    className="h-11 flex-1"
                    onClick={handleConfirm}
                    disabled={!preview.canConfirm || preview.validCount === 0 || confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Import'}
                  </Button>
                </SheetFooter>
              </>
            )}

            {/* Result step — shown in-sheet after confirm completes on mobile */}
            {mobileStep === 'result' && confirmResult && (
              <>
                <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <SheetTitle>
                      {confirmResult.errorRows > 0 ? 'Sync partially completed' : 'Work logs synced!'}
                    </SheetTitle>
                    {confirmResult.syncContext?.mode && <ModeBadge mode={confirmResult.syncContext.mode} />}
                  </div>
                </SheetHeader>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {confirmResult.errorRows > 0 ? (
                    <>
                      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                            {confirmResult.insertedRows} synced, {confirmResult.errorRows} failed
                          </p>
                          {confirmResult.syncContext?.businessUnitName && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">{confirmResult.syncContext.businessUnitName}</p>
                          )}
                          {confirmResult.syncContext?.mode === 'RESYNC' && (confirmResult.syncContext?.replacedRows ?? 0) > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                              Replaced {confirmResult.syncContext.replacedRows} existing row{confirmResult.syncContext.replacedRows !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      {confirmResult.errors?.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border">
                          <ErrorRowsTable errors={confirmResult.errors} />
                        </div>
                      )}
                      {confirmResult.skippedEmployees?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-1.5">{confirmResult.skippedEmployees.length} employees skipped</p>
                          <SkippedEmployeesMobileList employees={confirmResult.skippedEmployees} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      </div>
                      <p className="text-center text-base font-semibold">
                        {confirmResult.insertedRows} row{confirmResult.insertedRows === 1 ? '' : 's'} synced successfully!
                      </p>
                      {confirmResult.syncContext?.businessUnitName && (
                        <p className="text-center text-sm text-muted-foreground">{confirmResult.syncContext.businessUnitName}</p>
                      )}
                      {confirmResult.syncContext?.mode === 'RESYNC' && (confirmResult.syncContext?.replacedRows ?? 0) > 0 && (
                        <p className="text-center text-xs text-muted-foreground">
                          Replaced {confirmResult.syncContext.replacedRows} existing row{confirmResult.syncContext.replacedRows !== 1 ? 's' : ''}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <SheetFooter className="shrink-0 flex-row gap-2 border-t p-3">
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={() => {
                      closeAfterResult();
                      setPreview(null);
                      onOpenChange(true);
                    }}
                  >
                    Sync Another Month
                  </Button>
                  <Button className="h-11 flex-1" onClick={closeAfterResult}>
                    Done
                  </Button>
                </SheetFooter>
              </>
            )}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // ── DESKTOP BRANCH ───────────────────────────────────────────────────────────
  const dialogWidth = confirmResult
    ? 'sm:max-w-2xl'
    : !preview
    ? 'sm:max-w-[600px]'
    : preview.canConfirm
    ? 'sm:max-w-3xl'
    : previewHasErrors
    ? 'sm:max-w-2xl'
    : 'sm:max-w-[640px]';

  const mode = preview?.syncContext?.mode;

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className={dialogWidth}>
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg leading-tight">Sync Employee Work Logs</DialogTitle>
                {(mode || confirmResult?.syncContext?.mode) && (
                  <ModeBadge mode={mode ?? confirmResult?.syncContext?.mode} />
                )}
              </div>
              <DialogDescription className="mt-1">
                {buName ? `${buName} • ` : ''}{DIALOG_DESCRIPTION}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step: confirm result view */}
        {confirmResult ? (
          <ConfirmResultView result={confirmResult} onClose={closeAfterResult} />
        ) : !preview ? (
          /* Step: form */
          <>
            <div className="grid gap-4 py-4">
              {needsBuChoice && buEntityOptions.length > 1 && (
                <div className="grid gap-2">
                  <Label>Entity</Label>
                  <SearchableSelect
                    options={[{ label: 'All Entities', value: 'all' }, ...buEntityOptions.map((e) => ({ label: e.name, value: String(e.id) }))]}
                    value={entityId}
                    onValueChange={(v) => { setEntityId(v ?? 'all'); setBuRootId(''); setBuSubId(''); }}
                    placeholder="All Entities"
                    searchPlaceholder="Search entity..."
                    showSearch={buEntityOptions.length > 6}
                  />
                </div>
              )}
              {needsBuChoice && (
                <div className="grid gap-2">
                  <Label>Business Unit</Label>
                  <BusinessUnitCascadeSelect
                    units={cascadeUnits}
                    value={buRootId}
                    onValueChange={(v) => { setBuRootId(v ?? ''); setBuSubId(''); }}
                    placeholder="Select a Business Unit"
                    searchPlaceholder="Search business unit..."
                  />
                </div>
              )}
              {needsSubBuChoice && (
                <div className="grid gap-2">
                  <Label>Sub BU</Label>
                  <SubBusinessUnitSelect
                    options={subBuOptions}
                    value={buSubId}
                    onValueChange={(v) => setBuSubId(v ?? '')}
                    placeholder="Select a Sub BU"
                    searchPlaceholder="Search sub BU..."
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Month &amp; Year</Label>
                <MonthYearPicker value={monthYear} onChange={setMonthYear} clearable={false} className="w-full" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => resetAndClose(false)} disabled={syncMutation.isPending}>Cancel</Button>
              <Button onClick={handleSync} disabled={!canSync || syncMutation.isPending}>
                {syncMutation.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</span>
                ) : 'Sync'}
              </Button>
            </DialogFooter>
          </>
        ) : !preview.canConfirm ? (
          /* Step: preview returned no confirmable rows */
          <div className="space-y-3 pt-2 pb-1">
            {previewHasErrors ? (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-200">No rows could be synced</p>
                    <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">Fix the issues below and try again.</p>
                  </div>
                </div>
                <div className="max-h-[280px] overflow-y-auto rounded-lg border">
                  <ErrorRowsTable errors={preview.error_rows} />
                </div>
              </>
            ) : allAlreadySynced ? (
              <>
                <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-white dark:bg-emerald-900/50">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-800 dark:text-emerald-200">All employees already synced</p>
                    <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-400">
                      All employees of this BU are already synced for{' '}
                      <span className="font-semibold">{formatMonthYear(monthYear.month, monthYear.year)}</span>{' '}
                      from another Business Unit.
                    </p>
                  </div>
                </div>
                {preview.skippedEmployees?.length > 0 && (
                  <SkippedEmployeesDesktopList employees={preview.skippedEmployees} />
                )}
              </>
            ) : (
              <div className="flex items-center gap-4 rounded-xl border bg-muted/30 px-5 py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 bg-background">
                  <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No pending employee work log entries found for this month.
                </p>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setPreview(null)}>
                <Calendar className="h-4 w-4" /> Try a different month
              </Button>
            </div>
          </div>
        ) : (
          /* Step: preview table with valid rows — confirm import */
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
