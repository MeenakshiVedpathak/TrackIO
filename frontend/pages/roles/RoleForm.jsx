import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRole, useRoles, useCreateRole, useUpdateRole } from '@/hooks/useRoles';
import { useRefreshAccessibleForms } from '@/hooks/useAccessibleForms';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

const roleSchema = z.object({
  role_name: z.string().min(2, 'Must be at least 2 characters').max(100),
  permission: z.enum(['Read', 'Read & Write']),
  status: z.enum(['active', 'inactive']).default('active'),
  is_original_data_visible: z.boolean().default(false),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const RoleForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: role, isPending: isLoadingRole } = useRole(id);
  const { data: rolesData } = useRoles({ limit: 100 });
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole(id);
  const refreshAccessibleForms = useRefreshAccessibleForms();

  const isSystem = isEdit && !!role?.is_system;
  const inheritsFromName = role?.inherits_role_id
    ? (rolesData?.data ?? []).find((r) => r.id === role.inherits_role_id)?.role_name
    : null;

  const form = useForm({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      role_name: '',
      permission: 'Read & Write',
      status: 'active',
      is_original_data_visible: false,
    },
  });

  const formStatus = useWatch({ control: form.control, name: 'status' });

  useEffect(() => {
    if (role && isEdit) {
      form.reset({
        role_name: role.role_name ?? '',
        permission: role.permission ?? 'Read & Write',
        status: role.status ?? 'active',
        is_original_data_visible: role.is_original_data_visible ?? false,
      });
    }
  }, [role, isEdit, form]);

  const onSubmit = (values) => {
    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(values, {
      onSuccess: () => {
        success(isEdit ? 'Role updated successfully.' : 'Role created successfully.');
        // Accessible-forms changes should apply to the current session immediately, not wait
        // for the next login (the Roles list itself already refetches via useUpdateRole's
        // invalidation). is_original_data_visible is only ever set at login time.
        refreshAccessibleForms();
        handleClose();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleClose = () => {
    navigate(ROUTES.ROLES);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Role' : 'Add New Role'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEdit && isLoadingRole ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="role-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">
                {isSystem && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    This is one of the 9 fixed system roles and cannot be renamed or modified.
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="role_name"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Role Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Finance" {...field} disabled={isSystem} className="h-8 text-sm border-gray-200" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                {isEdit && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Hierarchy Rank</p>
                      <p className="text-sm h-8 flex items-center px-3 rounded-md bg-muted text-muted-foreground">
                        {role?.hierarchy_rank ?? '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Inherits From</p>
                      <p className="text-sm h-8 flex items-center px-3 rounded-md bg-muted text-muted-foreground">
                        {inheritsFromName ?? '—'}
                      </p>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="space-y-1 flex flex-col justify-center pt-2">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium mb-1">Status</FormLabel>
                      <FormControl>
                        <button
                          type="button"
                          disabled={isSystem}
                          onClick={() => field.onChange(formStatus === 'active' ? 'inactive' : 'active')}
                          className={cn(
                            "flex items-center justify-between gap-1.5 rounded-full px-2 py-1 w-[72px] transition-all duration-300 focus:outline-none disabled:opacity-40",
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
          )}
        </div>

        <SheetFooter className="px-5 py-3 border-t mt-auto flex-row justify-end gap-3 items-center bg-white">
          <Button type="button" variant="outline" className="border-gray-200 h-8 text-sm" onClick={handleClose}>
            Cancel
          </Button>
          {!isSystem && (
            <Button type="submit" form="role-form" className="bg-blue-600 hover:bg-blue-700 h-8 text-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save & Close'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default RoleForm;
