import { useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Undo2, Trash2, AlertTriangle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { useRevertApprovedByDate, useDeleteApprovedByDate } from '@/hooks/useMyTeam';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { isApprovedUnsynced } from '@/components/employee/ApprovedEntryActions';

const REASON_MAX_LENGTH = 1000;
const MAX_DATES_PER_EMPLOYEE = 62;
const MAX_EMPLOYEES = 100;

const fmtDate = (d) => dayjs(d).format('DD-MM-YY');

// A bucket row (one employee on one date) has something to revert/delete when at least one of its
// own entries is approved and not yet synced. Pending/rejected/synced-only dates are not eligible.
export const bucketHasApprovedLogs = (row) => (row?.entries ?? []).some(isApprovedUnsynced);

// items: [{ employeeId, employeeName, date }] -> request `selections` (grouped per employee, dates
// unique + sorted) plus the display groups used by the modal summary.
const groupItems = (items) => {
  const byEmployee = new Map();
  items.forEach(({ employeeId, employeeName, date }) => {
    if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, { employeeId, employeeName, dates: new Set() });
    byEmployee.get(employeeId).dates.add(date);
  });
  return [...byEmployee.values()].map((g) => ({ ...g, dates: [...g.dates].sort() }));
};

const MODES = {
  revert: {
    title: 'Revert approved logs to Pending',
    description: 'These logs will go back to Pending. Each employee will be notified by email.',
    confirm: 'Revert to Pending',
    confirming: 'Reverting…',
    doneVerb: 'reverted to Pending',
  },
  delete: {
    title: 'Delete approved logs',
    description: '',
    confirm: 'Delete permanently',
    confirming: 'Deleting…',
    doneVerb: 'deleted',
  },
};

