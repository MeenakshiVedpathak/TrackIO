import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { useCompany, useCreateCompany, useUpdateCompany } from '@/hooks/useCompanies';
import { useActiveEntities } from '@/hooks/useEntities';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError, extractFieldErrors } from '@/services/apiClient';
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
} from '@/components/ui/sheet';

// Creating a BU only ever collects the BU shell itself — Entity, BU Code, BU Name. No admin or
// Employee data is collected here.
const createSchema = z.object({
  entity_id: z.coerce.number({ required_error: 'Entity is required' }).positive('Entity is required'),
  company_code: z.string().min(1, 'BU code is required').max(50),
  company_name: z.string().min(1, 'BU name is required').max(100),
});

const editSchema = z.object({
  company_name: z.string().min(1, 'BU name is required').max(100),
  status: z.enum(['active', 'inactive']).default('active'),
});

// Known create-mode field names — used to route a backend field-validation error (duplicate BU
// code, invalid entity, etc.) to the right input instead of a generic toast.
const CREATE_FIELD_NAMES = ['entity_id', 'company_code', 'company_name'];

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const CompanyForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const entityIdParam = searchParams.get('entity_id');
  const isEdit = !!id;
  const { success, error: showError } = useNotification();
  const { hasRole } = useAuth();

  const { data: company, isPending: isLoadingCompany } = useCompany(id);
  const {
    data: activeEntities = [],
    isPending: isLoadingEntities,
    isError: isEntitiesError,
    error: entitiesError,
  } = useActiveEntities();
  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany(id);

  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit
      ? { company_name: '', status: 'active' }
      : { entity_id: entityIdParam ?? '', company_code: '', company_name: '' },
  });

  useEffect(() => {
    if (company && isEdit) {
      form.reset({
        company_name: company.company_name ?? '',
        status: company.status ?? 'active',
      });
    }
  }, [company, isEdit, form]);

  // Surfaces a silent-failure gap: without this, a failed /entities fetch just renders the
  // dropdown empty with no indication anything went wrong.
  useEffect(() => {
    if (isEntitiesError) showError(`Failed to load entities: ${extractApiError(entitiesError)}`);
  }, [isEntitiesError, entitiesError, showError]);

  // An Entity Admin is only ever adding a BU to their own Entity — GET /entities is already
  // scoped to whatever's assigned to them, so default-select it instead of making them pick
  // from a list of one (still changeable if they hold more than one Entity).
  const didDefaultEntityRef = useRef(false);
  useEffect(() => {
    if (
      !isEdit && !entityIdParam && hasRole('Entity Admin') &&
      !isLoadingEntities && activeEntities.length > 0 && !didDefaultEntityRef.current
    ) {
      didDefaultEntityRef.current = true;
      form.setValue('entity_id', activeEntities[0].id);
    }
  }, [isEdit, entityIdParam, hasRole, isLoadingEntities, activeEntities, form]);

  // Maps a 422/409 field-validation error (duplicate BU code, invalid entity, etc.) onto the
  // specific input it belongs to. Returns whether anything matched, so the caller can fall back
  // to a form-level toast for anything it couldn't place.
  const applyFieldErrors = (err) => {
    const fieldErrors = extractFieldErrors(err);
    let matched = false;
    Object.entries(fieldErrors).forEach(([field, message]) => {
      const short = field.includes('.') ? field.split('.').pop() : field;
      if (CREATE_FIELD_NAMES.includes(short)) {
        form.setError(short, { message });
        matched = true;
      }
    });
    return matched;
  };

  const onSubmit = (values) => {
    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(values, {
      onSuccess: () => {
        success(isEdit ? 'BU updated successfully.' : 'BU created successfully.');
        handleClose();
      },
      onError: (err) => {
        if (!applyFieldErrors(err)) showError(extractApiError(err));
      },
    });
  };

  const handleClose = () => {
    navigate(ROUTES.COMPANIES);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoadingCompany) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-base font-medium text-left">
            {isEdit ? 'Edit BU' : 'Create BU'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {isEdit && isLoadingCompany ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="company-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-6">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground border-b pb-1">BU Details</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {isEdit && (
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground font-medium">BU Code</span>
                        <Input value={company?.company_code ?? ''} disabled className="h-8 text-sm border-gray-200 bg-muted/40" />
                      </div>
                    )}

                    {!isEdit && (
                      <FormField
                        control={form.control}
                        name="entity_id"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium">
                              <span className="text-destructive mr-0.5">*</span> Entity
                            </FormLabel>
                            <SearchableSelect
                              options={activeEntities.map((e) => ({
                                value: String(e.id),
                                label: e.entity_name,
                              }))}
                              value={field.value ? String(field.value) : ''}
                              onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                              disabled={isLoadingEntities || hasRole('Entity Admin')}
                              placeholder="Select entity"
                              searchPlaceholder="Search entity..."
                              emptyMessage={isEntitiesError ? 'Failed to load entities.' : 'No active entities found.'}
                              className="h-8 text-sm"
                            />
                            {isEntitiesError && (
                              <p className="text-[10px] text-destructive">
                                Couldn't load entities: {extractApiError(entitiesError)}
                              </p>
                            )}
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    )}

                    {!isEdit && (
                      <FormField
                        control={form.control}
                        name="company_code"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium">
                              <span className="text-destructive mr-0.5">*</span> BU Code
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. ACME" className="h-8 text-sm border-gray-200" {...field} />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="company_name"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">
                            <span className="text-destructive mr-0.5">*</span> BU Name
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Acme Corporation" className="h-8 text-sm border-gray-200" {...field} />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    {isEdit && (
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium mb-1">Status</FormLabel>
                            <FormControl>
                              <button
                                type="button"
                                onClick={() => field.onChange(field.value === 'active' ? 'inactive' : 'active')}
                                className={cn(
                                  'flex items-center justify-between gap-1.5 rounded-full px-2 py-1 w-[72px] transition-all duration-300 focus:outline-none',
                                  field.value === 'active' ? 'bg-blue-500 text-white flex-row' : 'bg-slate-300 text-slate-700 flex-row-reverse'
                                )}
                              >
                                <span className="text-[11px] font-medium leading-none px-0.5">
                                  {field.value === 'active' ? 'Active' : 'Inactive'}
                                </span>
                                <div className="h-3 w-3 shrink-0 rounded-full bg-white shadow-sm" />
                              </button>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    )}
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
          <Button type="submit" form="company-form" disabled={isSubmitting} size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create BU'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default CompanyForm;
