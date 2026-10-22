import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const ConfirmDialog = ({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  onConfirm,
  isLoading = false,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {/* Smaller (max-w-sm, tighter p-5 vs the base Dialog's p-6) and anchored near the top of the
        viewport (top-[12%], translate-y-0) instead of the base Dialog's dead-vertical-center —
        a plain yes/no confirm reads as heavier than it needs to when it takes over the whole
        screen the same way a full form/detail Dialog does, and centering ignores where on a long
        page (or inside an already-open Sheet) the triggering action actually was. Overridden here
        only, not in ui/dialog.jsx itself — every other Dialog in the app keeps its default
        size/position; this is specific to a plain confirm prompt. */}
    <DialogContent className="max-w-sm top-[12%] translate-y-0 p-5">
      <DialogHeader className="mb-0">
        <div className="flex items-center gap-3 mb-2">
          {variant === 'destructive' && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
          )}
          <DialogTitle className="text-base">{title}</DialogTitle>
        </div>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <DialogFooter className="mt-4 gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} size="sm" onClick={onConfirm} disabled={isLoading}>
          {isLoading ? 'Processing…' : confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
