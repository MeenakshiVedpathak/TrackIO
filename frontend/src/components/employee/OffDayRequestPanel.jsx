import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Clock, XCircle, Send, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import ProjectSelect from './ProjectSelect';
import { useCreateOffDayRequest, useResubmitOffDayRequest } from '@/hooks/useOffDayRequests';
import { useNotification } from '@/hooks/useNotification';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { extractApiError } from '@/services/apiClient';
import { formatRelativeTime } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const MAX_REASON_WORDS = 500;

const countWords = (text) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

const OffDayRequestPanel = ({ selectedDate, request, isLoading, onActionSuccess }) => {
  const { success, error: showError } = useNotification();
  const createMutation = useCreateOffDayRequest();
  const resubmitMutation = useResubmitOffDayRequest();
  const { data: mappedProjects = [] } = useEmployeeMappedProjects();

  // State A fields
  const [servicePoId, setServicePoId] = useState('');
  const [reason, setReason] = useState('');

  // State D fields (resubmit)
  const [resubmitReason, setResubmitReason] = useState('');

  const reasonWordCount = countWords(reason);
  const resubmitWordCount = countWords(resubmitReason);

  useEffect(() => {
    if (request?.reason) {
      setResubmitReason(request.reason);
    } else {
      setResubmitReason('');
    }
    setServicePoId('');
    setReason('');
  }, [request, selectedDate]);

  const formattedDate = selectedDate.format('dddd, DD MMMM YYYY');
  const dateKey = selectedDate.format('YYYY-MM-DD');

  const handleCreateSubmit = async (e) => {
    e?.preventDefault();
    if (!servicePoId) {
      showError('Please select a Service PO.');
      return;
    }
    if (!reason.trim()) {
      showError('Please provide a reason for working on this off day.');
      return;
    }
    if (countWords(reason) > MAX_REASON_WORDS) {
      showError(`Reason must be ${MAX_REASON_WORDS} words or fewer.`);
      return;
    }

    try {
      await createMutation.mutateAsync({
        service_po_id: Number(servicePoId),
        work_date: dateKey,
        reason: reason.trim(),
      });
      success('Request submitted. Awaiting manager approval.');
      setReason('');
      setServicePoId('');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      showError(extractApiError(err));
    }
  };

  const handleResubmit = async (e) => {
    e?.preventDefault();
    if (!resubmitReason.trim()) {
      showError('Please provide a reason to resubmit.');
      return;
    }
    if (countWords(resubmitReason) > MAX_REASON_WORDS) {
      showError(`Reason must be ${MAX_REASON_WORDS} words or fewer.`);
      return;
    }
    if (!request?.id) return;

    try {
      await resubmitMutation.mutateAsync({
        id: request.id,
        payload: { reason: resubmitReason.trim() },
      });
      success('Request resubmitted. Awaiting manager approval.');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      showError(extractApiError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="h-6 w-1/3 bg-muted animate-pulse rounded" />
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="h-36 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  // STATE B: PENDING
  if (request?.status === 'pending') {
    return (
      <div className="space-y-5 rounded-xl border bg-card p-6">
        <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900">Pending Approval</AlertTitle>
          <AlertDescription className="text-amber-800 text-xs mt-1">
            Your request to work on <strong className="font-semibold">{formattedDate}</strong> is pending approval from your Project Manager.
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border bg-slate-50/60 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">Service PO</span>
              <span className="font-semibold text-foreground">
                {request.service_po_name ||
                  request.service_po?.name ||
                  request.po_name ||
                  mappedProjects.find((p) => String(p.id) === String(request.service_po_id))?.name ||
                  '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">Sent</span>
              <span className="text-foreground">{formatRelativeTime(request.created_at)}</span>
            </div>
          </div>

          <div className="text-xs pt-2 border-t border-slate-200/80">
            <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider mb-1">Reason</span>
            <p className="text-foreground whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200/60">
              {request.reason}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          You can fill this timesheet once the request is approved.
        </p>
      </div>
    );
  }

  // STATE D: REJECTED
  if (request?.status === 'rejected') {
    return (
      <div className="space-y-5 rounded-xl border bg-card p-6">
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="font-semibold text-red-900">Request Rejected</AlertTitle>
          <AlertDescription className="text-red-800 text-xs mt-1">
            Your request to work on <strong className="font-semibold">{formattedDate}</strong> was rejected.
          </AlertDescription>
        </Alert>

        {request.decision_remark && (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50/50 p-3.5 text-xs text-red-900">
            <span className="font-semibold uppercase text-[10px] tracking-wider text-red-700 block mb-1">PM Remark</span>
            <p className="italic">{request.decision_remark}</p>
          </div>
        )}

        <div className="rounded-lg border bg-slate-50/40 p-4 space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-foreground">Resubmit Request</h4>
            <p className="text-[11px] text-muted-foreground">
              Update your reason and submit again for manager review.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              <span className="text-destructive mr-0.5">*</span> Reason for working
            </label>
            <Textarea
              rows={3}
              placeholder="Provide updated explanation or context for your PM..."
              value={resubmitReason}
              onChange={(e) => setResubmitReason(e.target.value)}
              className="text-xs resize-none"
              disabled={resubmitMutation.isPending}
            />
            <p className={cn(
              'text-[11px] text-right',
              resubmitWordCount > MAX_REASON_WORDS ? 'text-destructive font-medium' : 'text-muted-foreground'
            )}>
              {resubmitWordCount}/{MAX_REASON_WORDS} words
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleResubmit}
              disabled={resubmitMutation.isPending || !resubmitReason.trim() || resubmitWordCount > MAX_REASON_WORDS}
              className="text-xs"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${resubmitMutation.isPending ? 'animate-spin' : ''}`} />
              {resubmitMutation.isPending ? 'Resubmitting…' : 'Resubmit Request'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // STATE A: NO REQUEST EXISTS
  return (
    <div className="space-y-5 rounded-xl border bg-card p-6">
      <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="font-semibold text-amber-900">Off-Day Approval Required</AlertTitle>
        <AlertDescription className="text-amber-800 text-xs mt-1">
          You are viewing an off day (<strong className="font-semibold">{formattedDate}</strong>). Working on an off day requires prior approval from your Project Manager.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleCreateSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            <span className="text-destructive mr-0.5">*</span> Service PO
          </label>
          <ProjectSelect
            value={servicePoId}
            onChange={setServicePoId}
            disabled={createMutation.isPending}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            <span className="text-destructive mr-0.5">*</span> Reason for working
          </label>
          <Textarea
            rows={3}
            placeholder="Production release deployment, urgent client deliverable..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs resize-none"
            disabled={createMutation.isPending}
          />
          <p className={cn(
            'text-[11px] text-right',
            reasonWordCount > MAX_REASON_WORDS ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}>
            {reasonWordCount}/{MAX_REASON_WORDS} words
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={createMutation.isPending || !servicePoId || !reason.trim() || reasonWordCount > MAX_REASON_WORDS}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default OffDayRequestPanel;
