import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';
import { useServiceType, useCreateServiceType, useUpdateServiceType } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";

const schema = z.object({
  service_type_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  service_category_id: z.coerce
    .number({ required_error: 'Service category is required' })
    .positive('Service category is required'),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const ServiceTypeForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: serviceType, isPending: isLoading } = useServiceType(id);
  const { data: serviceCategories = [], isPending: isLoadingCategories } = useActiveServiceCategories();
  const createMutation = useCreateServiceType();
  const updateMutation = useUpdateServiceType(id);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      service_type_name: '',
      service_category_id: '',
    },
  });

  useEffect(() => {
    if (serviceType && isEdit) {
      form.reset({
        service_type_name: serviceType.service_type_name ?? '',
        service_category_id: serviceType.service_category_id ?? '',
      });
    }
  }, [serviceType, isEdit, form]);

  const onSubmit = (values) => {
    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(values, {
      onSuccess: () => {
        success(isEdit ? 'Service type updated.' : 'Service type created.');
        handleClose();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleClose = () => {
    navigate(ROUTES.SERVICE_TYPES);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoading) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Service Type' : 'New Service Type'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEdit && isLoading ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="type-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-5">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">Service Type Details</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="service_category_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1 sm:col-span-2">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> Service Category
                      </FormLabel>
                      <SearchableSelect
                        options={serviceCategories.map((c) => ({
                          value: String(c.id),
                          label: c.name
                        }))}
                        value={field.value ? String(field.value) : ''}
                        onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
                        disabled={isLoadingCategories}
                        placeholder="Select service category"
                        searchPlaceholder="Search category..."
                        className="h-8 text-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="service_type_name"
                  render={({ field }) => (
                    <FormItem className="space-y-1 sm:col-span-2">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> Service Type Name
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Cloud Support" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
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
          <Button type="submit" size="sm" disabled={isSubmitting} form="type-form">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Service Type'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ServiceTypeForm;
