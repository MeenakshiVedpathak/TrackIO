import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const REMARK_MAX_LENGTH = 1000;

// Reject requires a mandatory remark (1-1000 chars, trimmed) per the backend contract — Submit
// is blocked client-side on an empty/whitespace-only remark rather than relying on the 422 alone.
const RejectEntryDialog = ({ open, onOpenChange, onConfirm, isSubmitting, count = 1 }) => {
  const [remark, setRemark] = useState('');
  const trimmed = remark.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= REMARK_MAX_LENGTH;
  const plural = count > 1;

  const handleOpenChange = (next) => {
    if (!next) setRemark('');
    onOpenChange(next);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{plural ? `Reject ${count} Entries` : 'Reject Entry'}</DialogTitle>
          <DialogDescription>
            {plural ? 'These entries' : 'This entry'} will be sent back to the Employee to edit and resubmit. The same remark applies to {plural ? 'all of them' : 'it'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Textarea
            autoFocus
            placeholder={plural ? 'Why are these entries being rejected?' : 'Why is this entry being rejected?'}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            maxLength={REMARK_MAX_LENGTH}
            disabled={isSubmitting}
            rows={4}
          />
          <p className="text-right text-xs text-muted-foreground">{trimmed.length}/{REMARK_MAX_LENGTH}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RejectEntryDialog;
