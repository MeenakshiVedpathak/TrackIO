import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { useProject, useCreateProject, useUpdateProject } from '@/hooks/useProjects';
import { useActiveClients, useClients } from '@/hooks/useClients';
import { clientsApi } from '@/api/clients.api';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/utils/cn';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";

const projectSchema = z.object({
  client_id: z.coerce.number({ required_error: 'Client is required' }).positive('Client is required'),
  project_name: z
    .string()
    .min(1, 'Project name is required')
    .max(200, 'Project name cannot exceed 200 characters'),
  project_description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
  // Only asked of a BU-scoped login mapped to more than one BU — see showBuSelector below.
  company_id: z.string().optional(),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const ProjectForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: project, isPending: isLoadingProject } = useProject(id);
  const { data: activeClients = [], isPending: isLoadingClients } = useActiveClients();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(id);
  const [isResolvingCompany, setIsResolvingCompany] = useState(false);

  // Same rule as ClientForm: only a BU-scoped login mapped to MORE THAN ONE BU is asked, because
  // only they have a choice to make.
  //   cross-BU login (Admin/Entity Admin/Platform Admin) -> no selector; the BU is inherited from
  //       the chosen Client, as before.
  //   BU-scoped, 1 BU                                    -> no selector; nothing to choose, and
  //       the X-Company-Id header already says which BU.
  //   BU-scoped, >1 BU                                   -> REQUIRED selector; their explicit
  //       pick is authoritative and the Client lookup below is skipped entirely.
  const { isCrossBu, canFilter, units } = useSelectableBusinessUnits();
  const showBuSelector = !isCrossBu && canFilter;
  const buOptions = units.map((bu) => ({ label: bu.name, value: String(bu.id) }));

  const form = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      client_id: '',
      project_name: '',
      project_description: '',
      status: 'active',
      company_id: '',
    },
  });

  // The Client list must be scoped to the chosen BU whenever the BU is asked for. The backend
  // resolves the client WITHIN the company_id sent on the request, so offering clients from the
  // login's other BUs lets the two fields disagree and the create fails with "Client not found."
  // Held until a BU is picked — there is nothing sensible to list before then.
  const selectedBuId = form.watch('company_id');
  const { data: scopedClients, isPending: isLoadingScopedClients } = useClients(
    { buId: selectedBuId, status: 'active', limit: 200 },
    { enabled: showBuSelector && !!selectedBuId }
  );

  const clientOptions = (showBuSelector ? (scopedClients?.data ?? []) : activeClients)
    .map((c) => ({ value: String(c.id), label: c.client_name }));
  const clientsLoading = showBuSelector ? isLoadingScopedClients : isLoadingClients;
  const clientDisabled = showBuSelector ? (!selectedBuId || clientsLoading) : clientsLoading;

  useEffect(() => {
    if (project && isEdit) {
      form.reset({
        client_id: project.client_id ?? project.client?.id ?? '',
        project_name: project.project_name ?? '',
        project_description: project.project_description ?? '',
        status: project.status ?? 'active',
        company_id: project.company_id ? String(project.company_id) : '',
      });
    }
  }, [project, isEdit, form]);

  // The backend requires company_id (Business Unit) on create but a Project has no BU field of
  // its own. Where it comes from depends on whether the login was asked:
  //   · asked (BU-scoped, >1 BU)  -> their explicit pick wins, and the Client lookup is skipped.
  //   · not asked                 -> inherited from the selected Client's own record, as before.
  // Deriving it from the Client silently produces NOTHING when that Client is itself BU-less
  // (which is every client a cross-BU login creates), leaving the backend to fall back to the
  // globally-active X-Company-Id — for a multi-BU login that is a coin flip between their BUs,
  // which is why they are now asked outright.
  const onSubmit = async (values) => {
    if (showBuSelector && !values.company_id) {
      form.setError('company_id', { message: 'Business Unit is required.' });
      return;
    }

    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v != null)
    );

    if (showBuSelector) {
      clean.company_id = Number(clean.company_id);
    } else if (!isEdit) {
      try {
        setIsResolvingCompany(true);
        const client = await clientsApi.getById(values.client_id);
        const companyId = client?.company_id ?? client?.company?.id;
        if (companyId != null) {
          clean.company_id = Number(companyId);
        }
      } catch (err) {
        setIsResolvingCompany(false);
        showError(extractApiError(err));
        return;
      }
      setIsResolvingCompany(false);
    }

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(clean, {
      onSuccess: () => {
        success(isEdit ? 'Project updated successfully.' : 'Project created successfully.');
        handleClose();
      },
      onError: (err) => {
        const message = extractApiError(err);
        // A cached BU list can outlive the mapping behind it ("Business Unit #X is not one of
        // your mapped Business Units."); pin that to the field that caused it, not just a toast.
        if (err?.response?.status === 403 && /business unit/i.test(message)) {
          form.setError('company_id', { message });
        }
        showError(message);
      },
    });
  };

  const handleClose = () => {
    navigate(ROUTES.PROJECTS);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || isResolvingCompany;

  if (isEdit && isLoadingProject) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Project' : 'Add New Project'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {isEdit && isLoadingProject ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="project-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-6">

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">Project Details</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {/* Only for BU-scoped logins with more than one BU. Everyone else inherits
                        the BU from the selected Client (see onSubmit). */}
                    {showBuSelector && (
                      <FormField
                        control={form.control}
                        name="company_id"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium">
                              <span className="text-destructive mr-0.5">*</span> Business Unit
                            </FormLabel>
                            <FormControl>
                              <SearchableSelect
                                options={buOptions}
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder="Select business unit"
                                searchPlaceholder="Search business unit..."
                                className="h-8 text-sm w-full"
                              />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="client_id"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Client</FormLabel>
                          <SearchableSelect
                            options={activeClients.map((c) => ({
                              value: String(c.id),
                              label: c.client_name,
                            }))}
                            value={field.value}
                            onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                            disabled={isLoadingClients}
                            placeholder="Select client"
                            searchPlaceholder="Search client..."
                            className="h-8 text-sm"
                          />
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="project_name"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Project Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Website Revamp" className="h-8 text-sm border-gray-200" {...field} />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="project_description"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe this project…"
                              rows={3}
                              className="resize-none text-sm border-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="space-y-1 flex flex-col justify-center pt-1">
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

              </form>
            </Form>
          )}
        </div>

        <SheetFooter className="px-5 py-4 border-t bg-gray-50/80 mt-auto flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="submit" form="project-form" disabled={isSubmitting} size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ProjectForm;
