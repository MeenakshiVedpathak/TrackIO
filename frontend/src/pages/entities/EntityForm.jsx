import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { useEntity, useCreateEntity, useUpdateEntity } from '@/hooks/useEntities';
import { useEntityAdmins } from '@/hooks/useEntityAdmins';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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

const entitySchema = z.object({
  entity_name: z
    .string()
    .min(1, 'Entity name is required')
    .max(200, 'Entity name cannot exceed 200 characters'),
  entity_admin_user_id: z.coerce.number().positive().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const EntityForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();
  const { hasRole } = useAuth();
  // Entity Admin can create/edit their own Entity, but the backend always forces
  // entity_admin_user_id to their own id and 403s if a different value is sent — so this
  // control only makes sense for an Admin caller.
  const isEntityAdminCaller = hasRole('Entity Admin');

  const { data: entity, isPending: isLoadingEntity } = useEntity(id);
  // Already scoped server-side to Entity Admins this Admin created (§2) — safe to populate the
  // dropdown directly from this list with no extra filtering. Skipped entirely for an Entity
  // Admin caller, and on create since the field is hidden in both cases — a new Entity is always
  // created unassigned, with the admin assigned later via Edit.
  const { data: entityAdminsData, isPending: isLoadingEntityAdmins } = useEntityAdmins(
    { status: 'active', limit: 200 },
    { enabled: !isEntityAdminCaller && isEdit }
  );
  const createMutation = useCreateEntity();
  const updateMutation = useUpdateEntity(id);

  const entityAdmins = entityAdminsData?.data ?? [];

  const form = useForm({
    resolver: zodResolver(entitySchema),
    defaultValues: {
      entity_name: '',
      entity_admin_user_id: null,
      status: 'active',
    },
  });

  useEffect(() => {
    if (entity && isEdit) {
      form.reset({
        entity_name: entity.entity_name ?? '',
        entity_admin_user_id: entity.entity_admin_user_id ?? entity.entity_admin?.id ?? null,
        status: entity.status ?? 'active',
      });
    }
  }, [entity, isEdit, form]);

  const onSubmit = (values) => {
    const { entity_admin_user_id, ...rest } = values;
    const clean = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== '' && v != null)
    );
    // Never sent for an Entity Admin caller — the backend ignores/forces this to their own id
    // anyway, and sending a stale value risks the "not your Entity Admin" 403 on edit.
    // On create, always sent explicitly as null — a new Entity always starts unassigned, the
    // admin is picked later via Edit. On edit, sent explicitly (even null) so unassigning an
    // Entity Admin actually reaches the backend — the blanket filter above would otherwise drop it.
    if (!isEntityAdminCaller) {
      clean.entity_admin_user_id = isEdit ? (entity_admin_user_id ?? null) : null;
    }

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(clean, {
      onSuccess: () => {
        success(isEdit ? 'Entity updated successfully.' : 'Entity created successfully.');
        handleClose();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleClose = () => {
    navigate(ROUTES.ENTITIES);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoadingEntity) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Entity' : 'Add New Entity'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {isEdit && isLoadingEntity ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="entity-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-6">

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">Entity Details</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="entity_name"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Entity Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Acme Group" className="h-8 text-sm border-gray-200" {...field} />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    {!isEntityAdminCaller && isEdit && (
                      <FormField
                        control={form.control}
                        name="entity_admin_user_id"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium">Entity Admin</FormLabel>
                            <SearchableSelect
                              options={[
                                { label: 'Unassigned', value: 'none' },
                                ...entityAdmins.map((a) => ({ label: a.email, value: String(a.id) })),
                              ]}
                              value={field.value != null ? String(field.value) : 'none'}
                              onValueChange={(v) => field.onChange(v === 'none' ? null : Number(v))}
                              disabled={isLoadingEntityAdmins}
                              placeholder="Select entity admin"
                              searchPlaceholder="Search entity admin..."
                              className="h-8 text-sm border-gray-200"
                            />
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    )}

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
          <Button type="submit" form="entity-form" disabled={isSubmitting} size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Entity'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EntityForm;
