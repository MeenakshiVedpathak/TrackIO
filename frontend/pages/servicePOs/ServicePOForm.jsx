import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Info, Building2, Network } from 'lucide-react';
import { useServicePO, useCreateServicePO, useUpdateServicePO } from '@/hooks/useServicePOs';
import { useAuth } from '@/hooks/useAuth';
import { NO_COMPANY_ROLES, ROLE_NAMES } from '@/constants/roleHierarchy';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useActiveClients } from '@/hooks/useClients';
import { useCompanies } from '@/hooks/useCompanies';
import { useProjectsByClient } from '@/hooks/useProjects';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";

// Matches the backend's create-time contract: required, 2-30 chars, uppercase alphanumeric plus
// -, _, / — the server uppercases before validating/storing, so lowercase input is fine here too.
const SERVICE_PO_CODE_PATTERN = /^[A-Z0-9_/-]{2,30}$/;
const SERVICE_PO_CODE_MESSAGE =
  'Must be 2–30 characters: letters, numbers, hyphens (-), underscores (_), or slashes (/) only.';

// PUT still leaves service_po_code optional, so the field is only required on create — same
// pattern check applies either way once something has actually been typed.
const servicePoCodeField = (required) =>
  z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .superRefine((v, ctx) => {
      if (v === '') {
        if (required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Service PO Number is required' });
        return;
      }
      if (!SERVICE_PO_CODE_PATTERN.test(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: SERVICE_PO_CODE_MESSAGE });
      }
    });

