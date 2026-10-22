import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFormById, useFormModules, useCreateForm, useUpdateForm, useMoveForm } from '@/hooks/useForms';
import { useFormCategories } from '@/hooks/useFormCategories';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

const moduleSchema = z.object({
  form_name: z.string().min(2, 'Must be at least 2 characters').max(100),
  status: z.enum(['active', 'inactive']).default('active'),
});

const formSchema = z.object({
  form_name: z.string().min(2, 'Must be at least 2 characters').max(100),
  module_name: z.string().min(1, 'Module is required'),
  // Select values must be strings — 'none' means "directly under the module" (category_id: null),
  // anything else is a numeric category id converted back to a number at submit time.
  category_id: z.string().default('none'),
  status: z.enum(['active', 'inactive']).default('active'),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

// A row can never switch between module and form (the API returns 400 if you try — see
// PUT /forms/:id), so `isModule` is fixed for the lifetime of one edit and derived once from
// the loaded record's own module_name, never from user input.
const FormFields = ({ id, isEdit, isModule, formRecord, onClose }) => {
  const { success, error: showError } = useNotification();
  const createMutation = useCreateForm();
  const updateMutation = useUpdateForm(id);
  const moveMutation = useMoveForm();
  // Module dropdown must come from GET /forms/modules (module rows only), never derived from
  // the flat form list.
  const { data: moduleOptions = [], isPending: isLoadingModules } = useFormModules({ status: 'active' });

  const rhForm = useForm({
    resolver: zodResolver(isModule ? moduleSchema : formSchema),
    defaultValues: {
      form_name: formRecord?.form_name ?? '',
      ...(isModule ? {} : {
        module_name: formRecord?.module_name ?? '',
        category_id: formRecord?.category_id != null ? String(formRecord.category_id) : 'none',
      }),
      status: formRecord?.status ?? 'active',
    },
  });

  const formStatus = useWatch({ control: rhForm.control, name: 'status' });
  const watchedModuleName = useWatch({ control: rhForm.control, name: 'module_name' });
  const selectedModuleId = moduleOptions.find((m) => m.form_name === watchedModuleName)?.id;

  // Category options are scoped to whichever module is currently selected — an empty result
  // means "No Category Available" (still a valid state, not an error).
  const { data: categoryOptions = [], isPending: isLoadingCategories } = useFormCategories(
    { module_id: selectedModuleId, status: 'active' }
  );

  // Changing the Module must reset the Category selection — a category from the previous module
  // is never valid for the new one. Skip the very first render so loading an existing form's
  // saved module_name doesn't wipe its saved category_id.
  const isFirstModuleRender = useRef(true);
  useEffect(() => {
    if (isModule) return;
    if (isFirstModuleRender.current) {
      isFirstModuleRender.current = false;
      return;
    }
    rhForm.setValue('category_id', 'none');
  }, [watchedModuleName, isModule, rhForm]);

  const onSubmit = async (values) => {
    if (isModule) {
      // Never send seq — the server always computes it (next module slot).
      const payload = { form_name: values.form_name, module_name: null, status: values.status };
      const mutation = isEdit ? updateMutation : createMutation;
      mutation.mutate(payload, {
        onSuccess: () => {
          success(isEdit ? 'Module updated successfully.' : 'Module created successfully.');
          onClose();
        },
        onError: (err) => showError(extractApiError(err)),
      });
      return;
    }

    const resolvedCategoryId = values.category_id === 'none' ? null : Number(values.category_id);

    if (!isEdit) {
      // Never send seq — the server always computes the next slot within the chosen module/category.
      const payload = { form_name: values.form_name, module_name: values.module_name, status: values.status, category_id: resolvedCategoryId };
      createMutation.mutate(payload, {
        onSuccess: () => {
          success('Form created successfully.');
          onClose();
        },
        onError: (err) => showError(extractApiError(err)),
      });
      return;
    }

    // Edit path: PUT /forms/:id never touches category_id, so module/category changes go through
    // the dedicated move endpoint instead — always together, since omitting category_id while
    // changing module_id would otherwise silently reset the category to null server-side.
    const moduleChanged = values.module_name !== formRecord.module_name;
    const categoryChanged = resolvedCategoryId !== (formRecord.category_id ?? null);

    try {
      await updateMutation.mutateAsync({ form_name: values.form_name, status: values.status });
      if (moduleChanged || categoryChanged) {
        await moveMutation.mutateAsync({
          id,
          module_id: moduleOptions.find((m) => m.form_name === values.module_name)?.id,
          category_id: resolvedCategoryId,
        });
      }
      success('Form updated successfully.');
      onClose();
    } catch (err) {
      showError(extractApiError(err));
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || moveMutation.isPending;

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <Form {...rhForm}>
          <form id="form-master-form" onSubmit={rhForm.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">
            <FormField
              control={rhForm.control}
              name="form_name"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] text-muted-foreground font-medium">
                    <span className="text-destructive mr-0.5">*</span> {isModule ? 'Module Name' : 'Form Name'}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={isModule ? 'e.g. Reports' : 'e.g. Report Summary'} {...field} className="h-8 text-sm border-gray-200" />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {!isModule && (
              <FormField
                control={rhForm.control}
                name="module_name"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Module</FormLabel>
                    {/* Guard onValueChange with `if(v)` — Radix Select fires a mount-time empty
                        change event while options are still loading, which would otherwise wipe
                        a value already set on this RHF field. */}
                    <Select value={field.value || undefined} onValueChange={(v) => v && field.onChange(v)} disabled={isLoadingModules}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm border-gray-200">
                          <SelectValue placeholder={isLoadingModules ? 'Loading modules…' : 'Select a module'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {moduleOptions.map((m) => (
                          <SelectItem key={m.id} value={m.form_name}>{m.form_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            )}

            {!isModule && (
              <FormField
                control={rhForm.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[11px] text-muted-foreground font-medium">Category</FormLabel>
                    <Select value={field.value || undefined} onValueChange={(v) => v && field.onChange(v)} disabled={isLoadingCategories || !selectedModuleId}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm border-gray-200">
                          <SelectValue placeholder={isLoadingCategories ? 'Loading categories…' : 'Select a category'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Category</SelectItem>
                        {categoryOptions.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isLoadingCategories && categoryOptions.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">No category available — this form will sit directly under the module.</p>
                    )}
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={rhForm.control}
              name="status"
              render={({ field }) => (
                <FormItem className="space-y-1 flex flex-col justify-center pt-2">
                  <FormLabel className="text-[11px] text-muted-foreground font-medium mb-1">Status</FormLabel>
                  <FormControl>
                    <button
                      type="button"
                      onClick={() => field.onChange(formStatus === 'active' ? 'inactive' : 'active')}
                      className={cn(
                        "flex items-center justify-between gap-1.5 rounded-full px-2 py-1 w-[72px] transition-all duration-300 focus:outline-none",
                        formStatus === 'active' ? "bg-blue-500 text-white flex-row" : "bg-slate-300 text-slate-700 flex-row-reverse"
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
      </div>

      <SheetFooter className="px-5 py-3 border-t mt-auto flex-row justify-end gap-3 items-center bg-white">
        <Button type="button" variant="outline" className="border-gray-200 h-8 text-sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="form-master-form" className="bg-blue-600 hover:bg-blue-700 h-8 text-sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save & Close'}
        </Button>
      </SheetFooter>
    </>
  );
};

const FormForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;

  const { data: formRecord, isPending: isLoadingForm } = useFormById(id);

  // New rows: mode comes from which button launched the drawer (?type=module|form). Existing
  // rows: mode is derived from the loaded record itself (module_name === null means Module) and
  // never toggled by the user.
  const isModule = isEdit ? !!formRecord && formRecord.module_name == null : searchParams.get('type') === 'module';
  const ready = isEdit ? !isLoadingForm && !!formRecord : true;

  const handleClose = () => navigate(ROUTES.FORMS);

  const title = isEdit
    ? isModule ? 'Edit Module' : 'Edit Form'
    : isModule ? 'Add New Module' : 'Add New Form';

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">{title}</SheetTitle>
        </SheetHeader>

        {!ready ? (
          <FormSkeleton />
        ) : (
          <FormFields
            key={isEdit ? `edit-${id}` : `new-${isModule ? 'module' : 'form'}`}
            id={id}
            isEdit={isEdit}
            isModule={isModule}
            formRecord={formRecord}
            onClose={handleClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

export default FormForm;
