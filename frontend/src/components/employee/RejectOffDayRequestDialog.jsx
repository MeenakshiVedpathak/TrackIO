import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useRejectOffDayRequest } from '@/hooks/useOffDayRequests';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDate } from '@/utils/formatters';

const RejectOffDayRequestDialog = ({ open, onOpenChange, request, onSuccess }) => {
  const [remark, setRemark] = useState('');
  const { success, error: showError } = useNotification();
  const rejectMutation = useRejectOffDayRequest();

  useEffect(() => {
    if (open) {
      setRemark('');
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!remark.trim()) {
      showError('Please provide a reason / remark for the rejection.');
      return;
    }
    if (!request?.id) return;

    try {
      await rejectMutation.mutateAsync({
        id: request.id,
        payload: { remark: remark.trim() },
      });
      success('Weekend request rejected.');
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      showError(extractApiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Reject Weekend Request</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Rejecting request for <span className="font-semibold text-foreground">{request?.employee_name || 'employee'}</span> on{' '}
            <span className="font-semibold text-foreground">
              {request?.work_date ? formatDate(request.work_date, 'ddd, DD MMM YYYY') : 'selected date'}
            </span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <label className="text-xs font-medium text-foreground">
            <span className="text-destructive mr-0.5">*</span> Remark / Reason for rejection
          </label>
          <Textarea
            rows={4}
            placeholder="Explain why this request is being rejected..."
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="text-xs resize-none"
            disabled={rejectMutation.isPending}
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={rejectMutation.isPending}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={rejectMutation.isPending || !remark.trim()}
            className="text-xs"
          >
            {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RejectOffDayRequestDialog;