const ResultDialog = ({ result, onClose }) => {
  if (!result) return null;
  const { data, mode, nameById } = result;
  const nameOf = (id) => nameById.get(String(id)) ?? `Employee #${id}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'delete' ? 'Delete result' : 'Revert result'}</DialogTitle>
          <DialogDescription>
            {data.total_logs_affected} log{data.total_logs_affected === 1 ? '' : 's'} {MODES[mode].doneVerb} for{' '}
            {data.employees_processed} employee{data.employees_processed === 1 ? '' : 's'}
            {data.employees_failed > 0 ? `; ${data.employees_failed} failed` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {(data.results ?? []).map((r) => {
            const failed = r.status === 'failed';
            const nothing = r.status === 'nothing_to_do';
            const emailIssue = r.email_status === 'failed' || r.email_status === 'no_email';
            return (
              <div
                key={r.employee_id}
                className={`rounded-lg border p-3 text-sm ${failed ? 'border-destructive/30 bg-destructive/5' : ''}`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {failed ? <XCircle className="h-4 w-4 text-destructive" />
                    : nothing ? <MinusCircle className="h-4 w-4 text-muted-foreground" />
                      : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  <span className="min-w-0 flex-1 truncate">{nameOf(r.employee_id)}</span>
                  {!failed && !nothing && (
                    <span className="text-xs font-normal text-muted-foreground">{r.logs_affected} log{r.logs_affected === 1 ? '' : 's'}</span>
                  )}
                </div>
                {failed && <p className="mt-1 text-xs text-destructive">{r.error || 'This employee could not be processed.'}</p>}
                {nothing && <p className="mt-1 text-xs text-muted-foreground">No approved, unsynced logs on the selected dates.</p>}
                {(r.affected_dates ?? []).length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Changed: {r.affected_dates.map(fmtDate).join(', ')}</p>
                )}
                {(r.skipped_dates ?? []).length > 0 && !nothing && (
                  <p className="mt-1 text-xs text-amber-700">No approved logs on: {r.skipped_dates.map(fmtDate).join(', ')}</p>
                )}
                {emailIssue && !failed && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    Done, but {nameOf(r.employee_id)} could not be notified by email.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// The shared modal flow (reason + optional delete confirmation + result summary) used by both the
// toolbar buttons and the per-row Delete icon. `items` = [{ employeeId, employeeName, date }].
const ApprovedBulkDialogs = ({ mode, items, onClose, onDone }) => {
  const { success, error: showError, info, warning } = useNotification();
  const revertMutation = useRevertApprovedByDate();
  const deleteMutation = useDeleteApprovedByDate();
  const [reason, setReason] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const inFlightRef = useRef(false);

  const groups = useMemo(() => groupItems(items), [items]);
  const nameById = useMemo(() => new Map(groups.map((g) => [String(g.employeeId), g.employeeName])), [groups]);
  const dateCount = groups.reduce((n, g) => n + g.dates.length, 0);
  const cfg = mode ? MODES[mode] : null;
  const trimmed = reason.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= REASON_MAX_LENGTH;
  const tooMany = groups.length > MAX_EMPLOYEES || groups.some((g) => g.dates.length > MAX_DATES_PER_EMPLOYEE);
  const canSubmit = isValid && !isSubmitting && !tooMany && (mode !== 'delete' || understood);

  const reset = () => { setReason(''); setUnderstood(false); };
  const close = () => {
    if (inFlightRef.current) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    const selections = groups.map((g) => ({ employee_id: Number(g.employeeId), dates: g.dates }));
    try {
      const res = mode === 'revert'
        ? await revertMutation.mutateAsync({ selections, reason: trimmed })
        : await deleteMutation.mutateAsync({ selections, reason: trimmed, confirm: understood });
      const data = res?.data ?? {};
      reset();
      onClose();
      onDone?.();

      // HTTP 200 doesn't always mean something happened — read the payload.
      if (!data.total_logs_affected) {
        info('No approved, unsynced logs were found for the selected dates.');
        return;
      }
      const results = data.results ?? [];
      const hasSkipped = results.some((r) => r.status !== 'nothing_to_do' && (r.skipped_dates ?? []).length > 0);
      const hasEmailIssue = results.some((r) => r.status === 'done' && (r.email_status === 'failed' || r.email_status === 'no_email'));
      const hasProblem = (data.employees_failed ?? 0) > 0 || hasSkipped || hasEmailIssue || results.some((r) => r.status === 'nothing_to_do');

      // Toasts as well as the dialog: when the acted-on row disappears from the list (a deleted day),
      // a per-row trigger can unmount before the dialog is read, so the key warnings must not live
      // only inside it.
      results.forEach((r) => {
        const name = nameById.get(String(r.employee_id)) ?? `Employee #${r.employee_id}`;
        if (r.status === 'failed') showError(`${name}: ${r.error || 'could not be processed.'}`);
        else if (r.status === 'done' && (r.email_status === 'failed' || r.email_status === 'no_email')) {
          warning(`Done, but ${name} could not be notified by email.`);
        }
      });

      if (hasProblem) setResult({ data, mode, nameById });
      else success(`${data.total_logs_affected} log${data.total_logs_affected === 1 ? '' : 's'} ${cfg.doneVerb} for ${data.employees_processed} employee${data.employees_processed === 1 ? '' : 's'}.`);
    } catch (err) {
      // 422 (empty reason, bad date, missing confirm) and anything else: show the backend message
      // and keep the modal open so the user can fix it and retry.
      showError(extractApiError(err));
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={!!mode} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-lg">
          {cfg && (
            <>
              <DialogHeader>
                <DialogTitle>{cfg.title}</DialogTitle>
                <DialogDescription>
                  {mode === 'delete'
                    ? `You are about to permanently delete approved logs for ${groups.length} employee${groups.length === 1 ? '' : 's'} across ${dateCount} date${dateCount === 1 ? '' : 's'}. This cannot be undone — deleted logs cannot be reverted or restored. Each employee will be notified by email.`
                    : cfg.description}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                {groups.map((g) => (
                  <p key={g.employeeId}>
                    <span className="font-medium">{g.employeeName ?? `Employee #${g.employeeId}`}</span>
                    <span className="text-muted-foreground"> — {g.dates.map(fmtDate).join(', ')}</span>
                  </p>
                ))}
              </div>
              {tooMany && (
                <p className="text-xs text-destructive">
                  Too many selections — at most {MAX_EMPLOYEES} employees and {MAX_DATES_PER_EMPLOYEE} dates per employee at a time.
                </p>
              )}

              <div className="space-y-1.5">
                <Textarea
                  autoFocus
                  placeholder={mode === 'delete' ? 'Why are these logs being deleted? (applies to all)' : 'Why are these logs being reverted? (applies to all)'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={REASON_MAX_LENGTH}
                  disabled={isSubmitting}
                  rows={3}
                  aria-label="Reason"
                />
                <p className="text-right text-xs text-muted-foreground">{trimmed.length}/{REASON_MAX_LENGTH}</p>
              </div>

              {mode === 'delete' && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                  <Checkbox
                    checked={understood}
                    onCheckedChange={(v) => setUnderstood(v === true)}
                    disabled={isSubmitting}
                    className="mt-0.5"
                  />
                  <span>I understand this cannot be undone</span>
                </label>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={close} disabled={isSubmitting}>Cancel</Button>
                <Button
                  size="sm"
                  variant={mode === 'delete' ? 'destructive' : 'default'}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {isSubmitting ? cfg.confirming : cfg.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
};

// Selection-toolbar buttons: Revert to Pending / Delete, enabled only when the selection holds at
// least one date with an approved, unsynced log. `items` is already filtered to eligible rows.
export const ApprovedBulkActions = ({ items, onDone, disabled = false }) => {
  const [mode, setMode] = useState(null);
  const groups = useMemo(() => groupItems(items), [items]);
  if (items.length === 0) return null;
  const dateCount = groups.reduce((n, g) => n + g.dates.length, 0);

  return (
    <>
      <span className="text-xs text-muted-foreground">
        {groups.length} employee{groups.length === 1 ? '' : 's'} · {dateCount} date{dateCount === 1 ? '' : 's'} with approved logs
      </span>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMode('revert')} disabled={disabled}>
        <Undo2 className="h-3.5 w-3.5" />
        Revert to Pending
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive hover:text-destructive"
        onClick={() => setMode('delete')}
        disabled={disabled}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
      <ApprovedBulkDialogs mode={mode} items={items} onClose={() => setMode(null)} onDone={onDone} />
    </>
  );
};

// Wraps a row's existing Approve/Reject cell and adds icon-only Revert + Delete next to it — they open
// the same day-wise flows, pre-filled with just this employee + date. Daily logs only (the
// endpoint is date-based); a row with nothing approved/unsynced shows no icon.
export const BucketActionsCell = ({
  row, logType, hasPendingActions, disabled, children,
}) => {
  const [mode, setMode] = useState(null); // 'revert' | 'delete' | null
  const eligible = logType === 'daily' && !!row?.date && bucketHasApprovedLogs(row);
  if (!eligible) return children;
  const items = [{ employeeId: row.employeeId, employeeName: row.employeeName, date: row.date }];

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {hasPendingActions && children}
      <Button
        size="sm"
        title="Revert approved logs to Pending"
        aria-label="Revert approved logs to Pending"
        className="h-6 w-6 shrink-0 rounded border border-amber-500/50 bg-background p-0 text-amber-600 transition-colors hover:bg-amber-500 hover:text-white"
        onClick={() => setMode('revert')}
        disabled={disabled}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        title="Delete approved logs for this date"
        aria-label="Delete approved logs for this date"
        className="h-6 w-6 shrink-0 rounded border border-destructive/40 bg-background p-0 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => setMode('delete')}
        disabled={disabled}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ApprovedBulkDialogs mode={mode} items={items} onClose={() => setMode(null)} />
    </div>
  );
};

export default ApprovedBulkActions;
