import { useEffect, useRef, useState } from 'react';
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
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { BusinessUnitCascadeSelect, SubBusinessUnitSelect, useBuHierarchy } from '@/components/common/BusinessUnitCascadeSelect';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Label } from '@/components/ui/label';
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
  // Required of a BU-scoped login mapped to more than one BU; optional for a cross-BU login, who
  // only fills it after opting into the Entity -> BU cascade — see showBuSelector below.
  // Always the ROOT BU's id — a Sub-BU pick lives in sub_business_unit_id instead, so the Client
  // list scoping that keys off this field never waits on the separately mandatory Sub-BU choice.
  company_id: z.string().optional(),
  // UI-only grouping field, never sent to the backend as-is (see onSubmit) — required only when
  // the picked root BU actually has Sub-BUs (checked at submit time against the live hierarchy).
  sub_business_unit_id: z.string().optional(),
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

  // Same rule as ClientForm: only a BU-scoped login mapped to MORE THAN ONE BU was originally
  // asked, because only they had a choice to make.
  //   cross-BU login (Admin/Entity Admin/Platform Admin) -> OPTIONAL Entity -> BU -> Sub-BU
  //       cascade (added on request — previously no selector at all; the BU was always inherited
  //       from the chosen Client). Leaving it unpicked still inherits the BU from the Client
  //       exactly as before; this only adds the ABILITY to pick one explicitly first.
  //   BU-scoped, 1 BU                                    -> no selector; nothing to choose, and
  //       the X-Company-Id header already says which BU.
  //   BU-scoped, >1 BU, all under the same Entity         -> REQUIRED BU selector only — nothing
  //       to narrow by Entity, so the flat list stays exactly as it was.
  //   BU-scoped, >1 BU spanning more than one Entity      -> the Entity step appears too (still
  //       optional to render, but the BU field underneath it stays REQUIRED once shown — see
  //       `showEntitySelector`/`canFilterEntity` below); their explicit pick is authoritative and
  //       the Client lookup below is skipped entirely.
  //
  // `entityId` is local state, not an RHF field — it only narrows which root BUs
  // useSelectableBusinessUnits returns below; a Project has no entity_id of its own.
  const [entityId, setEntityId] = useState(undefined);
  const [entityError, setEntityError] = useState('');
  // Guards the one-time edit-mode pre-fill effect below from re-firing (and stomping the user's own
  // Entity/BU/Sub-BU picks) every time `units` changes reference because the user picked a different
  // Entity — `units` depends on `entityId`, which that effect itself sets, so without this guard it
  // would re-resolve from the record's ORIGINAL company_id on every Entity change instead of once.
  const initializedForProjectIdRef = useRef(null);
  const { isCrossBu, canFilter, units } = useSelectableBusinessUnits(entityId);
  const { entities, canFilter: canFilterEntity } = useSelectableEntities();
  // A cross-BU login always gets the Entity step when it can see at least one Entity — picking one
  // is how it opts IN to assigning a BU, so skipping the step must not force a BU field open.
  const showEntitySelector = isCrossBu ? entities.length > 0 : canFilterEntity;
  // Cross-BU: BU only once an Entity is picked (optional — no Entity means BU inherited from Client).
  // BU-scoped: BU straight away when their BUs share one Entity; otherwise only after the Entity pick.
  const showBuSelector = isCrossBu
    ? (canFilter && !!entityId)
    : (canFilter && (!showEntitySelector || !!entityId));
  // A cross-BU login (Admin/Entity Admin/Platform Admin) never picks a BU on create — their own
  // Projects are always BU-less — but an EXISTING Project they're now editing can already carry a
  // BU (assigned by whoever actually created it, a BU-scoped Admin/PM). That BU shouldn't become
  // invisible/unreassignable just because this login type isn't normally asked for one — so the
  // field reappears, pre-filled, whenever the record being edited already has one.
  const showBuField = showBuSelector || (isCrossBu && isEdit && project?.company_id != null);
  const showEntityField = showEntitySelector || (isCrossBu && isEdit && project?.company_id != null);
  const { childrenOf } = useBuHierarchy(units);

  const form = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      client_id: '',
      project_name: '',
      project_description: '',
      status: 'active',
      company_id: '',
      sub_business_unit_id: '',
    },
  });

  // The Client list is scoped to whichever BU is currently the MOST SPECIFIC one picked — once a
  // Sub-BU is selected, that's what actually gets sent as the Project's own company_id (see
  // onSubmit), and a Client can itself belong to a Sub-BU specifically rather than its Parent, so
  // scoping the list to the root alone would both hide such a Client and mismatch the request's
  // own company_id (backend resolves the client WITHIN that id, so a mismatch there fails with
  // "Client not found"). Never GATED on the Sub-BU pick being made, though — Client loading starts
  // as soon as a root BU is chosen (the Sub-BU field is only asked for once options exist and is
  // mandatory when it is, but nothing here should sit disabled waiting on it); it simply re-scopes
  // once a Sub-BU is added on top of the root, the same way it already re-scopes on a root change.
  const selectedBuId = form.watch('company_id');
  const selectedSubBuId = form.watch('sub_business_unit_id');
  const effectiveBuId = selectedSubBuId || selectedBuId;
  const { data: scopedClients, isPending: isLoadingScopedClients } = useClients(
    { buId: effectiveBuId, status: 'active', limit: 200 },
    { enabled: showBuField && !!effectiveBuId }
  );

  const clientOptions = (showBuField ? (scopedClients?.data ?? []) : activeClients)
    .map((c) => ({ value: String(c.id), label: c.client_name }));
  const clientsLoading = showBuField ? isLoadingScopedClients : isLoadingClients;
  const clientDisabled = showBuField ? (!effectiveBuId || clientsLoading) : clientsLoading;

  // The selected root BU's own Sub-BUs — recomputed live, never off a snapshot, so switching
  // roots immediately shows (or hides) the right Sub-BU list.
  const subBuOptions = childrenOf(selectedBuId).map((u) => ({ value: String(u.id), label: u.name }));
  const showSubBuField = showBuField && subBuOptions.length > 0;

  useEffect(() => {
    // Only runs ONCE per loaded record (keyed on project.id) to do the initial pre-fill — not on
    // every later change, since `units` narrows to whichever Entity is currently selected and this
    // same effect calls setEntityId, which would otherwise re-run it and overwrite the user's own
    // Entity/BU/Sub-BU/Client picks with the record's ORIGINAL saved values on every Entity change.
    // Also waits for `units` to actually be loaded (non-empty) so it doesn't lock in a wrong/empty
    // resolution before the BU master has finished fetching.
    if (project && isEdit && units.length > 0 && initializedForProjectIdRef.current !== project.id) {
      // The project's saved company_id can itself be a Sub-BU's id — resolve which root it
      // belongs to so the form reopens with BOTH dropdowns correctly pre-populated.
      const currentUnit = project.company_id ? units.find((u) => String(u.id) === String(project.company_id)) : null;
      const isSubBu = currentUnit?.parentId != null;
      // Pre-select the Entity too, so a cross-BU login editing a Project that already has a BU
      // sees the whole Entity -> BU -> Sub-BU chain correctly populated.
      setEntityId(currentUnit?.entityId != null ? String(currentUnit.entityId) : undefined);
      form.reset({
        client_id: project.client_id ?? project.client?.id ?? '',
        project_name: project.project_name ?? '',
        project_description: project.project_description ?? '',
        status: project.status ?? 'active',
        company_id: project.company_id
          ? String(isSubBu ? currentUnit.parentId : project.company_id)
          : '',
        sub_business_unit_id: isSubBu ? String(project.company_id) : '',
      });
      initializedForProjectIdRef.current = project.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isEdit, form, units]);

  // The backend requires company_id (Business Unit) on create but a Project has no BU field of
  // its own. Where it comes from depends on whether the login was asked:
  //   · asked (BU-scoped, >1 BU)  -> their explicit pick wins, and the Client lookup is skipped.
  //   · not asked                 -> inherited from the selected Client's own record, as before.
  // Deriving it from the Client silently produces NOTHING when that Client is itself BU-less
  // (which is every client a cross-BU login creates), leaving the backend to fall back to the
  // globally-active X-Company-Id — for a multi-BU login that is a coin flip between their BUs,
  // which is why they are now asked outright.
  const onSubmit = async (values) => {
    // A BU-scoped login whose BUs span several Entities has its (still required) BU field hidden
    // until an Entity is picked — surface the error on the Entity so they can't save without a BU.
    if (!isCrossBu && showEntitySelector && !entityId) {
      setEntityError('Entity is required.');
      return;
    }
    if (showBuField && !values.company_id) {
      form.setError('company_id', { message: 'Business Unit is required.' });
      return;
    }
    // The picked root BU has Sub-BUs — picking one of them is mandatory once they exist.
    if (showSubBuField && !values.sub_business_unit_id) {
      form.setError('sub_business_unit_id', { message: 'Sub Business Unit is required.' });
      return;
    }

    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v != null)
    );

    if (showBuField) {
      // A chosen Sub-BU overrides the root — the backend only ever sees ONE BU id, whichever is
      // the most specific one actually picked.
      clean.company_id = Number(clean.sub_business_unit_id || clean.company_id);
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
    delete clean.sub_business_unit_id;

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
          form.setError(showSubBuField ? 'sub_business_unit_id' : 'company_id', { message });
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
                    {/* Entity selector — for any actor whose selectable BUs span more than one
                        Entity (cross-BU logins via GET /entities, or a BU-scoped login whose own
                        BU mapping itself spans more than one Entity — see useSelectableEntities).
                        Local state, not an RHF field: a Project has no entity_id of its own, this
                        purely narrows the BU cascade below. For a cross-BU login, leaving it
                        unpicked (the default) keeps inheriting the BU from the selected Client,
                        exactly as before this cascade existed; for a BU-scoped login the BU field
                        below stays required regardless. */}
                    {showEntityField && (
                      <div className="flex flex-col gap-1 space-y-1">
                        <Label className="text-[11px] text-muted-foreground font-medium">
                          {!isCrossBu && <span className="text-destructive mr-0.5">*</span>} Entity
                        </Label>
                        <SearchableSelect
                          options={entities.map((e) => ({ value: String(e.id), label: e.name }))}
                          value={entityId ?? ''}
                          onValueChange={(val) => {
                            setEntityId(val || undefined);
                            setEntityError('');
                            // A different Entity's BUs are a different set — never leave a BU/
                            // Sub-BU/Client from the PREVIOUS Entity silently selected.
                            form.setValue('company_id', '');
                            form.setValue('sub_business_unit_id', '');
                            form.setValue('client_id', '');
                            form.clearErrors(['company_id', 'sub_business_unit_id']);
                          }}
                          placeholder={isCrossBu ? 'Select entity (optional)' : 'Select entity'}
                          searchPlaceholder="Search entity..."
                          className="h-8 text-sm w-full"
                        />
                        {entityError && <p className="text-[10px] font-medium text-destructive">{entityError}</p>}
                      </div>
                    )}

                    {/* BU selector — for BU-scoped logins with more than one BU (narrowed by the
                        Entity above once their BUs span more than one Entity), or a cross-BU
                        login that has picked an Entity above. Everyone else inherits the BU from
                        the selected Client (see onSubmit). */}
                    {showBuField && (
                      <FormField
                        control={form.control}
                        name="company_id"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium">
                              <span className="text-destructive mr-0.5">*</span> Business Unit
                            </FormLabel>
                            <FormControl>
                              <BusinessUnitCascadeSelect
                                units={units}
                                value={field.value}
                                onValueChange={(val) => {
                                  field.onChange(val);
                                  // A different root's own Sub-BUs are a different set — never
                                  // leave a Sub-BU id from the PREVIOUS root silently selected.
                                  form.setValue('sub_business_unit_id', '');
                                  form.clearErrors('sub_business_unit_id');
                                  // Changing BU invalidates whatever Client was picked under the
                                  // previous one (the scoped list below is about to change too).
                                  form.setValue('client_id', '');
                                }}
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

                    {/* Mandatory, not optional, once the picked BU actually has Sub-BUs — its own
                        sibling field so it renders in its own slot rather than stretching the BU
                        field's own layout. */}
                    {showSubBuField && (
                      <FormField
                        control={form.control}
                        name="sub_business_unit_id"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium">
                              <span className="text-destructive mr-0.5">*</span> Sub Business Unit
                            </FormLabel>
                            <FormControl>
                              <SubBusinessUnitSelect
                                options={subBuOptions}
                                value={field.value}
                                onValueChange={(val) => {
                                  field.onChange(val);
                                  // The Sub-BU is the most specific BU the Client list now scopes
                                  // to (see effectiveBuId) — whatever Client was picked under the
                                  // root alone (or a different Sub-BU) doesn't necessarily belong
                                  // to this one, so it can't carry over unchecked.
                                  form.setValue('client_id', '');
                                }}
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
                            options={clientOptions}
                            value={field.value}
                            onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                            disabled={clientDisabled}
                            placeholder={showBuField && !effectiveBuId ? 'Select a business unit first' : 'Select client'}
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
