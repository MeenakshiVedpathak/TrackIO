import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { useFormModules } from '@/hooks/useForms';
import { useFormCategories, useCreateFormCategory, useUpdateFormCategory } from '@/hooks/useFormCategories';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

const baseFields = {
  name: z.string().min(2, 'Must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
};
// Module is only user-editable on create — it's immutable on a category once created (the
// backend rejects module_id on the update payload), so the edit path never includes this field.
const createSchema = z.object({ ...baseFields, module_id: z.string().min(1, 'Module is required') });
const editSchema = z.object(baseFields);

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

// Module is preselected from whichever module the user was viewing on CategoryList (?module_id=)
// but stays a real dropdown on create, so picking "Add Category" doesn't lock you into that
// module — you can create the category under any module right from this form. It's immutable
// once created, so the edit path shows it as static text instead.
const CategoryForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const presetModuleId = Number(searchParams.get('module_id')) || undefined;
  const { success, error: showError } = useNotification();

  // Unscoped list (for the edit-mode read-only label, which must resolve even if the module was
  // since deactivated) and an active-only list (source for the create-mode dropdown).
  const { data: allModules = [] } = useFormModules({});
  const { data: activeModules = [], isPending: isLoadingModules } = useFormModules({ status: 'active' });

  // No single-category-by-id endpoint — read the record back out of the module-scoped list
  // that's already the source of truth for this module's categories. On create there's nothing
  // to look up yet, so this simply stays empty.
  const { data: categories = [], isPending: isLoadingCategories } = useFormCategories({ module_id: presetModuleId });
  const category = isEdit ? categories.find((c) => c.id === Number(id)) : undefined;
  const editModuleId = category?.module_id ?? presetModuleId;
  const editModuleName = allModules.find((m) => m.id === editModuleId)?.form_name;

  const createMutation = useCreateFormCategory();
  const updateMutation = useUpdateFormCategory(id);

  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: {
      name: '',
      description: '',
      status: 'active',
      ...(isEdit ? {} : { module_id: presetModuleId ? String(presetModuleId) : '' }),
    },
  });

  const formStatus = useWatch({ control: form.control, name: 'status' });

  useEffect(() => {
    if (category && isEdit) {
      form.reset({
        name: category.name ?? '',
        description: category.description ?? '',
        status: category.status ?? 'active',
      });
    }
  }, [category, isEdit, form]);

  const handleClose = (backModuleId) => navigate(`${ROUTES.FORM_CATEGORIES}?module=${backModuleId ?? editModuleId ?? ''}`);

  const onSubmit = (values) => {
    if (isEdit) {
      updateMutation.mutate(values, {
        onSuccess: () => {
          success('Category updated.');
          handleClose();
        },
        onError: (err) => showError(extractApiError(err)),
      });
      return;
    }

    const submittedModuleId = Number(values.module_id);
    createMutation.mutate({ ...values, module_id: submittedModuleId }, {
      onSuccess: () => {
        success('Category created.');
        handleClose(submittedModuleId);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isLoading = isEdit && isLoadingCategories;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Category' : 'New Category'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="category-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">
                {isEdit ? (
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Module</label>
                    <div className="h-8 flex items-center px-3 text-sm rounded-md border border-gray-200 bg-muted/40 text-muted-foreground">
                      {editModuleName ?? (editModuleId ? `Module #${editModuleId}` : '—')}
                    </div>
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="module_id"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[11px] text-muted-foreground font-medium">
                          <span className="text-destructive mr-0.5">*</span> Module
                        </FormLabel>
                        <Select value={field.value || undefined} onValueChange={(v) => v && field.onChange(v)} disabled={isLoadingModules}>
                          <FormControl>
                            <SelectTrigger className="h-8 text-sm border-gray-200">
                              <SelectValue placeholder={isLoadingModules ? 'Loading modules…' : 'Select a module'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeModules.map((m) => (
                              <SelectItem key={m.id} value={String(m.id)}>{m.form_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium">
                        <span className="text-destructive mr-0.5">*</span> Category Name
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Financial Reports" {...field} className="h-8 text-sm border-gray-200" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium">Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Optional description" {...field} className="text-sm border-gray-200" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="space-y-1 mt-1">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium">Status</FormLabel>
                      <FormControl>
                        <button
                          type="button"
                          onClick={() => field.onChange(formStatus === 'active' ? 'inactive' : 'active')}
                          className={cn(
                            'flex items-center justify-between gap-1.5 rounded-full px-2 py-1 w-[72px] transition-all duration-300 focus:outline-none',
                            formStatus === 'active' ? 'bg-blue-500 text-white flex-row' : 'bg-slate-300 text-slate-700 flex-row-reverse'
                          )}
                        >
                          <span className="text-[11px] font-medium leading-none px-0.5">{formStatus === 'active' ? 'Active' : 'Inactive'}</span>
                          <div className="h-3 w-3 shrink-0 rounded-full bg-white shadow-sm" />
                        </button>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          )}
        </div>

        <SheetFooter className="px-5 py-3 border-t flex items-center justify-end gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => handleClose()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting} form="category-form">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Category'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default CategoryForm;
