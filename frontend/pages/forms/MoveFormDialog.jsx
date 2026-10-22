import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useFormModules, useMoveForm } from '@/hooks/useForms';
import { useFormCategories } from '@/hooks/useFormCategories';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';

// Reused across rows — `form` changes as different rows are targeted, so local module/category
// selection re-seeds from the incoming form every time the dialog opens.
const MoveFormDialog = ({ form, open, onOpenChange }) => {
  const { success, error: showError } = useNotification();
  const { data: moduleOptions = [], isPending: isLoadingModules } = useFormModules({ status: 'active' });
  const moveMutation = useMoveForm();

  const currentModuleId = moduleOptions.find((m) => m.form_name === form?.module_name)?.id;
  const [moduleId, setModuleId] = useState(currentModuleId);
  const [categoryId, setCategoryId] = useState(form?.category_id != null ? String(form.category_id) : 'none');

  useEffect(() => {
    if (!open) return;
    setModuleId(currentModuleId);
    setCategoryId(form?.category_id != null ? String(form.category_id) : 'none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form?.id, currentModuleId]);

  // Category options are scoped to whichever module is currently selected in this dialog.
  const { data: categoryOptions = [], isPending: isLoadingCategories } = useFormCategories(
    { module_id: moduleId, status: 'active' }
  );

  const handleModuleChange = (v) => {
    if (!v) return;
    setModuleId(Number(v));
    // A category from the previous module is never valid for the new one.
    setCategoryId('none');
  };

  const handleConfirm = () => {
    moveMutation.mutate(
      { id: form.id, module_id: moduleId, category_id: categoryId === 'none' ? null : Number(categoryId) },
      {
        onSuccess: () => {
          success('Form moved successfully.');
          onOpenChange(false);
        },
        onError: (err) => showError(extractApiError(err)),
      }
    );
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Move Form</DialogTitle>
          <DialogDescription>Move "{form.form_name}" to a different module or category.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Module</label>
            <Select value={moduleId != null ? String(moduleId) : undefined} onValueChange={handleModuleChange} disabled={isLoadingModules}>
              <SelectTrigger className="h-8 text-sm border-gray-200">
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                {moduleOptions.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.form_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Category</label>
            <Select value={categoryId || undefined} onValueChange={(v) => v && setCategoryId(v)} disabled={isLoadingCategories || !moduleId}>
              <SelectTrigger className="h-8 text-sm border-gray-200">
                <SelectValue placeholder={isLoadingCategories ? 'Loading categories…' : 'Select a category'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Category</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoadingCategories && categoryOptions.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No category available — the form will sit directly under the module.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={moveMutation.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={moveMutation.isPending || !moduleId}>
            {moveMutation.isPending ? 'Moving…' : 'Confirm Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MoveFormDialog;
