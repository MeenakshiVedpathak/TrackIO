import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Info, Building2, Network } from 'lucide-react';
import { useServicePO, useCreateServicePO, useUpdateServicePO } from '@/hooks/useServicePOs';
import { useAuth } from '@/hooks/useAuth';
import { NO_COMPANY_ROLES, ROLE_NAMES } from '@/constants/roleHierarchy';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { BusinessUnitCascadeSelect, SubBusinessUnitSelect, useBuHierarchy } from '@/components/common/BusinessUnitCascadeSelect';
import { useActiveClients, useClients } from '@/hooks/useClients';
import { useCompanies } from '@/hooks/useCompanies';
import { useActiveEntities } from '@/hooks/useEntities';
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

const poSchema = (isEdit, requiresBuField, requiresEntityField) => z
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
    // UI-only grouping field for company-less actors (Entity selector) — narrows which BUs the
    // BU Name dropdown offers. Never sent to the backend (stripped in onSubmit); optional here
    // because an entity-less tenant / BU-less actor simply has nothing to pick. Required for a
    // company-less actor on a Normal Service PO (the requiresEntityField superRefine below) —
    // same conditional pattern as company_id.
    entity_id: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().positive().optional()
    ),
    company_id: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().positive('Business Unit is required').optional()
    ),
    // UI-only grouping field, never sent to the backend as-is (see onSubmit) — required only when
    // the picked root BU actually has Sub-BUs, checked at submit time against the live hierarchy
    // rather than encoded here (a static zod rule can't see the BU master's live parent/child
    // shape).
    sub_business_unit_id: z.string().optional(),
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
    // UI-only flag — never sent to the backend (stripped in onSubmit). Set when the actor picks
    // "My Clients" in the BU Name dropdown: the PO stays a normal (non-Centralised) Project PO,
    // but the client attached to it has no BU of its own, so company_id has nothing valid to hold
    // and the superRefine below must not demand one just because this is otherwise a Project PO.
    is_my_clients: z.boolean().default(false),
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
    // Entity same as Business Unit: required for a Normal Service PO only, and only when the
    // picker is actually rendered for this actor (a company-less one). Skipped for a Centralised
    // PO and for "My Clients" (BU-less client, so no BU → nothing to group under either).
    if (requiresEntityField && !data.is_centralised && !data.is_my_clients && data.entity_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Entity is required',
        path: ['entity_id'],
      });
    }
    if (requiresBuField && !data.is_centralised && !data.is_my_clients && data.company_id == null) {
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

// Sentinel row added to the BU Name dropdown (company-less actors only — see buUnits/extraOptions
// below) so picking "My Clients" there is intercepted before it's ever treated as a real BU id; it
// clears company_id instead and switches the Client field below to that actor's BU-less clients.
const MY_CLIENTS_BU_VALUE = '__my_clients__';

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

  // A PO's Client/Project can each be BU-less ("My Clients (No Business Unit)" was used to create
  // them) even while the PO ITSELF has a real saved BU (`po.company`) — the two are independent.
  // On edit this matters because the Client dropdown is normally scoped to the PO's own BU
  // (scopedClients below), and a BU-less client was never assigned to that BU, so it wouldn't be
  // in that scoped list at all — see clientSourceList's poClientIsBuLess branch below. Declared
  // this early (right after `po`/`isEdit`) since it's read by the Client-list hooks/memos further
  // down, before poEntityId or the other po-derived values are computed.
  const poClientIsBuLess = isEdit && !!po?.client && po.client.company_id == null;

  // Company-less actors (Admin/Entity Admin/Platform Admin) always pick a BU per Service PO,
  // from the full BU master fetched below — they have no BU of their own. A BU-scoped actor
  // (BU Admin, Project Manager, ...) mapped to exactly one BU still has nothing to choose —
  // theirs comes from the X-Company-Id header/activeBuId, same as the Excel import. But one
  // mapped to MORE than one BU does need to choose which of their own BUs this PO belongs to —
  // the same rule Client/Project creation already enforce via useSelectableBusinessUnits;
  // showBuScopedPicker below closes that gap for Service PO creation.
  const isCompanyLessActor = hasRole(...NO_COMPANY_ROLES);
  const { units: mappedBusinessUnits, canFilter: hasMultipleMappedBus, isLoading: isLoadingMappedBus } = useSelectableBusinessUnits();
  const showBuScopedPicker = !isCompanyLessActor && hasMultipleMappedBus;
  // Entity selector for a BU-scoped actor (BU Admin, BU Head, ...) mapped to more than one BU —
  // useSelectableEntities already computes, for THIS actor type, the distinct Entities behind their
  // own mapped businessUnits[] (deduplicated), and its own canFilter is already "entities.length > 1"
  // — true only when those BUs genuinely span more than one Entity. When all their BUs share one
  // Entity there is nothing to narrow by, and the flat BU dropdown below (today's existing behavior)
  // stays exactly as-is. For a company-less actor this same hook mirrors useActiveEntities (its
  // isCrossBu branch), but that actor's Entity step is shown unconditionally regardless of
  // canFilterEntity (see showEntityField below) — same as before this change.
  const { entities: selectableEntities, canFilter: canFilterEntity } = useSelectableEntities();
  // "Is Centralised" auto-maps every future Employee to this Service PO and drops its BU
  // requirement — a tenant-wide policy decision, so only Admin (and Platform Admin, above it in
  // the role hierarchy) gets to flip it. Everyone else's is_centralised stays at its `false`
  // default; they can't toggle it on. hasRole() is an exact match, not hierarchy-aware, so
  // Platform Admin has to be listed explicitly or it fails this check despite outranking Admin.
  const isAdmin = hasRole(ROLE_NAMES.PLATFORM_ADMIN, ROLE_NAMES.ADMIN);
  const { data: companiesData, isPending: isLoadingCompanies } = useCompanies({ limit: 200 });
  const activeCompanies = companiesData?.data ?? [];
  // Entity options for company-less actors (Admin/Entity Admin/Platform Admin) — a BU-scoped
  // multi-Entity actor's options come from selectableEntities above instead. This is
  // the exact mirror of the Entity filter that gates BU scoping in the rest of the project
  // (see useEntities.js's comments: GET /entities is already scoped server-side to the actor —
  // an Entity Admin sees only their Entities, Admin/Platform Admin see all). Picking one narrows
  // the BU Name options below to that Entity's BUs, same Entity → BU cascade used everywhere else.
  const { data: activeEntities = [], isPending: isLoadingEntities } = useActiveEntities({
    enabled: isCompanyLessActor,
  });
  // A cross-BU actor picks from the full BU master above; a multi-BU BU-scoped actor picks from
  // only their OWN mapped BUs. The "My Clients" row is prepended only for the company-less actor
  // — a BU-scoped actor's clients always belong to one of their own BUs (see ClientForm.jsx), so
  // there's no BU-less case for them to surface here.
  const { data: activeClients = [], isPending: isLoadingClients } = useActiveClients();
  const { data: serviceTypes = [], isPending: isLoadingTypes } = useActiveServiceTypes();
  const { data: activeCategories = [], isPending: isLoadingCategories } = useActiveServiceCategories();
  const createMutation = useCreateServicePO();
  const updateMutation = useUpdateServicePO(id);

  const [selectedCategory, setSelectedCategory] = useState('');

  const form = useForm({
    // Entity is also required for a BU-scoped actor whose BUs span several Entities: their (required)
    // BU field stays hidden until an Entity is picked, so without this the BU error would attach to
    // a field that isn't rendered and Save would silently do nothing.
    resolver: zodResolver(poSchema(
      isEdit,
      isCompanyLessActor || showBuScopedPicker,
      isCompanyLessActor || (showBuScopedPicker && canFilterEntity),
    )),
    defaultValues: {
      service_po_name: '',
      service_po_code: '',
      entity_id: '',
      company_id: '',
      sub_business_unit_id: '',
      client_id: '',
      project_id: '',
      delivery_head_employee_id: '',
      service_type_id: '',
      start_date: '',
      end_date: '',
      service_description: '',
      invoice_frequency: '',
      is_my_clients: false,
      status: 'in-progress',
      is_centralised: false,
    },
  });

  // Drives the Business Unit field's required/disabled state — a Centralised Service PO has no
  // BU (see company_id's superRefine in poSchema above).
  const isCentralised = form.watch('is_centralised');
  // "My Clients" — Admin/Entity Admin/Platform Admin only (§ isCompanyLessActor below covers the
  // exact same role set). Set via the "My Clients (No Business Unit)" row given to the BU Name
  // field as an extraOptions entry (see buUnits/MY_CLIENTS_BU_VALUE below), it surfaces clients
  // THEY created directly with no Business Unit at all — ClientForm never even shows a BU picker to
  // these roles, so their clients are always saved BU-less by design (see ClientForm.jsx). A real
  // form field (not local component state) so poSchema's superRefine can see it and skip
  // requiring company_id for this specific case — same pattern as is_centralised above.
  const myClientsOnly = form.watch('is_my_clients');

  // Entity Name — shown only to company-less actors (Admin/Entity Admin/Platform Admin), the same
  // Entity selector that gates BU scoping everywhere else in the project (see useActiveEntities:
  // GET /entities is already scoped server-side, so an Entity Admin sees only their Entities).
  // Picking one narrows the BU Name options below to that Entity's BUs (selectedEntityId), so the
  // two fields can never disagree. Entity is a UI-only grouping step — the backend authorizes a
  // Service PO via company_id, never entity_id, so nothing is sent for it (see the strip in
  // onSubmit). Mirrors EntityFilter/useSelectableBusinessUnits(entityId)'s Entity → BU cascade.
  const selectedEntityId = form.watch('entity_id');
  // For a company-less actor the BU list is narrowed to the Entity picked in the Entity Name
  // selector above (± selectedEntityId set); "My Clients (No Business Unit)" is offered
  // separately as the BU field's `extraOptions` below, not mixed into this hierarchy-bearing
  // list. Normalized to { id, name, parentId } either way so BusinessUnitCascadeSelect can offer
  // top-level BUs first and reveal a Sub-BU only once its own Parent is picked, instead of every
  // Sub-BU appearing as just another flat row alongside top-level BUs the moment it's created.
  // Memoized — this feeds the po-edit-reset effect below by reference; a plain recomputed-every-
  // render array here made that effect's own `buUnits` dependency look "changed" on every render
  // (new array, same contents), which re-ran form.reset() in a loop for a company-less actor
  // editing a PO (isCrossBu's mappedBusinessUnits branch was already stable via its own useMemo
  // inside useSelectableBusinessUnits — only this branch was the culprit).
  // BU-scoped branch: when this actor's own mapped BUs span more than one Entity
  // (canFilterEntity) and an Entity has actually been picked, narrow mappedBusinessUnits down to
  // just that Entity's units (mappedBusinessUnits items already carry their own `entityId`, per
  // useSelectableBusinessUnits' normalized shape). Otherwise — no Entity picked yet, or this
  // actor's BUs are all under one Entity (canFilterEntity false) — fall back to the unfiltered
  // mappedBusinessUnits exactly as before this change.
  const buUnits = useMemo(() => (
    isCompanyLessActor
      ? activeCompanies
          .filter(
            (c) =>
              !selectedEntityId ||
              String(c.entity_id ?? c.entity?.id) === String(selectedEntityId)
          )
          .map((c) => ({ id: c.id, name: c.company_name, parentId: c.parent_business_unit_id ?? null }))
      : (canFilterEntity && selectedEntityId
          ? mappedBusinessUnits.filter((u) => String(u.entityId) === String(selectedEntityId))
          : mappedBusinessUnits)
  ), [isCompanyLessActor, activeCompanies, selectedEntityId, mappedBusinessUnits, canFilterEntity]);
  const { childrenOf } = useBuHierarchy(buUnits);

  // The Client list must be scoped to the chosen BU whenever the BU field is shown (company-less
  // actor or a multi-BU BU-scoped one) — same rule Project create enforces. The backend resolves
  // the client WITHIN the company_id sent on the request, so offering clients from outside the
  // picked BU lets the two fields disagree and the create fails with "Client not found." Held
  // until a BU is picked — there is nothing sensible to list before then.
  // `&& !isCentralised` matters here independently of the BU field's own render condition below:
  // a Centralised PO hides that field for EVERY actor (it's BU-less by design — "not linked to a
  // specific business unit"), but without this, a multi-BU/company-less actor who flips the
  // Centralised toggle still had this flag stuck `true` from `isCompanyLessActor`/
  // `showBuScopedPicker` alone — scoping Client to a `company_id` that no field exists to ever
  // set, so the dropdown stayed permanently disabled on "Select a business unit first" with no
  // way to pick a Client at all. Falling back to the unfiltered `activeClients` list instead is
  // correct here: Centralised POs reach across every BU on purpose, so there's no "wrong BU"
  // mismatch for the backend to reject in the first place.
  // Entity step: always shown for a company-less actor (unchanged), and now ALSO shown for a
  // BU-scoped actor whose own mapped BUs span more than one Entity (canFilterEntity) — see
  // useSelectableEntities above.
  const showEntityField = (isCompanyLessActor || canFilterEntity) && !isCentralised;
  // BU field: unchanged for a company-less actor (never gated on an Entity pick — Entity there is
  // optional, see poSchema). For a BU-scoped actor, "Entity first, then BU" only when the new
  // Entity step is actually showing for them (canFilterEntity true) — otherwise (their BUs are all
  // one Entity) the flat BU dropdown appears exactly as before, with no Entity step to wait on.
  const showBuField =
    (isCompanyLessActor || showBuScopedPicker) &&
    !isCentralised &&
    (isCompanyLessActor || !canFilterEntity || !!selectedEntityId);
  const selectedBuId = form.watch('company_id');
  // The Client list is scoped to whichever BU is currently the MOST SPECIFIC one picked — once a
  // Sub-BU is selected, that's what actually gets sent as the PO's own company_id (see onSubmit
  // below), and a Client can itself belong to a Sub-BU specifically rather than its Parent, so
  // scoping to the root alone would both hide such a Client and mismatch the request's own
  // company_id (the backend resolves the client WITHIN that id, so a mismatch fails with "Client
  // not found"). Never GATED on the Sub-BU pick being made, though (see the effectiveBuId fallback
  // to the root alone) — Client loading still starts as soon as a root BU is chosen, then simply
  // re-scopes/refetches once a Sub-BU is added on top, the same way it already re-scopes on a root
  // change.
  const selectedSubBuId = form.watch('sub_business_unit_id');
  const effectiveBuId = selectedSubBuId || selectedBuId;
  const { data: scopedClients, isPending: isLoadingScopedClients } = useClients(
    { buId: effectiveBuId, status: 'active', limit: 200 },
    { enabled: showBuField && !!effectiveBuId }
  );
  // Same GET /clients endpoint as scopedClients above, just with no buId — clients.api.js's own
  // comment documents that as "all clients (their own BU-less + every BU)" for this actor. Fetched
  // for the "My Clients" toggle as before, and ALSO whenever editing a PO whose already-saved
  // Client is itself BU-less (poClientIsBuLess) — that client needs to come from this same
  // unscoped list, since it was never assigned to the PO's own BU and so won't appear in
  // scopedClients below.
  const { data: allClientsForMyClients, isPending: isLoadingMyClients } = useClients(
    // no_business_unit: the backend returns only THIS actor's BU-less clients — filtering them out
    // of a 200-row page client-side dropped newly created ones once there were many clients.
    { status: 'active', limit: 200, no_business_unit: true },
    { enabled: isCompanyLessActor && (myClientsOnly || poClientIsBuLess) }
  );
  const myClients = (allClientsForMyClients?.data ?? []).filter((c) => !c.company_id);

  // The picked root BU's own Sub-BUs — recomputed live off `selectedBuId`, never off a snapshot.
  // Client loading is never GATED on this separately mandatory pick (it already starts once the
  // root alone is chosen — see effectiveBuId above), but once a Sub-BU IS picked, the Client list
  // does re-scope to it.
  const subBuOptions = childrenOf(selectedBuId).map((u) => ({ value: String(u.id), label: u.name }));
  const showSubBuField = showBuField && !myClientsOnly && subBuOptions.length > 0;

  // On edit, a PO with a BU-less Client is scoped to its own BU (scopedClients) same as any other
  // PO — but that BU-less client itself needs to be added back in from the unscoped `myClients`
  // list, or it simply isn't among scopedClients' options at all. De-duped by id (a client that's
  // somehow in both lists — shouldn't happen, but harmless either way — must not render twice).
  const clientSourceList = myClientsOnly
    ? myClients
    : showBuField
    ? (() => {
        const base = scopedClients?.data ?? [];
        if (!poClientIsBuLess) return base;
        const seen = new Set(base.map((c) => c.id));
        return [...base, ...myClients.filter((c) => !seen.has(c.id))];
      })()
    : activeClients;
  // Safety net: the PO's currently-saved Client must always be selectable and visibly labeled,
  // even in the (should-be-impossible-now, but cheap to guard) case it's still missing from
  // clientSourceList above for some other reason — an option-less selected value renders as a
  // blank/placeholder in SearchableSelect instead of the client's actual name.
  const clientOptions = (() => {
    const opts = clientSourceList.map((c) => ({ value: String(c.id), label: c.client_name }));
    if (isEdit && po?.client && !opts.some((o) => o.value === String(po.client.id))) {
      opts.push({ value: String(po.client.id), label: po.client.client_name });
    }
    return opts;
  })();
  const clientsLoading = myClientsOnly
    ? isLoadingMyClients
    : showBuField
    ? isLoadingScopedClients || (poClientIsBuLess && isLoadingMyClients)
    : isLoadingClients;
  // Client is never gated on a BU pick while myClientsOnly is on — these clients have no BU to
  // wait for (see the BU Name field below, where picking "My Clients" clears company_id
  // entirely rather than setting a real BU id).
  const clientDisabled = myClientsOnly ? clientsLoading : (showBuField ? (!effectiveBuId || clientsLoading) : clientsLoading);

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
  // Same safety net as clientOptions above, one level down: the PO's saved Project must stay
  // selectable/labeled even if useProjectsByClient's own list (scoped to whatever Client id is
  // CURRENTLY watched) hasn't included it yet — e.g. the instant after reset sets client_id, before
  // this query has refetched for that client.
  const projectOptions = useMemo(() => {
    const opts = clientProjects.map((p) => ({ value: String(p.id), label: p.project_name }));
    if (isEdit && po?.project && !opts.some((o) => o.value === String(po.project.id))) {
      opts.push({ value: String(po.project.id), label: po.project.project_name });
    }
    return opts;
  }, [clientProjects, isEdit, po]);

  // Restore for the Entity selector on edit — GET /service-pos/:id now embeds the PO's own BU as
  // `po.company` (including its `entity` relation), so that's the primary, always-current source
  // for which Entity to prefill; the company master (activeCompanies) lookup is kept only as a
  // fallback for the (now rare) case that relation isn't embedded.
  const poEntityId = useMemo(() => {
    if (!po) return '';
    const poCompany = po.company_id ?? po.company?.id;
    return (
      po.company?.entity?.id ??
      po.company?.entity_id ??
      po.entity_id ??
      activeCompanies.find((c) => String(c.id) === String(poCompany))?.entity_id ??
      activeCompanies.find((c) => String(c.id) === String(poCompany))?.entity?.id ??
      ''
    );
  }, [po, activeCompanies]);

  // Split from the form.reset effect below on purpose — serviceTypes can finish loading AFTER po
  // does, so this needs to react to it independently; it only ever touches local component state
  // (selectedCategory), never the form itself, so re-running it repeatedly is harmless.
  useEffect(() => {
    if (po && isEdit && serviceTypes.length > 0 && po.service_type_id) {
      const typeObj = serviceTypes.find((t) => t.id === po.service_type_id);
      if (typeObj) {
        setSelectedCategory(String(typeObj.service_category_id));
      }
    }
  }, [po, isEdit, serviceTypes]);

  // Guarded to fire exactly ONCE per PO id being edited (resetForPoIdRef), not on every render
  // that happens to give `po`/`buUnits` a new reference — `buUnits` depends on `activeCompanies`
  // (GET /companies), which React Query silently refetches on window refocus, and an unguarded
  // effect here would re-run form.reset() on that refetch and snap every field — including
  // whatever the user had just changed and not yet saved (e.g. a different Sub BU pick) — straight
  // back to the ORIGINALLY loaded PO's values with no visible warning. That's the exact "I changed
  // the Sub BU, saved, and it's still not updated" bug: the user's edit was silently reverted by a
  // background refetch before Save was ever clicked.
  //
  // `buUnitsReady` guards a SECOND, subtler race the "fire once" fix above introduced: for a
  // company-less actor, `buUnits` is built from GET /companies (activeCompanies), a separate query
  // from GET /service-pos/:id (po) — if `po` happens to resolve first, this effect used to fire
  // with `buUnits` still `[]`, so `poCompanyUnit` was never found, `poIsSubBu` came out `false` no
  // matter what, and a PO whose BU actually WAS a Sub-BU got miscategorized as a root BU on that
  // one and only run — permanently for this mount, since the ref above stops it from ever
  // re-checking once activeCompanies finally loads. Confirmed live: editing a PO whose BU is a
  // Sub-BU intermittently reopened showing the OLD Sub-BU again after a successful save, because
  // the save itself round-tripped through this same misdetection. Waiting for the relevant
  // "still loading" flag (not just "the list is non-empty", which can't tell apart from "still
  // loading" from "genuinely empty tenant") before allowing the one-time reset to run and mark the
  // ref fixes it — `isLoadingCompanies` for a company-less actor (whose buUnits comes straight from
  // activeCompanies), `isLoadingMappedBus` for a BU-scoped one (whose buUnits/mappedBusinessUnits
  // comes from useSelectableBusinessUnits, which enriches the login's own BU mapping with
  // entity/parent info from ITS OWN internal, separately-loading company-master fetch).
  const buUnitsReady = isCompanyLessActor ? !isLoadingCompanies : !isLoadingMappedBus;
  const resetForPoIdRef = useRef(null);
  useEffect(() => {
    if (po && isEdit && buUnitsReady && resetForPoIdRef.current !== po.id) {
      resetForPoIdRef.current = po.id;
      // The PO's saved company_id can itself be a Sub-BU's id — resolve which root it belongs to
      // so the form reopens with BOTH dropdowns correctly pre-populated (root BU, and that Sub-BU
      // already selected under it) instead of the flat id sitting in company_id with no root
      // chosen to ever reveal the Sub-BU dropdown at all.
      const poCompanyId = po.company_id ?? po.company?.id;
      const poCompanyUnit = poCompanyId ? buUnits.find((u) => String(u.id) === String(poCompanyId)) : null;
      const poIsSubBu = poCompanyUnit?.parentId != null;
      // A "My Clients (No Business Unit)" PO — created by a company-less actor (Admin/Entity
      // Admin/Platform Admin) with a BU-less Client and no BU of its own on the PO. Distinct from
      // just "this PO's Client happens to be BU-less" (poClientIsBuLess alone, used above to widen
      // the Client options list) — a PO CAN have a real BU while its Client is BU-less (an older
      // PO created before this became a hard rule), and that case must keep resolving to its own
      // real BU below, not "My Clients". Only when the PO ITSELF has no BU (po.company_id == null)
      // AND its Client is BU-less does this actually mean "My Clients" was used to create it.
      const poIsMyClients = isCompanyLessActor && !po.is_centralised && po.company_id == null && poClientIsBuLess;
      form.reset({
        service_po_name: po.service_po_name ?? '',
        service_po_code: po.service_po_code ?? '',
        // "My Clients" has no Entity/BU/Sub-BU to prefill — same empty state Create is in right
        // after picking "My Clients (No Business Unit)" from the BU Name dropdown.
        entity_id: poIsMyClients ? '' : poEntityId,
        company_id: poIsMyClients ? '' : (poCompanyId ? String(poIsSubBu ? poCompanyUnit.parentId : poCompanyId) : ''),
        sub_business_unit_id: poIsMyClients ? '' : (poIsSubBu ? String(poCompanyId) : ''),
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
        // Set true only for a genuine "My Clients" PO (see poIsMyClients above) — this is what
        // makes the BU Name field reopen showing "My Clients (No Business Unit)" instead of a
        // blank/wrong BU, and routes the Client field to the unscoped myClients list below.
        is_my_clients: poIsMyClients,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po, isEdit, form, buUnits, buUnitsReady, isCompanyLessActor, poClientIsBuLess, poEntityId]);

  const onSubmit = async (values) => {
    // The picked root BU has Sub-BUs — picking one of them is mandatory once they exist.
    if (showSubBuField && !values.sub_business_unit_id) {
      form.setError('sub_business_unit_id', { message: 'Sub Business Unit is required.' });
      return;
    }

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
    // UI-only — see its declaration in poSchema above. The backend has no concept of "My
    // Clients"; it only ever needs to see the resulting client_id (and the absence of
    // company_id), never this flag.
    delete clean.is_my_clients;
    // UI-only grouping step for company-less actors (Entity selector) — the backend authorizes
    // via company_id, so the chosen Entity is stripped here and only the filtered BU rides along.
    delete clean.entity_id;

    // A multi-BU BU-scoped actor already sent their picked company_id via the field above (see
    // showBuScopedPicker) — `values.company_id` wins below as-is. A single-BU actor never saw a
    // picker, so carry their BU through explicitly instead — the one the PO already had when
    // editing, otherwise the active BU from the global switcher/header. Without this a single-BU
    // actor's field would simply drop off the payload. A Centralised PO stays BU-less, and so does
    // a "My Clients" one — without excluding it here too, a BU-less PO being re-saved unchanged
    // would have the active Global BU silently pushed onto it via the `po?.company_id`/`activeBuId`
    // fallback, exactly the case this whole block exists to AVOID for Centralised POs already.
    if (!isCompanyLessActor && !values.is_centralised && !values.is_my_clients) {
      const buId = values.company_id || po?.company_id || po?.company?.id || activeBuId;
      if (buId) clean.company_id = buId;
    }
    // A chosen Sub-BU overrides the root — the backend only ever sees ONE BU id, whichever is the
    // most specific one actually picked. Never sent as its own field either way.
    if (clean.sub_business_unit_id) clean.company_id = Number(clean.sub_business_unit_id);
    delete clean.sub_business_unit_id;

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
          form.setError(showSubBuField ? 'sub_business_unit_id' : 'company_id', { type: 'server', message });
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
                            // "My Clients" (myClientsOnly) is intentionally untouched here — it
                            // now works the same way in either PO Scope, see handleMyClientsToggle.
                            if (checked) {
                              form.setValue('company_id', '', { shouldValidate: true });
                              form.setValue('end_date', '', { shouldValidate: true });
                            }
                          }}
                        >
                          <TabsList className="h-[clamp(1.875rem,2vw,2.25rem)] bg-white">
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
                      <Input placeholder="e.g. Annual Support Services" className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]" {...field} />
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

              {/* Entity Name — company-less actors (Admin/Entity Admin/Platform Admin) only, the
                  exact mirror of the Entity selector used elsewhere in the project (CompanyForm,
                  every EntityFilter). Picking one narrows the BU Name options just below to that
                  Entity's BUs, so the two fields can never disagree. Entity Admin sees only their
                  own Entities (GET /entities is scoped server-side), Admin/Platform Admin see all. */}
              {showEntityField && (
                <FormField
                  control={form.control}
                  name="entity_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> Entity Name
                      </FormLabel>
                      <SearchableSelect
                        options={isCompanyLessActor
                          ? activeEntities.map((e) => ({
                              value: String(e.id),
                              label: e.entity_name,
                            }))
                          : selectableEntities.map((e) => ({
                              value: String(e.id),
                              label: e.name,
                            }))}
                        value={field.value ? String(field.value) : ''}
                        onValueChange={(val) => {
                          field.onChange(val ? parseInt(val, 10) : undefined);
                          // Changing Entity invalidates whatever BU/Client/Project were picked
                          // under the previous one — never carry them over. These resets are
                          // DELIBERATELY silent (no shouldValidate): forcing validation here would
                          // surface "Business Unit is required" the moment an Entity is picked,
                          // while the BU field is still empty and untouched — and react-hook-form
                          // then keeps that stale error even after a BU is chosen. The BU field's
                          // own onValueChange clears it once a real BU lands.
                          form.setValue('company_id', '');
                          form.setValue('sub_business_unit_id', '');
                          form.setValue('is_my_clients', false);
                          form.setValue('client_id', '');
                          form.setValue('project_id', '');
                          form.clearErrors(['company_id', 'sub_business_unit_id', 'is_my_clients']);
                        }}
                        disabled={isCompanyLessActor ? isLoadingEntities : isLoadingMappedBus}
                        placeholder="Select entity"
                        searchPlaceholder="Search entity..."
                        emptyMessage="No active entities found."
                        className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Asked before Client whenever this actor has more than one BU to choose between
                  (or none of their own at all) — the Client list right below is then scoped to
                  whichever BU is picked here, so the two fields can never disagree. */}
              {showBuField && (
                <FormField
                  control={form.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> BU Name
                      </FormLabel>
                      <BusinessUnitCascadeSelect
                        units={buUnits}
                        extraOptions={isCompanyLessActor
                          ? [{ value: MY_CLIENTS_BU_VALUE, label: 'My Clients (No Business Unit)' }]
                          : []}
                        // field.value stays a real BU id or '' — "My Clients" is represented here,
                        // not stored on company_id itself, so the schema/submission always see a
                        // real number or nothing.
                        value={myClientsOnly ? MY_CLIENTS_BU_VALUE : field.value}
                        onValueChange={(val) => {
                          const pickedMyClients = val === MY_CLIENTS_BU_VALUE;
                          form.setValue('is_my_clients', pickedMyClients, { shouldValidate: true });
                          field.onChange(pickedMyClients || !val ? undefined : parseInt(val, 10));
                          // A real BU (or "My Clients") satisfies the company_id superRefine —
                          // clear its stale error explicitly so the message never lingers once a
                          // valid choice is made.
                          form.clearErrors('company_id');
                          // A different root's own Sub-BUs are a different set — never leave a
                          // Sub-BU id from the PREVIOUS root silently selected underneath.
                          form.setValue('sub_business_unit_id', '');
                          form.clearErrors('sub_business_unit_id');
                          // Changing BU (or switching to/from "My Clients") invalidates whatever
                          // Client/Project were picked under the previous one — never carry them
                          // over.
                          form.setValue('client_id', '');
                          form.setValue('project_id', '');
                        }}
                        disabled={isCompanyLessActor && isLoadingCompanies}
                        placeholder="Select business unit"
                        searchPlaceholder="Search business unit..."
                        className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Mandatory, not optional, once the picked BU actually has Sub-BUs — its own
                  sibling field (own grid cell in this 2-column layout) rather than nested inside
                  the BU Name field above, so it doesn't stretch that field's own row/column. Never
                  gated on "My Clients" (a BU-less client has no Sub-BU to pick either); Client/
                  Project loading isn't gated on THIS field being filled in either, but does
                  re-scope to it once it is (see effectiveBuId). */}
              {showSubBuField && (
                <FormField
                  control={form.control}
                  name="sub_business_unit_id"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[13px]">
                        <span className="text-destructive">*</span> Sub BU Name
                      </FormLabel>
                      <SubBusinessUnitSelect
                        options={subBuOptions}
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          // The Sub-BU is now the most specific BU the Client list scopes to (see
                          // effectiveBuId) — whatever Client was picked under the root alone (or a
                          // different Sub-BU) doesn't necessarily belong to this one.
                          form.setValue('client_id', '');
                          form.setValue('project_id', '');
                        }}
                        className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[13px]">
                      <span className="text-destructive">*</span> Client
                    </FormLabel>
                    <SearchableSelect
                      options={clientOptions}
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val ? parseInt(val, 10) : undefined);
                        // Changing Client invalidates whatever Project was picked for the
                        // previous Client — never carry it over (§3).
                        form.setValue('project_id', '');
                      }}
                      disabled={clientDisabled}
                      placeholder={myClientsOnly ? 'Select client' : (showBuField && !effectiveBuId ? 'Select a business unit first' : 'Select client')}
                      searchPlaceholder="Search client..."
                      emptyMessage={myClientsOnly ? 'No clients without a Business Unit found.' : undefined}
                      className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
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
                      options={projectOptions}
                      value={field.value}
                      onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                      disabled={!watchedClientId || isLoadingProjects}
                      placeholder={watchedClientId ? 'Select project' : 'Select a client first'}
                      searchPlaceholder="Search project..."
                      emptyMessage={isProjectsError ? 'Failed to load projects.' : 'No projects found for this client.'}
                      className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
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
                    className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
                  />
              </div>

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
                          className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
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

              <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                          className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
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
                            className="h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
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
