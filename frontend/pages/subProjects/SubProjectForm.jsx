import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';
import { useSubProject, useCreateSubProject, useUpdateSubProject } from '@/hooks/useSubProjects';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";

const subProjectSchema = z.object({
  sub_project_name: z
    .string()
    .min(1, 'Sub-project name is required')
    .max(150, 'Name cannot exceed 150 characters'),
  service_po_id: z
    .string()
    .min(1, 'Service PO is required'),
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional().or(z.literal('')),
  start_date: z.string().optional().or(z.literal('')),
  end_date: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
}).refine(
  (d) => {
    if (d.start_date && d.end_date) return d.end_date >= d.start_date;
    return true;
  },
  { message: 'End date cannot be before start date', path: ['end_date'] }
);

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const SubProjectForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: subProject, isPending: isLoadingSubProject } = useSubProject(id);
  const { data: activePOs = [] } = useActiveServicePOs();
  const createMutation = useCreateSubProject();
  const updateMutation = useUpdateSubProject(id);

  const form = useForm({
    resolver: zodResolver(subProjectSchema),
    defaultValues: {
      sub_project_name: '',
      service_po_id: '',
      description: '',
      start_date: '',
      end_date: '',
      status: 'active',
    },
  });

  useEffect(() => {
    if (subProject && isEdit) {
      form.reset({
        sub_project_name: subProject.sub_project_name ?? '',
        service_po_id: subProject.service_po_id ? String(subProject.service_po_id) : '',
        description: subProject.description ?? '',
        start_date: subProject.start_date?.split('T')[0] ?? '',
        end_date: subProject.end_date?.split('T')[0] ?? '',
        status: subProject.status ?? 'active',
      });
    }
  }, [subProject, isEdit, form]);

  const onSubmit = (values) => {
    const payload = {
      sub_project_name: values.sub_project_name,
      service_po_id: Number(values.service_po_id),
      status: values.status,
      ...(values.description && { description: values.description }),
      ...(values.start_date && { start_date: values.start_date }),
      ...(values.end_date && { end_date: values.end_date }),
    };

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => {
        success(isEdit ? 'Sub-project updated successfully.' : 'Sub-project created successfully.');
        handleClose();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleClose = () => {
    navigate(ROUTES.SUB_PROJECTS);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoadingSubProject) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Sub-Project' : 'Add Sub-Project'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {isEdit && isLoadingSubProject ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="subproject-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-6">
                
                {/* Basic Details Group */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">Basic Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sub_project_name"
                      render={({ field }) => (
                        <FormItem className="space-y-1 sm:col-span-2">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">
                            <span className="text-destructive mr-0.5">*</span> Sub-Project Name
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Phase 1 – Discovery" className="h-8 text-sm border-gray-200" {...field} />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="service_po_id"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">
                            <span className="text-destructive mr-0.5">*</span> Service PO
                          </FormLabel>
                          <SearchableSelect
                            options={activePOs.map((po) => ({
                              value: String(po.id),
                              label: po.po_number ?? po.service_po_name ?? String(po.id)
                            }))}
                            value={field.value ? String(field.value) : ''}
                            onValueChange={(v) => field.onChange(v ?? '')}
                            placeholder="Select a Service PO"
                            searchPlaceholder="Search PO..."
                            className="h-8 text-sm border-gray-200"
                          />
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="space-y-1 flex flex-col justify-center h-full pt-4">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium mb-1">Status</FormLabel>
                          <FormControl>
                            <button
                              type="button"
                              onClick={() => field.onChange(field.value === 'active' ? 'inactive' : 'active')}
                              className={cn(
                                "flex items-center justify-between gap-1.5 rounded-full px-2 py-1 w-[72px] transition-all duration-300 focus:outline-none",
                                field.value === 'active' ? "bg-blue-500 text-white flex-row" : "bg-slate-300 text-slate-700 flex-row-reverse"
                              )}
                            >
                              <span className="text-[11px] font-medium leading-none px-0.5">{field.value === 'active' ? 'Active' : 'Inactive'}</span>
                              <div className="h-3 w-3 shrink-0 rounded-full bg-white shadow-sm" />
                            </button>
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Timeline & Description */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">Timeline & Description</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="start_date"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Start Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value || ''}
                              onChange={field.onChange}
                              clearable
                              className="h-8 text-sm border-gray-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="end_date"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">End Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value || ''}
                              onChange={field.onChange}
                              clearable
                              className="h-8 text-sm border-gray-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="space-y-1 sm:col-span-2">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Optional description of this sub-project…"
                              className="h-20 min-h-0 resize-none text-sm border-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

              </form>
            </Form>
          )}
        </div>

        <SheetFooter className="px-5 py-4 border-t bg-gray-50/80 mt-auto flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting} form="subproject-form" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Sub-Project'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default SubProjectForm;
