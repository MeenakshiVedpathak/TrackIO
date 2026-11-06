import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Undo2, Trash2 } from 'lucide-react';
import { useRevertMyTeamTimesheetEntry, useDeleteMyTeamTimesheetEntry } from '@/hooks/useMyTeam';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const REASON_MAX_LENGTH = 1000;

// A log can be reverted/deleted only while it is approved AND not yet synced into an official
// Timesheet record (synced rows are read-only). Pending/rejected/synced rows get no actions.
export const isApprovedUnsynced = (entry) =>
  entry?.status === 'approved' && entry.is_synced !== true && entry.synced !== true;

const MODES = {
  revert: {
    title: 'Revert to Pending',
    description: 'This log will go back to Pending and the employee will be notified.',
    placeholder: 'Why is this log being reverted?',
    confirm: 'Revert',
    confirming: 'Reverting…',
    destructive: false,
    done: 'Log reverted to Pending.',
  },
  delete: {
    title: 'Delete Log',
    description: 'This log will be removed and the employee will be notified. This cannot be undone.',
    placeholder: 'Why is this log being deleted?',
    confirm: 'Delete',
    confirming: 'Deleting…',
    destructive: true,
    done: 'Log deleted.',
  },
};

// Revert / Delete for an approved log, with a mandatory reason. Self-contained: owns the
// confirmation dialog, the two mutations and the toast/refresh handling, so each approver screen
// only has to drop `<ApprovedEntryActions entry={r} />` into its entry row. Renders nothing for an
// entry that isn't approved-and-unsynced.
const ApprovedEntryActions = ({ entry, disabled = false }) => {
  const { success, error: showError, warning } = useNotification();
  const queryClient = useQueryClient();
  const revertMutation = useRevertMyTeamTimesheetEntry();
  const deleteMutation = useDeleteMyTeamTimesheetEntry();
  const [mode, setMode] = useState(null); // 'revert' | 'delete' | null
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A ref (not just state) so a fast second click in the same tick can't slip past the guard
  // before React re-renders the disabled button.
  const inFlightRef = useRef(false);

  if (!isApprovedUnsynced(entry) && !mode) return null;

  const cfg = mode ? MODES[mode] : null;
  const trimmed = reason.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= REASON_MAX_LENGTH;

  const close = () => {
    if (inFlightRef.current) return;
    setMode(null);
    setReason('');
  };

  // 404 (log gone) / 409 (not approved any more, already synced, or changed by someone else) mean
  // the list on screen is stale — show the backend's message and refresh it.
  const refreshList = () => {
    queryClient.invalidateQueries({ queryKey: ['my-team', 'approval-summary'] });
  };

  const handleSubmit = async () => {
    if (!isValid || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const mutation = mode === 'revert' ? revertMutation : deleteMutation;
      const res = await mutation.mutateAsync({ id: entry.id, reason: trimmed });
      const emailStatus = res?.data?.email_status;
      success(res?.message || cfg.done);
      // The action itself succeeded; only the courtesy email didn't go out.
      if (emailStatus === 'failed' || emailStatus === 'no_email') {
        warning('Done, but the employee could not be notified by email.');
      }
      inFlightRef.current = false;
      setMode(null);
      setReason('');
    } catch (err) {
      showError(extractApiError(err));
      const status = err?.response?.status;
      if (status === 404 || status === 409) {
        inFlightRef.current = false;
        setMode(null);
        setReason('');
        refreshList();
      }
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isApprovedUnsynced(entry) && (
        <div className="mt-2 flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1"
            onClick={() => setMode('revert')}
            disabled={disabled}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Revert
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-destructive hover:text-destructive"
            onClick={() => setMode('delete')}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      )}

      <Dialog open={!!mode} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          {cfg && (
            <>
              <DialogHeader>
                <DialogTitle>{cfg.title}</DialogTitle>
                <DialogDescription>{cfg.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Textarea
                  autoFocus
                  placeholder={cfg.placeholder}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={REASON_MAX_LENGTH}
                  disabled={isSubmitting}
                  rows={4}
                  aria-label="Reason"
                />
                <p className="text-right text-xs text-muted-foreground">{trimmed.length}/{REASON_MAX_LENGTH}</p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={close} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant={cfg.destructive ? 'destructive' : 'default'}
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!isValid || isSubmitting}
                >
                  {isSubmitting ? cfg.confirming : cfg.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ApprovedEntryActions;