const poSchema = (isEdit, requiresBuField) => z
  .object({
    service_po_name: z
      .string()
      .min(3, 'Service PO name must be at least 3 characters')
      .max(200, 'Service PO name cannot exceed 200 characters'),
    service_po_code: servicePoCodeField(!isEdit),
    // Required for a Normal Service PO, optional for a Centralised one — the conditional check
    // (depends on is_centralised, another field in this object) lives in the superRefine below.
    // Preprocess '' -> undefined first, since z.coerce.number() would otherwise still run on the
    // empty string left behind once the field is cleared/disabled and fail .positive() on 0.
    company_id: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().positive('Business Unit is required').optional()
    ),
    client_id: z.coerce.number({ required_error: 'Client is required' }).positive('Client is required'),
    project_id: z.coerce.number({ required_error: 'Project is required' }).positive('Project is required'),
    // Delivery Head is never collected on this form — the backend sets it NULL on create, and
    // imported Service POs carry no delivery head at all, so requiring it on edit made every
    // imported row unsaveable. The value is still carried through form state (see the `po` reset
    // below) so editing a PO that already has one preserves it. Preprocess '' -> undefined, or
    // z.coerce.number() would run on '' (only undefined skips an optional check) and fail
    // .positive() on Number('') = 0, silently blocking submission.
    delivery_head_employee_id: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().positive().optional()
    ),
    service_type_id: z.coerce
      .number({ required_error: 'Service type is required' })
      .positive('Service type is required'),
    start_date: z.string().min(1, 'Start date is required'),
    // Required for a Normal Service PO, optional for a Centralised one (an ongoing PO with no
    // fixed end) — the conditional check lives in the superRefine below, alongside company_id's.
    // Preprocess '' -> undefined so a blank, optional end date doesn't fail as a non-empty string.
    end_date: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().optional()
    ),
    service_description: z.string().min(1, 'Service description is required').max(1000),
    invoice_frequency: z.string().min(1, 'Invoice frequency is required'),
    status: z.enum(['in-progress', 'completed', 'on-hold', 'pending', 'cancelled', 'closed']).default('in-progress'),
    is_centralised: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (!data.start_date || !data.end_date) return true;
      return new Date(data.end_date) >= new Date(data.start_date);
    },
    { message: 'End date must be on or after start date', path: ['end_date'] }
  )
  // Business Unit and End Date are required for a Normal Service PO but optional for a
  // Centralised one (BU-less, ongoing PO with no fixed end). Business Unit is only *asked for*
  // when the picker is actually rendered for this actor — a company-less actor (Admin/Entity
  // Admin/Platform Admin), or a BU-scoped one mapped to more than one BU (see
  // showBuScopedPicker) — so requiring it otherwise would fail validation on an invisible field
  // and make the form unsaveable; a single-BU actor's BU is filled in from the header/global
  // switcher in onSubmit instead.
  .superRefine((data, ctx) => {
    if (requiresBuField && !data.is_centralised && data.company_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Business Unit is required',
        path: ['company_id'],
      });
    }
    if (!data.is_centralised && !data.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date is required',
        path: ['end_date'],
      });
    }
  });

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const ServicePOForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: po, isPending: isLoadingPO } = useServicePO(id);
  const { hasRole, activeBuId } = useAuth();

  // Company-less actors (Admin/Entity Admin/Platform Admin) always pick a BU per Service PO,
  // from the full BU master fetched below — they have no BU of their own. A BU-scoped actor
  // (BU Admin, Service PO Admin, BU Head, ...) mapped to exactly one BU still has nothing to
  // choose — theirs comes from the X-Company-Id header/activeBuId, same as the Excel import. But
  // one mapped to MORE than one BU does need to choose which of their own BUs this PO belongs
  // to — the same rule Client/Project creation already enforce via useSelectableBusinessUnits;
  // showBuScopedPicker below closes that gap for Service PO creation.
  const isCompanyLessActor = hasRole(...NO_COMPANY_ROLES);
  const { units: mappedBusinessUnits, canFilter: hasMultipleMappedBus } = useSelectableBusinessUnits();
  const showBuScopedPicker = !isCompanyLessActor && hasMultipleMappedBus;
  // "Is Centralised" auto-maps every future Employee to this Service PO and drops its BU
  // requirement — a tenant-wide policy decision, so only Admin gets to flip it. Everyone else's
  // is_centralised stays at its `false` default; they can't toggle it on.
  const isAdmin = hasRole(ROLE_NAMES.ADMIN);
  const { data: companiesData, isPending: isLoadingCompanies } = useCompanies({ limit: 200 });
  const activeCompanies = companiesData?.data ?? [];
  // A cross-BU actor picks from the full BU master above; a multi-BU BU-scoped actor picks from
  // only their OWN mapped BUs.
  const buFieldOptions = isCompanyLessActor
    ? activeCompanies.map((c) => ({ value: String(c.id), label: c.company_name }))
    : mappedBusinessUnits.map((bu) => ({ value: String(bu.id), label: bu.name }));
  const { data: activeClients = [], isPending: isLoadingClients } = useActiveClients();
  const { data: serviceTypes = [], isPending: isLoadingTypes } = useActiveServiceTypes();
  const { data: activeCategories = [], isPending: isLoadingCategories } = useActiveServiceCategories();
  const createMutation = useCreateServicePO();
  const updateMutation = useUpdateServicePO(id);

  const [selectedCategory, setSelectedCategory] = useState('');

  const form = useForm({
    resolver: zodResolver(poSchema(isEdit, isCompanyLessActor || showBuScopedPicker)),
    defaultValues: {
      service_po_name: '',
      service_po_code: '',
      company_id: '',
      client_id: '',
      project_id: '',
      delivery_head_employee_id: '',
      service_type_id: '',
      start_date: '',
      end_date: '',
      service_description: '',
      invoice_frequency: '',
      status: 'in-progress',
      is_centralised: false,
    },
  });

  // Drives the Business Unit field's required/disabled state — a Centralised Service PO has no
  // BU (see company_id's superRefine in poSchema above).
  const isCentralised = form.watch('is_centralised');

  // Project dropdown is scoped to whichever Client is currently selected — refetches whenever
  // it changes, and is disabled until a Client is picked (see Project field below).
  const watchedClientId = form.watch('client_id');
  // Bounds the End Date picker so an end before the chosen start can't even be selected.
  const watchedStartDate = form.watch('start_date');
  const {
    data: clientProjects = [],
    isPending: isLoadingProjects,
    isError: isProjectsError,
    error: projectsError,
  } = useProjectsByClient(watchedClientId);

  useEffect(() => {
    if (po && isEdit) {
      if (serviceTypes.length > 0 && po.service_type_id) {
        const typeObj = serviceTypes.find(t => t.id === po.service_type_id);
        if (typeObj) {
          setSelectedCategory(String(typeObj.service_category_id));
        }
      }
      form.reset({
        service_po_name: po.service_po_name ?? '',
        service_po_code: po.service_po_code ?? '',
        company_id: po.company_id ?? po.company?.id ?? '',
        client_id: po.client_id ?? '',
        project_id: po.project_id ?? po.project?.id ?? '',
        delivery_head_employee_id:
          po.delivery_head_employee_id ?? po.delivery_head?.id ?? po.delivery_head_employee?.id ?? '',
        service_type_id: po.service_type_id ?? '',
        start_date: po.start_date ? po.start_date.slice(0, 10) : '',
        end_date: po.end_date ? po.end_date.slice(0, 10) : '',
        service_description: po.service_description ?? '',
        invoice_frequency: po.invoice_frequency ?? '',
        status: po.status ?? 'in-progress',
        is_centralised: po.is_centralised ?? false,
      });
    }
  }, [po, isEdit, form, serviceTypes]);

  const onSubmit = async (values) => {
    let is_billable = false;
    if (selectedCategory && activeCategories.length > 0) {
      const category = activeCategories.find((c) => String(c.id) === String(selectedCategory));
      if (category && category.name.toLowerCase() === 'billable') {
        is_billable = true;
      }
    }

    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v != null)
    );
    clean.is_billable = is_billable;

    // A multi-BU BU-scoped actor already sent their picked company_id via the field above (see
    // showBuScopedPicker) — `values.company_id` wins below as-is. A single-BU actor never saw a
    // picker, so carry their BU through explicitly instead — the one the PO already had when
    // editing, otherwise the active BU from the global switcher/header. Without this a single-BU
    // actor's field would simply drop off the payload. A Centralised PO stays BU-less.
    if (!isCompanyLessActor && !values.is_centralised) {
      const buId = values.company_id || po?.company_id || po?.company?.id || activeBuId;
      if (buId) clean.company_id = buId;
    }

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(clean, {
      onSuccess: () => {
        success(isEdit ? 'Service PO updated successfully.' : 'Service PO created successfully.');
        handleClose();
      },
      onError: (err) => {
        const message = extractApiError(err);
        // Backend has no structured field-errors array for this one — a plain {message} 400 — so
        // it's matched by its known prefix and pinned to the field instead of a generic toast.
        if (/^Service PO code /i.test(message)) {
          form.setError('service_po_code', { type: 'server', message });
        } else if (err?.response?.status === 403 && /business unit/i.test(message)) {
          // A cached mapped-BU list can outlive the mapping behind it (same handling as
          // ClientForm) — pin the resulting 403 to the field that caused it, not just a toast.
          form.setError('company_id', { type: 'server', message });
          showError(message);
        } else {
          showError(message);
        }
      },
    });
  };

  const handleClose = () => {
    navigate(ROUTES.SERVICE_POS);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoadingPO) return <FormSkeleton />;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-3xl p-0 flex flex-col bg-white overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-4 py-2.5 border-b">
          <SheetTitle className="text-base font-semibold text-left">{isEdit ? 'Edit Service PO' : 'New Service PO'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEdit && isLoadingPO ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="servicepo-form" onSubmit={form.handleSubmit(onSubmit)} className="p-4 pt-3 flex flex-col gap-4">
                {/* PO Details */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">PO Details</h3>

              {isAdmin && (
                <FormField
                  control={form.control}
                  name="is_centralised"
                  render={({ field }) => (
                    <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold text-foreground">PO Scope</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[240px]">
                                New employees are automatically mapped to a Centralised PO going
                                forward, and it does not require a Business Unit.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Centralised POs are not linked to a specific business unit.
                          </p>
                        </div>
                        <Tabs
                          value={field.value ? 'centralised' : 'project'}
                          onValueChange={(v) => {
                            const checked = v === 'centralised';
                            field.onChange(checked);
                            // Centralised has no BU and no fixed end date — clear whatever was
                            // picked so a stale value never lingers behind the now-hidden fields.
                            if (checked) {
                              form.setValue('company_id', '', { shouldValidate: true });
                              form.setValue('end_date', '', { shouldValidate: true });
                            }
                          }}
                        >
                          <TabsList className="h-9 bg-white">
                            <TabsTrigger value="project" className="gap-1.5 text-xs">
                              <Network className="h-3.5 w-3.5" /> Project PO
                            </TabsTrigger>
                            <TabsTrigger value="centralised" className="gap-1.5 text-xs">
                              <Building2 className="h-3.5 w-3.5" /> Centralised PO
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    </div>
                  )}
                />
              )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

              <FormField
                control={form.control}
                name="service_po_name"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      <span className="text-destructive">*</span> Service PO Name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Annual Support Services" className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="service_po_code"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      {!isEdit && <span className="text-destructive">*</span>} Service PO Number
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. PO-1001" className="h-8 text-sm uppercase" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      <span className="text-destructive">*</span> Client
                    </FormLabel>
                    <SearchableSelect
                      options={activeClients.map(c => ({
                        value: String(c.id),
                        label: c.client_name
                      }))}
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val ? parseInt(val, 10) : undefined);
                        // Changing Client invalidates whatever Project was picked for the
                        // previous Client — never carry it over (§3).
                        form.setValue('project_id', '');
                      }}
                      disabled={isLoadingClients}
                      placeholder="Select client"
                      searchPlaceholder="Search client..."
                      className="h-8 text-sm"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      <span className="text-destructive">*</span> Project
                    </FormLabel>
                    <SearchableSelect
                      options={clientProjects.map(p => ({
                        value: String(p.id),
                        label: p.project_name
                      }))}
                      value={field.value}
                      onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                      disabled={!watchedClientId || isLoadingProjects}
                      placeholder={watchedClientId ? 'Select project' : 'Select a client first'}
                      searchPlaceholder="Search project..."
                      emptyMessage={isProjectsError ? 'Failed to load projects.' : 'No projects found for this client.'}
                      className="h-8 text-sm"
                    />
                    {isProjectsError && (
                      <p className="text-[11px] text-destructive">
                        Couldn't load projects: {extractApiError(projectsError)}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-1">
                <FormLabel className="text-[13px]">
                  <span className="text-destructive">*</span> Service PO Category
                </FormLabel>
                  <SearchableSelect
                    options={activeCategories.map(c => ({
                      value: String(c.id),
                      label: c.name
                    }))}
                    value={selectedCategory}
                    onValueChange={(val) => {
                      setSelectedCategory(val);
                      form.setValue('service_type_id', '');
                    }}
                    disabled={isLoadingCategories}
                    placeholder="Select category"
                    searchPlaceholder="Search category..."
                    className="h-8 text-sm"
                  />
              </div>

              {(isCompanyLessActor || showBuScopedPicker) && !isCentralised && (
                <FormField
                  control={form.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> BU Name
                      </FormLabel>
                      <SearchableSelect
                        options={buFieldOptions}
                        value={field.value}
                        onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                        disabled={isCompanyLessActor && isLoadingCompanies}
                        placeholder="Select business unit"
                        searchPlaceholder="Search business unit..."
                        className="h-8 text-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="service_type_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      <span className="text-destructive">*</span> Service PO Type
                    </FormLabel>
                        <SearchableSelect
                          options={serviceTypes
                            .filter((t) => t.service_category_id === Number(selectedCategory))
                            .map(c => ({
                              value: String(c.id),
                              label: c.service_type_name
                            }))}
                          value={field.value}
                          onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                          disabled={isLoadingTypes || !selectedCategory}
                          placeholder="Select service type"
                          searchPlaceholder="Search service type..."
                          className="h-8 text-sm"
                        />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">Status</FormLabel>
                    <SearchableSelect showSearch={false}
                      options={[
                        { label: "In Progress", value: "in-progress" },
                        { label: "Completed", value: "completed" },
                        { label: "On Hold", value: "on-hold" },
                        { label: "Pending", value: "pending" },
                        { label: "Cancelled", value: "cancelled" },
                        { label: "Closed", value: "closed" }
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select status"
                      searchPlaceholder="Search status..."
                      className="h-8 text-sm w-full"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="service_description"
                render={({ field }) => (
                  <FormItem className="space-y-1 sm:col-span-2">
                    <FormLabel className="text-[13px]"><span className="text-destructive">*</span> Service PO Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the services included in this PO…"
                        rows={2}
                        maxLength={1000}
                        className="resize-none text-sm"
                        {...field}
                      />
                    </FormControl>
                    <div className="flex items-center justify-between">
                      <FormMessage />
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {(field.value ?? '').length}/1000
                      </span>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      <span className="text-destructive">*</span> Start Date
                    </FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                        className="h-8 text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isCentralised && (
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> End Date
                      </FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value || ''}
                          onChange={field.onChange}
                          min={watchedStartDate || undefined}
                          placeholder="Select date"
                          clearable
                          className="h-8 text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="invoice_frequency"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]"><span className="text-destructive">*</span> Invoice Frequency</FormLabel>
                    <SearchableSelect showSearch={false}
                      options={[
                        { label: "Monthly", value: "monthly" },
                        { label: "Milestone based", value: "milestone-based" },
                        { label: "Yearly AMC", value: "yearly-amc" },
                        { label: "Internal - No Invoice", value: "internal-no-invoice" },
                        { label: "POC", value: "poc" }
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select frequency"
                      searchPlaceholder="Search frequency..."
                      className="h-8 text-sm w-full"
                    />
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

        <SheetFooter className="px-4 py-2.5 border-t flex items-center justify-end gap-3 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting} form="servicepo-form">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Service PO'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ServicePOForm;
