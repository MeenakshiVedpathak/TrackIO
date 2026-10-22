import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';
import { useServiceCategory, useCreateServiceCategory, useUpdateServiceCategory } from '@/hooks/useServiceCategories';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from '@/utils/cn';

const schema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  status: z.enum(['active', 'inactive']).default('active'),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const ServiceCategoryForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: category, isPending: isLoading } = useServiceCategory(id);
  const createMutation = useCreateServiceCategory();
  const updateMutation = useUpdateServiceCategory(id);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', status: 'active' },
  });

  const formStatus = useWatch({ control: form.control, name: 'status' });

  useEffect(() => {
    if (category && isEdit) {
      form.reset({
        name: category.name ?? '',
        status: category.status ?? 'active',
      });
    }
  }, [category, isEdit, form]);

  const onSubmit = (values) => {
    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(values, {
      onSuccess: () => {
        success(isEdit ? 'Service category updated.' : 'Service category created.');
        handleClose();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleClose = () => {
    navigate(ROUTES.SERVICE_CATEGORIES);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoading) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Service Category' : 'New Service Category'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEdit && isLoading ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="category-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-5">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">Category Details</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-1 sm:col-span-2">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium">
                        <span className="text-destructive mr-0.5">*</span> Category Name 
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Managed Services" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
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
                        <div>
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
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
                  </div>
                </div>
              </form>
            </Form>
          )}
        </div>

        <SheetFooter className="px-5 py-3 border-t flex items-center justify-end gap-3 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleClose}>
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

export default ServiceCategoryForm;
