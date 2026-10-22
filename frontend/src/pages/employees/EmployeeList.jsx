import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { useIsMutating } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, UserCog, Eye, Search, Download, Upload, CheckCircle2, AlertCircle, FileDown, FileText, Printer, FileSpreadsheet, ChevronDown, ChevronUp, ChevronsUpDown, MoreVertical, ChevronLeft, ChevronRight, CornerDownRight, Building2, FolderKanban } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useEmployees, useImportEmployees, useToggleEmployeeStatus, useUpdateEmployee, useEmployeeMappings } from '@/hooks/useEmployees';
import { useEmployeeServicePOMappingOptions, useSaveEmployeeServicePOMapping } from '@/hooks/useEmployeeServicePOMapping';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useRoles } from '@/hooks/useRoles';
import { useCompanies } from '@/hooks/useCompanies';
import { useMasterBuFilter } from '@/hooks/useMasterBuFilter';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { employeesApi } from '@/api/employees.api';
import { useCanWrite, useCanManageEmployeeRecords } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_NAMES, getAssignableRoleNames, ADDITIONAL_ROLE_NAMES, SENIOR_ROLE_NAMES } from '@/constants/roleHierarchy';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { formatProjectManagerAssignmentError } from '@/utils/projectManagerError';
import { buildPath, ROUTES } from '@/constants/routes';
import { formatDate, getInitials } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import DataTable from '@/components/common/DataTable';
import BusinessUnitFilter from '@/components/common/BusinessUnitFilter';
import EntityFilter from '@/components/common/EntityFilter';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import SegmentedToggle from '@/components/common/SegmentedToggle';
import EmptyState from '@/components/common/EmptyState';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ListPagination from '@/components/pmDashboard/ListPagination';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

const columnHelper = createColumnHelper();

// Keeps each mapping list's header row in place while its body scrolls. Needs the list's scroll
// container to be the Table's own wrapper (via containerClassName) — sticky resolves against the
// nearest scrolling ancestor, so an extra overflow div around the Table would break it.
const STICKY_HEAD = 'sticky top-0 z-10 bg-background';

// Sentinel for the mapping dialog's own Entity filter (local to this dialog — narrows which rows
// the Business Units table below it shows, same "All X" convention as EntityFilter.jsx's own
// ALL_ENTITIES, just not shared with it since that component owns its own actor-scoped entity
// list while this one is derived straight from the BU rows already fetched for the dialog).
const ALL_MAPPING_ENTITIES = 'all';

const TruncatedCell = ({ value, maxWidth = '150px', className }) => {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={cn("text-sm truncate", className)} style={{ maxWidth }} title={value}>
      {value}
    </div>
  );
};

// Roles and Business Units are no longer picked on the Add/Edit Employee form (see
// EmployeeForm.jsx and [[project_employee_identity_migration]]) — they're mapped here instead,
// as two checkbox tables, opened per-row from Employee List's "Map Roles & Business Units"
// action. Checking "Service PO Admin" reveals a third section here — no separate row action/
// icon for Service PO mapping — since that role gets company-wide, BU-unrestricted PO access
// (backend flag `unrestricted: true`), so there's nothing to pre-filter: it's just "pick from
// every active Service PO." (Delivery Head is NOT an RBAC role in this system — it's a per-PO
// field set via the Service PO Form's own "Delivery Head" dropdown — so it never appears as a
// checkbox here; once the backend adds it into the same unrestricted bucket as Service PO Admin,
// only the eligibility response's `unrestricted` flag changes, not this UI.)
const RoleBuMappingDialog = ({ employee, actorRoleName, allRoles, businessUnits, onOpenChange }) => {
  const { success, error: showError } = useNotification();
  const updateMutation = useUpdateEmployee(employee?.id);
  const saveServicePoMutation = useSaveEmployeeServicePOMapping(employee?.id);
  const { data: mappings, isLoading: mappingsLoading } = useEmployeeMappings(employee?.id);
  const { employee: currentEmployee } = useAuth();
  // A BU Admin editing THEIR OWN record, who holds NO other role, can't unmap a BU (nothing else to
  // fall back on — it would strip their own BU Admin access; the backend refuses it too). When they
  // also hold another role (e.g. Project Manager), unmapping a BU only removes it for those OTHER
  // roles — the BU Admin role keeps it — so nothing is locked.
  const hasNonBuAdminRole = (mappings?.roles ?? []).some((r) => r.name !== ROLE_NAMES.BU_ADMIN);
  const lockedBuIds =
    actorRoleName === ROLE_NAMES.BU_ADMIN && currentEmployee?.id != null && currentEmployee.id === employee?.id && !hasNonBuAdminRole
      ? (mappings?.business_unit_ids ?? [])
      : [];
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [selectedBuIds, setSelectedBuIds] = useState([]);
  const [selectedPoIds, setSelectedPoIds] = useState([]);
  // Subset of selectedPoIds this employee is explicitly Project Manager for — a mapping row can
  // be PM'd only while it's also mapped, so unchecking a PO's mapping checkbox drops it from here
  // too (see togglePo).
  const [selectedPmPoIds, setSelectedPmPoIds] = useState([]);
  const [poSearch, setPoSearch] = useState('');
  // Toggled by clicking the "N selected" pill — pulls already-checked rows to the top of the
  // (still search-filtered) list so a reviewer can see everything they've picked without having
  // to scroll or re-search for each one.
  const [sortSelectedFirst, setSortSelectedFirst] = useState(false);
  // Column sort for the Service PO table — 'name' | 'client' | null, applied within each
  // selected/unselected partition when sortSelectedFirst is also on.
  const [poSortKey, setPoSortKey] = useState(null);
  const [poSortDir, setPoSortDir] = useState('asc');
  // Page-based instead of an internal scrollbar — the list is paged 5 at a time.
  const [poPage, setPoPage] = useState(1);
  const PO_PAGE_SIZE = 5;

  const togglePoSort = (key) => {
    if (poSortKey !== key) {
      setPoSortKey(key);
      setPoSortDir('asc');
    } else if (poSortDir === 'asc') {
      setPoSortDir('desc');
    } else {
      setPoSortKey(null);
      setPoSortDir('asc');
    }
  };
  const [buEntityFilter, setBuEntityFilter] = useState(ALL_MAPPING_ENTITIES);
  // Sub-BUs collapsed under their Parent by default — every Parent starts collapsed regardless of
  // whether one of its Sub-BUs is already checked, same UX as the BU Master list (CompanyList.jsx).
  // Expanding is an explicit per-row choice only.
  //
  // Keyed by parent id -> the user's explicit override (true = force expanded, false = force
  // collapsed). A plain Set of "expanded" ids can't represent an explicit collapse the way a Map
  // does (this dialog used to auto-expand a Parent with a checked Sub-BU, which meant OR-ing a Set
  // membership check with "does this parent have a selected child" — the child-selected half always
  // won once true, so clicking the collapse chevron on such a Parent had no visible effect at all —
  // confirmed live). A Map still lets an explicit toggle win either direction once set.
  const [buExpandOverrides, setBuExpandOverrides] = useState(() => new Map());
  const toggleBuExpanded = (id, currentlyExpanded) => {
    setBuExpandOverrides((prev) => {
      const next = new Map(prev);
      next.set(String(id), !currentlyExpanded);
      return next;
    });
  };

  // GET /employees (list) carries no role/BU data, so the row this dialog opened from can't seed
  // the checkboxes — fetch the employee's actual mappings fresh instead (see
  // [[project_employee_identity_migration]]).
  useEffect(() => {
    if (mappings) {
      setSelectedRoleIds(mappings.role_ids ?? []);
      setSelectedBuIds(mappings.business_unit_ids ?? []);
    }
  }, [mappings]);

  // The dialog instance stays mounted across different rows' clicks (only `employee` changes) —
  // reset the Entity filter per employee so it doesn't carry over a previous row's narrowed view.
  useEffect(() => {
    setBuEntityFilter(ALL_MAPPING_ENTITIES);
    setBuExpandOverrides(new Map());
  }, [employee?.id]);

  // Entity options for that filter, derived straight from the `businessUnits` prop this dialog was
  // given (see EmployeeList's own mappingDialogBusinessUnits). For a cross-BU actor (Admin/Entity
  // Admin/Platform Admin) that's still the full GET /companies list, each row carrying an
  // `entity: { id, entity_name }` relation, so this sub-filter renders normally. For a BU-scoped
  // actor (HR, BU Admin, BU Head, ...) the prop is now that login's OWN mapped BUs instead — by
  // design: this dialog assigns BUs to the target employee only from the ACTOR's own reach, not
  // every Entity in the system (an HR mapped to another BU's employees was exactly the reported
  // bug). Those rows carry no entity_name, so `buEntities` below comes back empty and this
  // sub-filter simply doesn't render for them — acceptable given how few BUs that login ever has.
  const buEntities = useMemo(() => {
    const byId = new Map();
    businessUnits.forEach((bu) => {
      const id = bu.entity_id ?? bu.entity?.id;
      const name = bu.entity?.entity_name;
      if (id != null && name && !byId.has(id)) byId.set(id, { id, name });
    });
    return Array.from(byId.values());
  }, [businessUnits]);

  // Narrows which rows the table below renders — never touches selectedBuIds, so a BU picked
  // under one Entity stays checked even once the filter moves to a different Entity (same
  // "selections hidden by a filter are never touched" rule the Service PO search below follows).
  const filteredBusinessUnits = useMemo(() => {
    if (buEntityFilter === ALL_MAPPING_ENTITIES) return businessUnits;
    return businessUnits.filter((bu) => String(bu.entity_id ?? bu.entity?.id) === buEntityFilter);
  }, [businessUnits, buEntityFilter]);

  // Flattened into render order for the checkbox table below — every Parent BU row immediately
  // followed by its own (collapsible) Sub-BU rows, indented, instead of a separate multi-select
  // dropdown control. A Sub-BU whose own Parent got filtered out by the Entity picker above (rare
  // — a Sub-BU inherits its Parent's Entity, so this only happens if the BU master's own entity_id
  // somehow disagrees between the two) still gets a row, un-indented, rather than silently
  // vanishing. A Parent's Sub-BU rows are only included once it's explicitly expanded (see
  // buExpandOverrides) — every Parent starts collapsed, even one already holding a checked Sub-BU.
  const buRows = useMemo(() => {
    const childrenByParent = new Map();
    filteredBusinessUnits.forEach((bu) => {
      const parentId = bu.parent_business_unit_id ?? null;
      if (parentId == null) return;
      const key = String(parentId);
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(bu);
    });
    const rows = [];
    const rootIds = new Set();
    filteredBusinessUnits
      .filter((bu) => (bu.parent_business_unit_id ?? null) == null)
      .forEach((root) => {
        rootIds.add(String(root.id));
        const children = childrenByParent.get(String(root.id)) ?? [];
        // Always starts collapsed — even a Parent already holding a checked Sub-BU — an explicit
        // click on the chevron is the only thing that expands it. An explicit override (either
        // direction) always wins once set, so collapsing after checking a Sub-BU (see toggleBuExpanded)
        // still works correctly.
        const override = buExpandOverrides.get(String(root.id));
        const expanded = override != null ? override : false;
        rows.push({ ...root, depth: 0, hasChildren: children.length > 0, expanded });
        if (expanded) children.forEach((child) => rows.push({ ...child, depth: 1 }));
      });
    const includedIds = new Set(rows.map((r) => r.id));
    filteredBusinessUnits.forEach((bu) => {
      if (includedIds.has(bu.id)) return;
      const parentId = bu.parent_business_unit_id ?? null;
      // Not orphaned — just a Sub-BU still collapsed under its (present) Parent, not to be
      // re-added here un-indented at the bottom.
      if (parentId != null && rootIds.has(String(parentId))) return;
      rows.push({ ...bu, depth: 0 });
    });
    return rows;
  }, [filteredBusinessUnits, buExpandOverrides]);

  // Off the full (unfiltered-by-Entity) `businessUnits` prop, not `filteredBusinessUnits` — a
  // Parent's cascade behavior below must hold even while the Entity picker has temporarily
  // narrowed which rows are visible.
  const childBuIdsByParentId = useMemo(() => {
    const map = new Map();
    businessUnits.forEach((bu) => {
      const parentId = bu.parent_business_unit_id ?? null;
      if (parentId == null) return;
      const key = String(parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(bu.id);
    });
    return map;
  }, [businessUnits]);

  const parentIdByBuId = useMemo(() => {
    const map = new Map();
    businessUnits.forEach((bu) => {
      if (bu.parent_business_unit_id != null) map.set(bu.id, bu.parent_business_unit_id);
    });
    return map;
  }, [businessUnits]);

  const toggleBu = (buId) => {
    if (lockedBuIds.includes(buId)) return;
    setSelectedBuIds((prev) => {
      const childIds = childBuIdsByParentId.get(String(buId)) ?? [];
      if (prev.includes(buId)) {
        // Unchecking a Parent BU also unchecks every one of its own Sub-BUs — a Sub-BU mapping
        // left behind under a Parent the employee is no longer mapped to at all doesn't make
        // sense to keep.
        const toRemove = new Set([buId, ...childIds]);
        return prev.filter((id) => !toRemove.has(id));
      }
      const next = [...prev, buId];
      // Checking a Sub-BU also maps its Parent BU — a Sub-BU is part of its Parent (the backend
      // does the same on save, so this only makes it visible up front).
      const parentId = parentIdByBuId.get(buId);
      if (parentId != null && !next.includes(parentId)) next.push(parentId);
      // Checking a Parent with exactly one Sub-BU auto-selects that Sub-BU too — with only one
      // possible choice under it, there's nothing for the user to actually pick between.
      if (childIds.length === 1 && !next.includes(childIds[0])) next.push(childIds[0]);
      return next;
    });
  };

  // Every row here IS an employee, so plain Employee is a mandatory baseline role — pinned
  // checked & disabled, same standing bypass EmployeeForm.jsx used to apply for HR (whose
  // ROLE_CREATION_MATRIX entry is deliberately empty).
  const employeeRoleId = allRoles.find((r) => r.role_name === ROLE_NAMES.EMPLOYEE)?.id;
  const servicePoAdminRoleId = allRoles.find((r) => r.role_name === ROLE_NAMES.SERVICE_PO_ADMIN)?.id;
  const showServicePoSection = servicePoAdminRoleId != null && selectedRoleIds.includes(servicePoAdminRoleId);
  const assignableNames = [...new Set([...getAssignableRoleNames(actorRoleName), ROLE_NAMES.EMPLOYEE])];
  // Custom roles created via Role Master (not one of the 9 fixed system roles and not a senior
  // tier) are automatically included — this way newly-added roles appear without needing a
  // constants update here every time someone creates one.
  const knownSystemRoleNames = new Set(Object.values(ROLE_NAMES));
  const isRoleAssignableByActor = (roleName) =>
    assignableNames.includes(roleName) ||
    ADDITIONAL_ROLE_NAMES.includes(roleName) ||
    (!SENIOR_ROLE_NAMES.includes(roleName) && !knownSystemRoleNames.has(roleName));
  // Also keeps any role the employee is ALREADY mapped to, even one outside what this actor could
  // newly assign (e.g. an HR viewing an employee a senior role was granted to) — otherwise that
  // role has no row to render at all, and the panel showed "N selected" over a completely empty
  // list while N counted ids this filter alone would never surface. Those extra rows render
  // disabled below (view-only) rather than hidden.
  const roleRows = allRoles.filter(
    (r) => isRoleAssignableByActor(r.role_name) || selectedRoleIds.includes(r.id)
  );

  // Full active PO list (company-wide) — Service PO Admin needs no BU-eligibility filtering, so
  // this doesn't call the employee-scoped options endpoint at all here.
  const { data: fallbackActivePOs, isLoading: fallbackPOsLoading } = useActiveServicePOs(showServicePoSection);
  // Seeds which POs come pre-checked (existing mapping) AND supplies the PO list itself: its
  // `eligible_service_pos` is not tied to the BU currently active in the navbar, whereas
  // /service-pos/active/list is — which left POs of this employee's OTHER BUs (including ones
  // already mapped to them) out of the panel. The active list is only a fallback while this loads.
  const { data: existingMapping, isLoading: optionsLoading } = useEmployeeServicePOMappingOptions(showServicePoSection ? employee?.id : null);
  const allEligiblePOs = existingMapping?.eligible_service_pos ?? fallbackActivePOs;
  // Only the Service POs of the Business Units / Sub-BUs ticked in the BU panel (a Centralised PO
  // belongs to no single BU, so it stays). Unticking a BU therefore also drops its POs from the
  // panel — and from what gets saved below.
  const activePOs = useMemo(
    () => (allEligiblePOs ?? []).filter(
      (po) => po.is_centralised || po.company_id == null || selectedBuIds.includes(po.company_id)
    ),
    [allEligiblePOs, selectedBuIds]
  );
  const activePOsLoading = optionsLoading || (!existingMapping && fallbackPOsLoading);

  useEffect(() => {
    if (existingMapping) {
      setSelectedPoIds(existingMapping.mapped_service_po_ids ?? []);
      setSelectedPmPoIds(existingMapping.project_manager_service_po_ids ?? []);
    }
  }, [existingMapping]);

  const filteredPOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    const list = activePOs ?? [];
    let matched = !q ? list : list.filter((po) =>
      [po.service_po_name, po.service_po_code, po.client?.client_name]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    );
    if (poSortKey) {
      matched = [...matched].sort((a, b) => {
        const av = (poSortKey === 'client' ? a.client?.client_name : a.service_po_name) ?? '';
        const bv = (poSortKey === 'client' ? b.client?.client_name : b.service_po_name) ?? '';
        const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
        return poSortDir === 'asc' ? cmp : -cmp;
      });
    }
    // Centralised POs (not tied to any BU) always sit BELOW the POs of the ticked BUs/Sub-BUs.
    // Stable partition, so each group keeps its relative order.
    const isCentralisedPo = (po) => !!(po.is_centralised || po.company_id == null);
    const centralisedLast = (list) => [
      ...list.filter((po) => !isCentralisedPo(po)),
      ...list.filter(isCentralisedPo),
    ];
    if (!sortSelectedFirst) return centralisedLast(matched);
    // Stable partition, not a re-sort of the whole list, so rows keep their (now sorted) relative
    // order within each of the two groups.
    const selected = matched.filter((po) => selectedPoIds.includes(po.id));
    const rest = matched.filter((po) => !selectedPoIds.includes(po.id));
    return [...centralisedLast(selected), ...centralisedLast(rest)];
  }, [activePOs, poSearch, sortSelectedFirst, selectedPoIds, poSortKey, poSortDir]);

  const filteredPoIds = useMemo(() => filteredPOs.map((po) => po.id), [filteredPOs]);
  const selectedFilteredCount = filteredPoIds.filter((id) => selectedPoIds.includes(id)).length;

  // Re-searching/re-sorting changes what page 1 even means, so land back there instead of
  // stranding the user on a now out-of-range page.
  useEffect(() => {
    setPoPage(1);
  }, [poSearch, poSortKey, poSortDir, sortSelectedFirst]);

  const poTotalPages = Math.max(1, Math.ceil(filteredPOs.length / PO_PAGE_SIZE));
  const pagedPOs = useMemo(
    () => filteredPOs.slice((poPage - 1) * PO_PAGE_SIZE, poPage * PO_PAGE_SIZE),
    [filteredPOs, poPage]
  );

  const toggleRole = (roleId) => {
    if (roleId === employeeRoleId) return;
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) return prev.filter((id) => id !== roleId);
      const isSenior = SENIOR_ROLE_NAMES.includes(allRoles.find((r) => r.id === roleId)?.role_name);
      // At most one senior tier (Platform Admin/Admin/Entity Admin/BU Admin/BU Head) at a time —
      // client-side UX guard only, the real enforcement is server-side.
      const base = isSenior
        ? prev.filter((id) => !SENIOR_ROLE_NAMES.includes(allRoles.find((r) => r.id === id)?.role_name))
        : prev;
      return [...base, roleId];
    });
  };


  const togglePo = (poId) => {
    setSelectedPoIds((prev) => (prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId]));
    // Unmapping a PO can't leave it PM'd — drop it from the PM set in the same click rather than
    // leaving a stale selection the Checkbox below would just hide (disabled) until Save.
    setSelectedPmPoIds((prev) => (prev.includes(poId) ? prev.filter((id) => id !== poId) : prev));
  };

  const togglePmPo = (poId) => {
    setSelectedPmPoIds((prev) => (prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId]));
  };

  const isSaving = updateMutation.isPending || saveServicePoMutation.isPending;

  const handleSave = async () => {
    const roleIds = employeeRoleId != null && !selectedRoleIds.includes(employeeRoleId)
      ? [...selectedRoleIds, employeeRoleId]
      : selectedRoleIds;
    try {
      await updateMutation.mutateAsync({ role_ids: roleIds, business_unit_ids: selectedBuIds });
      if (showServicePoSection) {
        // Backend rejects the whole request wholesale if any id fails re-validation — let that
        // throw into the catch below so nothing here is treated as saved. Rows PM'd for this
        // employee go through as `{ service_po_id, is_project_manager: true }`, everything else
        // as a plain id (equivalent to is_project_manager: false). A centralised PO never goes
        // through as PM even if `selectedPmPoIds` somehow still carries it (e.g. seeded from a
        // pre-existing mapping made before this restriction existed) — the checkbox is disabled,
        // but this is the belt-and-suspenders backstop for what actually gets sent.
        // `is_centralised` isn't in this endpoint's response (see the row-render comment above) —
        // same `company_id == null` proxy applies here.
        const centralisedPoIds = new Set(
          (activePOs ?? []).filter((po) => (po.is_centralised ?? po.company_id == null)).map((po) => po.id)
        );
        // Only POs still in scope of the ticked BUs (see activePOs above) are kept mapped.
        const inScopePoIds = new Set(activePOs.map((po) => po.id));
        const servicePoIds = selectedPoIds.filter((poId) => inScopePoIds.has(poId)).map((poId) =>
          selectedPmPoIds.includes(poId) && !centralisedPoIds.has(poId)
            ? { service_po_id: poId, is_project_manager: true }
            : poId
        );
        await saveServicePoMutation.mutateAsync(servicePoIds);
      }
      success(`Roles, Business Units${showServicePoSection ? ' & Service PO mapping' : ''} updated for ${employee.full_name}.`);
      onOpenChange(false);
    } catch (err) {
      showError(formatProjectManagerAssignmentError(err));
    }
  };

  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col',
          showServicePoSection ? 'max-w-2xl md:max-w-[92vw] lg:max-w-7xl' : 'max-w-2xl md:max-w-3xl',
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Map Roles &amp; Business Units</DialogTitle>
          <DialogDescription>Assign roles and business units for {employee?.full_name}.</DialogDescription>
        </DialogHeader>
        {/* min-h-0 is what lets this flex child actually shrink and scroll instead of
            stretching the dialog past the viewport. */}
        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-1 -mx-1">
        {/* Stays single-column through tablet-portrait widths (sm/640px was too early — it forced
            cramped columns before there was room, wrapping role/BU names onto a second line and
            desyncing the tables' row heights) and only splits into columns once md/768px actually
            has the width to spare. Service POs joins as a third column (rather than its own
            full-width row below, which used to push the dialog's height around whenever Service
            PO Admin got checked) only while showServicePoSection is true — the Dialog's own
            max-w-5xl above only widens when this does, so three columns actually gets the room a
            plain 3-column split of the original max-w-3xl never would. */}
        <div className={cn('grid grid-cols-1 gap-4', showServicePoSection ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]' : 'md:grid-cols-2')}>
          <div className="space-y-1.5 min-w-0 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Roles</h4>
              <Badge variant="secondary" className="text-[10px] font-normal">{selectedRoleIds.length} selected</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Select the roles to assign</p>
            {/* Taller than Business Units'/Service POs' own table cap (240px) — this column has
                no Entity dropdown / search box above its table like they do, so without the extra
                ~44px that row takes up elsewhere, this card would end up visibly shorter than its
                siblings once the grid stretches all three to equal height, leaving blank space
                below the table instead of more of the table itself. */}
            <Table containerClassName="border rounded-md max-h-[290px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn('w-10', STICKY_HEAD)}></TableHead>
                    <TableHead className={STICKY_HEAD}>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Checkbox
                          checked={r.id === employeeRoleId ? true : selectedRoleIds.includes(r.id)}
                          disabled={r.id === employeeRoleId || !isRoleAssignableByActor(r.role_name)}
                          onCheckedChange={() => toggleRole(r.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <TruncatedCell value={r.role_name} maxWidth="220px" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
            </Table>
          </div>
          <div className="space-y-1.5 min-w-0 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Business Units</h4>
            </div>
            <p className="text-xs text-muted-foreground">Select one or more business units</p>
            {buEntities.length > 0 && (
              <SearchableSelect
                options={[
                  { label: 'All Entities', value: ALL_MAPPING_ENTITIES },
                  ...buEntities.map((e) => ({ label: e.name, value: String(e.id) })),
                ]}
                value={buEntityFilter}
                onValueChange={(v) => v && setBuEntityFilter(v)}
                placeholder="All Entities"
                searchPlaceholder="Search entity..."
                showSearch={buEntities.length > 6}
                className="h-8 w-full text-sm bg-white"
              />
            )}
            {/* Plain, always-expanded checkbox list — same table style as Roles to its left,
                A Sub-BU renders indented directly beneath its own Parent BU row (see buRows),
                collapsed by default behind a chevron toggle — same UX as the BU Master list.
                Checking a Parent BU row selects the Parent BU itself as a valid assignment — it
                does NOT auto-select its Sub-BUs; each is checked individually to map to it
                specifically. Checking a Sub-BU DOES also map its Parent BU. */}
            <Table containerClassName="border rounded-md max-h-[240px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={cn('w-10', STICKY_HEAD)}></TableHead>
                  <TableHead className={STICKY_HEAD}>Business Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-6">
                      No Business Units for this Entity.
                    </TableCell>
                  </TableRow>
                ) : (
                  buRows.map((bu) => (
                    <TableRow key={bu.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedBuIds.includes(bu.id)}
                          disabled={lockedBuIds.includes(bu.id)}
                          onCheckedChange={() => toggleBu(bu.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className={cn('flex items-center gap-1', bu.depth > 0 && 'pl-3')}>
                          {bu.depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          {bu.depth === 0 && bu.hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleBuExpanded(bu.id, bu.expanded)}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                              aria-label={bu.expanded ? 'Collapse' : 'Expand'}
                            >
                              {bu.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            bu.depth === 0 && <div className="w-5 shrink-0" />
                          )}
                          <TruncatedCell value={bu.company_name} maxWidth={bu.depth > 0 ? '190px' : '190px'} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {showServicePoSection && (
          <div className="space-y-1.5 min-w-0 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-sm font-semibold">Service POs</h4>
              <button
                type="button"
                onClick={() => setSortSelectedFirst((v) => !v)}
                disabled={selectedPoIds.length === 0}
                title={sortSelectedFirst ? 'Showing selected first — click to restore original order' : 'Click to bring selected rows to the top'}
                className="disabled:cursor-default"
              >
                <Badge
                  variant="secondary"
                  className={cn('text-[10px] font-normal', sortSelectedFirst && 'bg-primary/10 text-primary')}
                >
                  {selectedPoIds.length} selected
                  {/* While filtering, say how many of the VISIBLE rows are picked — otherwise the
                      total alone looks wrong next to a short filtered list. */}
                  {poSearch.trim() && selectedFilteredCount !== selectedPoIds.length
                    ? ` (${selectedFilteredCount} shown)`
                    : ''}
                </Badge>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Choose the Service POs this employee is mapped to, and mark PM where applicable</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
              <Input
                placeholder="Search by Service PO, code or client..."
                className="pl-9 h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
              />
            </div>
            <Table containerClassName="border rounded-md" className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn('w-10', STICKY_HEAD)}></TableHead>
                    <TableHead className={cn('w-[42%]', STICKY_HEAD)}>
                      <button
                        type="button"
                        onClick={() => togglePoSort('name')}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        Service PO
                        {poSortKey === 'name'
                          ? (poSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                          : <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}
                      </button>
                    </TableHead>
                    <TableHead className={cn('w-[38%]', STICKY_HEAD)}>
                      <button
                        type="button"
                        onClick={() => togglePoSort('client')}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        Client
                        {poSortKey === 'client'
                          ? (poSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                          : <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}
                      </button>
                    </TableHead>
                    <TableHead className={cn('w-14 text-center', STICKY_HEAD)} title="Project Manager for this Service PO">
                      PM
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activePOsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filteredPOs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        {poSearch.trim()
                          ? 'No Service POs match your search.'
                          : 'No active Service POs found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedPOs.map((po) => {
                      const isMapped = selectedPoIds.includes(po.id);
                      // GET /service-pos/active/list (what feeds this dialog) doesn't return
                      // `is_centralised` at all — only the paginated GET /service-pos does. A
                      // Centralised PO's `company_id` is reliably null though (ServicePOForm's own
                      // validation skips requiring Entity/BU specifically "for a Centralised PO"),
                      // so that's used as the signal here instead of a field this endpoint omits.
                      const isCentralised = po.is_centralised ?? po.company_id == null;
                      return (
                      <TableRow key={po.id}>
                        <TableCell>
                          <Checkbox checked={isMapped} onCheckedChange={() => togglePo(po.id)} />
                        </TableCell>
                        <TableCell>
                          <TruncatedCell
                            value={po.service_po_code ? `${po.service_po_name} (${po.service_po_code})` : po.service_po_name}
                            maxWidth="100%"
                          />
                        </TableCell>
                        <TableCell>
                          <TruncatedCell value={po.client?.client_name} maxWidth="100%" className="text-muted-foreground" />
                        </TableCell>
                        <TableCell className="text-center">
                          {/* Centralised Service POs never get a PM — hidden rather than a
                              disabled checkbox, since there's genuinely no such option for them,
                              not just one this employee/row can't currently use. */}
                          {!isCentralised && (
                            <Checkbox
                              checked={selectedPmPoIds.includes(po.id)}
                              disabled={!isMapped}
                              onCheckedChange={() => togglePmPo(po.id)}
                              title={isMapped ? 'Set as Project Manager for this Service PO' : 'Map this Service PO first'}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
            </Table>
            {filteredPOs.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="truncate text-[11px] text-muted-foreground">
                  Showing {pagedPOs.length} of {filteredPOs.length} service POs
                </span>
                {poTotalPages > 1 && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      disabled={poPage === 1}
                      onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-[52px] text-center text-[11px] font-medium tabular-nums">
                      {poPage} / {poTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      disabled={poPage === poTotalPages}
                      onClick={() => setPoPage((p) => Math.min(poTotalPages, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || mappingsLoading}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SERVICE_PO_PAGE_SIZE = 5;

// Read-only "View" drawer for an Employee Master row — Business Unit/Sub-BU mapping and every
// currently-mapped Service PO, each in its own section. Opened via the row's own "View" action in
// the Actions column, separate from "Edit" (profile fields) and "Map Roles & Business Units"
// (RoleBuMappingDialog above, which edits the mapping this drawer only displays).
const EmployeeViewDrawer = ({ employeeId, employeeName, open, onOpenChange }) => {
  const [poPage, setPoPage] = useState(1);
  const [poLimit, setPoLimit] = useState(SERVICE_PO_PAGE_SIZE);
  const [poSearch, setPoSearch] = useState('');
  // Which root BUs (by id) have their Sub-BU pills expanded — starts collapsed for every root, so
  // a BU with several Sub-BUs doesn't blow out the 3-per-row grid below by default.
  const [expandedBuIds, setExpandedBuIds] = useState(() => new Set());
  const toggleBuExpanded = (id) => {
    setExpandedBuIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Reset pagination/search/expand-state whenever a different row is opened — otherwise opening
  // Employee B right after viewing Employee A's page 3 / search text / expanded BUs would silently
  // carry all of that over.
  useEffect(() => {
    setPoPage(1);
    setPoLimit(SERVICE_PO_PAGE_SIZE);
    setPoSearch('');
    setExpandedBuIds(new Set());
  }, [employeeId]);

  const { data: mappings, isPending: isLoadingMappings } = useEmployeeMappings(open ? employeeId : undefined);
  // Same source RoleBuMappingDialog itself seeds its Service PO checkboxes from — `mapped_service_po_ids`
  // is the authoritative full mapped set, but `eligible_service_pos` (the only place this endpoint
  // carries name/client/project detail) is scoped to what's currently eligible to ADD, which isn't
  // guaranteed to be a superset of every already-mapped id (e.g. a mapped PO whose own BU eligibility
  // has since changed) — see BACKEND_EMPLOYEE_MAPPED_SERVICE_POS_VIEW_PROMPT.md for the gap this
  // leaves and the dedicated read endpoint requested to close it. Until that exists, an unresolvable
  // mapped id still gets its own row below, just without a name to show.
  const { data: poOptions, isPending: isLoadingPOs } = useEmployeeServicePOMappingOptions(open ? employeeId : undefined);

  const mappedServicePOs = useMemo(() => {
    const mappedIds = poOptions?.mapped_service_po_ids ?? [];
    const pmIds = new Set(poOptions?.project_manager_service_po_ids ?? []);
    const byId = new Map((poOptions?.eligible_service_pos ?? []).map((po) => [po.id, po]));
    return mappedIds.map((id) => {
      const po = byId.get(id);
      return {
        id,
        service_po_code: po?.service_po_code,
        service_po_name: po?.service_po_name,
        client_name: po?.client?.client_name,
        project_name: po?.project?.project_name,
        is_project_manager: pmIds.has(id),
        is_centralised: po?.is_centralised ?? false,
        unresolved: !po,
      };
    });
  }, [poOptions]);

  // Client-side — the full mapped set is already in memory (see mappedServicePOs above), so
  // there's no round trip to debounce here, unlike every other search box in this app.
  const filteredServicePOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return mappedServicePOs;
    return mappedServicePOs.filter((po) =>
      [po.service_po_name, po.service_po_code, po.client_name, po.project_name]
        .some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [mappedServicePOs, poSearch]);

  const poTotalPages = Math.max(1, Math.ceil(filteredServicePOs.length / poLimit));
  const safePoPage = Math.min(poPage, poTotalPages);
  const pagedServicePOs = filteredServicePOs.slice((safePoPage - 1) * poLimit, safePoPage * poLimit);

  const isLoading = isLoadingMappings || isLoadingPOs;

  // Every root BU this Employee is mapped to, each carrying its own Sub-BUs (if any were also
  // mapped) — same "Parent -> Child" grouping convention UserMenu.jsx's own BU display uses, so a
  // Sub-BU never reads as an unrelated, unexplained extra entry next to its Parent.
  const buGroups = useMemo(() => {
    const units = mappings?.business_units ?? [];
    const roots = units.filter((u) => u.parent_business_unit_id == null);
    const orphanSubs = units.filter((u) =>
      u.parent_business_unit_id != null && !units.some((r) => r.id === u.parent_business_unit_id));
    return [
      ...roots.map((root) => ({
        ...root,
        subUnits: units.filter((u) => u.parent_business_unit_id === root.id),
      })),
      ...orphanSubs.map((sub) => ({ ...sub, subUnits: [] })),
    ];
  }, [mappings]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="shrink-0 border-b bg-gradient-to-r from-blue-50/80 via-white to-white px-5 py-4 text-left">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0 border border-blue-100">
              <AvatarFallback className="bg-blue-100 font-semibold text-blue-700">{getInitials(employeeName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="truncate text-base font-semibold text-slate-800">
                {employeeName ?? 'Employee Details'}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">Business Units &amp; Service PO mapping</p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/40">
          {isLoading ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <div className="space-y-6 p-5">
              {/* Business Units */}
              <div className="space-y-2.5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Building2 className="h-3.5 w-3.5" />
                  </span>
                  Business Units
                </h3>
                {buGroups.length === 0 ? (
                  <p className="pl-9 text-sm text-muted-foreground">No Business Units mapped.</p>
                ) : (
                  // 3 per row, full width — a prior "full-width card per root" version left every
                  // leaf BU (the common case) as a mostly-empty box, which was the actual white
                  // space complaint. A root with Sub-BUs starts collapsed (just a chevron) rather
                  // than always expanding, so one busy BU can't blow out the 3-column grid for
                  // every row it shares with simpler, sub-less BUs.
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {buGroups.map((root) => {
                      const hasSubs = root.subUnits.length > 0;
                      const isExpanded = expandedBuIds.has(root.id);
                      return (
                        <div key={root.id} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => hasSubs && toggleBuExpanded(root.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-1 text-left text-sm font-semibold text-slate-800',
                              hasSubs && 'cursor-pointer'
                            )}
                          >
                            <span className="truncate" title={root.name}>{root.name}</span>
                            {hasSubs && (
                              isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                          {hasSubs && isExpanded && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {root.subUnits.map((sub) => (
                                <span
                                  key={sub.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
                                >
                                  <CornerDownRight className="h-3 w-3" /> {sub.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mapped Service POs */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <FolderKanban className="h-3.5 w-3.5" />
                    </span>
                    Mapped Service POs
                    <Badge variant="secondary" className="font-normal text-muted-foreground">
                      {mappedServicePOs.length}
                    </Badge>
                  </h3>
                  {mappedServicePOs.length > 0 && (
                    <SearchInput
                      value={poSearch}
                      onChange={(e) => { setPoSearch(e.target.value); setPoPage(1); }}
                      placeholder="Search Service PO, client, project…"
                      className="ml-auto w-full sm:w-64"
                    />
                  )}
                </div>
                {mappedServicePOs.length === 0 ? (
                  <p className="pl-9 text-sm text-muted-foreground">No Service POs mapped.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      {filteredServicePOs.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No Service POs match your search.</p>
                      ) : (
                        <>
                          {/* Bounded + its own scroll (sticky header) — same convention every other
                              in-card table in this app uses for a page size that can run long, so a
                              bigger "Rows per page" pick scrolls inside this table, not by growing the
                              whole drawer (which only scrolls the page around it, not this specifically).
                              `containerClassName` sets the cap on Table's OWN built-in scroll wrapper
                              (ui/table.jsx) rather than adding a second `overflow-auto` div around it —
                              two nested auto-scroll containers fought over the horizontal drag/scroll
                              here, which is why it looked unresponsive despite the scrollbar rendering. */}
                          <Table containerClassName="max-h-[400px]">
                              <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                                <TableRow className="bg-slate-50 hover:bg-slate-50">
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service PO</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Client</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project</TableHead>
                                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Centralised</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pagedServicePOs.map((po) => (
                                  <TableRow key={po.id} className="hover:bg-slate-50/80">
                                    <TableCell>
                                      {po.unresolved ? (
                                        <span className="whitespace-nowrap text-sm text-muted-foreground">Service PO #{po.id}</span>
                                      ) : (
                                        <div className="flex items-center gap-1.5">
                                          <div className="min-w-0">
                                            <p className="whitespace-nowrap text-sm font-semibold text-slate-800">{po.service_po_name}</p>
                                            <p className="whitespace-nowrap font-mono text-xs text-muted-foreground">{po.service_po_code}</p>
                                          </div>
                                          {po.is_project_manager && (
                                            <Badge className="shrink-0 bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100">PM</Badge>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-sm text-slate-600">{po.client_name ?? '—'}</TableCell>
                                    <TableCell className="whitespace-nowrap text-sm text-slate-600">{po.project_name ?? '—'}</TableCell>
                                    <TableCell>
                                      {po.unresolved ? (
                                        <span className="text-sm text-muted-foreground">—</span>
                                      ) : po.is_centralised ? (
                                        <Badge className="bg-violet-100 text-[10px] text-violet-700 hover:bg-violet-100">Yes</Badge>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">No</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                          </Table>
                          <div className="border-t px-3 pb-1">
                            <ListPagination
                              page={safePoPage}
                              limit={poLimit}
                              total={filteredServicePOs.length}
                              onPageChange={setPoPage}
                              onPageSizeChange={(l) => { setPoLimit(l); setPoPage(1); }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const StatusToggle = ({ employee, disabled = false }) => {
  const { mutate, isPending } = useToggleEmployeeStatus();
  const isActive = employee.status === 'active';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending || disabled}
        onCheckedChange={(checked) =>
          mutate({ id: employee.id, status: checked ? 'active' : 'inactive' })
        }
      />
      <span className={cn('text-xs font-medium', isActive ? 'text-green-600' : 'text-slate-400')}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};



const EmployeeList = () => {
  const navigate = useNavigate();
  const { success, error: showError, warning } = useNotification();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  // Multi-select — backend support for entityIds/businessUnitIds has landed on GET /employees
  // (see BACKEND_MULTI_SELECT_ENTITY_BU_PROMPT.md), via a bespoke fix: this endpoint's BU scoping
  // was never actually driven by the X-Company-Id header (a pre-existing, already-documented
  // bug — see employees.api.js's own comment), only by an explicit `business_unit_id` query
  // param, and entityIds now uses that same non-header mechanism rather than the header-based
  // pattern every other Master screen relies on. Both are sent below as real query-string fields
  // regardless of scalar/array shape, matching what employees.api.js's getAll expects.
  const {
    entityId: entityIds, setEntityId: setEntityIds, showEntityFilter, isEntityFiltered, resetEntityId,
    buId: buIds, setBuId: setBuIds, showBuFilter, isBuFiltered, resetBuId,
  } = useMasterBuFilter({ multiple: true });
  const [mappingTarget, setMappingTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  const [sorting, setSorting] = useState([]);

  // GET /employees ignores the X-Company-Id header entirely (see employees.api.js's own comment)
  // — a BU-scoped login (HR, BU Admin, BU Head, ...) only actually gets narrowed to its own BUs
  // when `businessUnitIds` rides along as an explicit query param. The Filters panel's BU picker
  // above already sends that once the user narrows it themselves (isBuFiltered), but with NO
  // filter applied this used to send no BU-scoping param at all, so a BU-scoped login saw every
  // employee across every BU — not just their own. `units` is this login's own mapped BUs for a
  // BU-scoped actor (no extra request — see useSelectableBusinessUnits), or the full BU master for
  // a cross-BU one (Admin/Entity Admin/Platform Admin), who are meant to see everyone and so never
  // get this default applied.
  const { units: selectableBuUnits, isCrossBu } = useSelectableBusinessUnits();
  const ownBuIds = useMemo(() => selectableBuUnits.map((u) => u.id), [selectableBuUnits]);

  // Entity Name column below: a row's own `business_units[]` (per GET /employees) carries id/
  // name/parent hierarchy but no entity info at all — resolved here instead via the same two
  // selectable-* hooks the Entity/BU filters above already use, which handle the cross-BU vs
  // BU-scoped actor split correctly (see useSelectableBusinessUnits' own doc comment) without a
  // second company-master fetch of our own. A Sub-BU has no entityId of its own — it inherits its
  // parent's, so this is looked up by root id, never the Sub-BU's own id.
  const { entities: selectableEntities } = useSelectableEntities();
  const entityNameById = useMemo(
    () => new Map(selectableEntities.map((e) => [String(e.id), e.name])),
    [selectableEntities]
  );
  const entityIdByBuId = useMemo(
    () => new Map(selectableBuUnits.map((u) => [String(u.id), u.entityId])),
    [selectableBuUnits]
  );

  // Distinct, comma-joined names across an employee's `business_units[]` — BU/Entity Name columns
  // below. `getRootId` resolves a Sub-BU to its parent before the entityId lookup above, since
  // that map is keyed by root BU id only.
  const getEmployeeBuNames = (emp) => {
    const units = emp.business_units ?? emp.businessUnits ?? [];
    const names = new Set(units.map((bu) => bu.parent_business_unit_name ?? bu.name).filter(Boolean));
    return Array.from(names).sort().join(', ');
  };
  const getEmployeeSubBuNames = (emp) => {
    const units = emp.business_units ?? emp.businessUnits ?? [];
    const names = new Set(
      units.filter((bu) => bu.parent_business_unit_id != null).map((bu) => bu.name).filter(Boolean)
    );
    return Array.from(names).sort().join(', ');
  };
  const getEmployeeEntityNames = (emp) => {
    const units = emp.business_units ?? emp.businessUnits ?? [];
    const names = new Set(
      units
        .map((bu) => {
          const rootId = bu.parent_business_unit_id ?? bu.id;
          const entityId = entityIdByBuId.get(String(rootId));
          return entityId != null ? entityNameById.get(String(entityId)) : null;
        })
        .filter(Boolean)
    );
    return Array.from(names).sort().join(', ');
  };

  const params = {
    page,
    limit,
    status: statusFilter,
    ...(roleFilter !== 'all' && { role_id: roleFilter }),
    ...(isBuFiltered
      ? { businessUnitIds: buIds.join(',') }
      : (!isCrossBu && ownBuIds.length > 0 ? { businessUnitIds: ownBuIds.join(',') } : {})),
    ...(isEntityFiltered && { entityIds: entityIds.join(',') }),
    ...(debouncedSearch && debouncedSearch.length >= 3 && { search: debouncedSearch }),
    ...(sorting[0] && { sortBy: sorting[0].id, sortOrder: sorting[0].desc ? 'desc' : 'asc' }),
  };

  const { data, isPending, isFetching } = useEmployees(params);
  const { data: rolesData } = useRoles({ limit: 100 });
  // Sourced for the "Map Roles & Business Units" dialog's Business Units table — same
  // cross-BU-vs-own-mapping split as the list scoping above, so a BU-scoped actor (HR, BU Admin,
  // BU Head, ...) can only ever assign an employee to one of THEIR OWN mapped BUs, not every BU in
  // the system. Cross-BU actors (Admin/Entity Admin/Platform Admin) keep the original GET
  // /companies source (only fetched for them now) since it's appropriate for their reach and keeps
  // the richer `entity: { entity_name }` relation the dialog's own Entity sub-filter needs. GET
  // /companies is Entity-Admin-scoped and returns nothing usable for a login with no Entity of its
  // own, which is what produced the "No Business Units for this Entity" empty table for HR before
  // this fix — a BU-scoped actor's own mapped units carry no entity_name, so the Entity sub-filter
  // simply doesn't render for them (buEntities comes back empty), which is fine given how few BUs
  // that login is ever mapped to.
  const { data: companiesData } = useCompanies({ status: 'active', limit: 200 }, { enabled: isCrossBu });
  const mappingDialogBusinessUnits = useMemo(
    () => (isCrossBu
      ? companiesData?.data ?? []
      : selectableBuUnits.map((u) => ({ id: u.id, company_name: u.name, entity_id: u.entityId, parent_business_unit_id: u.parentId }))),
    [isCrossBu, companiesData, selectableBuUnits]
  );
  const importMutation = useImportEmployees();
  const isMutating = useIsMutating();
  const fileInputRef = useRef(null);

  const [previewData, setPreviewData] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [previewLimit, setPreviewLimit] = useState(5);

  const { role: actorRoleName } = useAuth();
  const employees = data?.data ?? [];
  const meta = data?.meta ?? {};
  // BU Admin sits below Admin/Entity Admin in the hierarchy and can't manage senior-tier
  // accounts, so those roles shouldn't appear as filter options for a BU Admin login.
  const roleFilterOptions =
    actorRoleName === ROLE_NAMES.BU_ADMIN
      ? (rolesData?.data ?? []).filter(
          (r) => ![ROLE_NAMES.ADMIN, ROLE_NAMES.BU_ADMIN, ROLE_NAMES.ENTITY_ADMIN].includes(r.role_name)
        )
      : rolesData?.data ?? [];
  const isHR = useCanWrite();
  // BU Admin / BU Head are on this screen for the "Map Roles & Business Units" action ONLY —
  // they may not create an employee, edit one, bulk-import, or activate/deactivate. Their role
  // carries Read & Write (that's what grants them the mapping dialog), so isHR alone can't tell
  // them apart — see useCanManageEmployeeRecords and the matching route guard on
  // EMPLOYEE_NEW / EMPLOYEE_EDIT.
  const canManageEmployees = useCanManageEmployeeRecords();

  // The seed "superadmin" account (confirmed live: superadmin@trackio.com) backs this whole
  // system's own Admin access — editing its fields or remapping its roles/Business Units from
  // here risks locking everyone out of Admin access entirely. Protected by email rather than role
  // (Admin/Platform Admin) since plenty of real, legitimately-editable accounts also hold those
  // roles; this specific seed login is the one that must never be touched from the UI.
  const isProtectedSuperAdmin = (emp) => (emp?.email ?? '').toLowerCase() === 'superadmin@trackio.com';

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0)
    + (roleFilter !== 'all' ? 1 : 0)
    + (isEntityFiltered ? 1 : 0)
    + (isBuFiltered ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('all');
    setRoleFilter('all');
    resetEntityId();
    resetBuId();
    setPage(1);
  };

  // Always present now — View (read-only, no write access needed) lives here for every login that
  // can open this list at all; Edit and Map Roles are added into the same column only for `isHR`
  // (and dropped outright for the protected superadmin row — see isProtectedSuperAdmin). Since the
  // column itself is never conditionally absent any more, the sticky offsets below are fixed
  // numbers, not branched on `isHR` the way they used to be.
  const columns = useMemo(() => [
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      size: 150,
      meta: { sticky: true, left: 0 },
      cell: ({ row }) => {
        const protectedRow = isProtectedSuperAdmin(row.original);
        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              title="View Details"
              onClick={() => setViewTarget(row.original)}
              className="h-6 w-6 p-0 bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
            >
              <Eye className="h-3 w-3" />
            </Button>
            {canManageEmployees && !protectedRow && (
              <Button
                size="sm"
                title="Edit"
                onClick={() => navigate(buildPath(ROUTES.EMPLOYEE_EDIT, { id: row.original.id }))}
                className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {isHR && !protectedRow && (
              <Button
                size="sm"
                className="h-6 w-6 p-0 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                title="Map Roles & Business Units"
                onClick={() => setMappingTarget(row.original)}
              >
                <UserCog className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('employee_code', {
      header: 'Employee ID',
      size: 130,
      meta: { sticky: true, left: 150 },
      cell: (info) => (
        <TruncatedCell value={info.getValue()} maxWidth="100px" className="font-medium" />
      ),
    }),
    columnHelper.accessor('full_name', {
      header: 'Name',
      size: 200,
      meta: { sticky: true, left: 280 },
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="160px" />,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      size: 220,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="190px" />,
    }),
    columnHelper.accessor('designation', {
      header: 'Designation',
      size: 180,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="160px" />,
    }),
    columnHelper.accessor('original_entity', {
      header: 'Original Entity',
      size: 160,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    columnHelper.accessor('payroll_entity', {
      header: 'Payroll Entity',
      size: 160,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    columnHelper.accessor('location', {
      header: 'Location',
      size: 160,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    columnHelper.accessor('sub_location', {
      header: 'Sub Location',
      size: 160,
      cell: (info) => <TruncatedCell value={info.getValue()} maxWidth="140px" />,
    }),
    // Comma-separated across every BU an employee is mapped to (not one badge per BU — a login
    // mapped to a dozen BUs would otherwise blow out the row height) — TruncatedCell already
    // gives the "…" truncation + full value on hover this needs, same as every other text column.
    columnHelper.display({
      id: 'entity_name',
      header: 'Entity Name',
      size: 160,
      cell: ({ row }) => <TruncatedCell value={getEmployeeEntityNames(row.original)} maxWidth="140px" />,
    }),
    columnHelper.display({
      id: 'bu_name',
      header: 'BU Name',
      size: 160,
      cell: ({ row }) => <TruncatedCell value={getEmployeeBuNames(row.original)} maxWidth="140px" />,
    }),
    columnHelper.display({
      id: 'sub_bu_name',
      header: 'Sub BU Name',
      size: 160,
      cell: ({ row }) => <TruncatedCell value={getEmployeeSubBuNames(row.original)} maxWidth="140px" />,
    }),
    columnHelper.accessor('total_experience', {
      header: 'Total Experience',
      size: 120,
      cell: (info) => {
        const val = info.getValue();
        return val != null
          ? <span className="text-sm tabular-nums whitespace-nowrap">{val} yrs</span>
          : <span className="text-sm text-muted-foreground">—</span>;
      },
    }),
    columnHelper.accessor('company_experience', {
      header: 'Company Experience',
      size: 140,
      cell: (info) => {
        const val = info.getValue();
        return val != null
          ? <span className="text-sm tabular-nums whitespace-nowrap">{val} yrs</span>
          : <span className="text-sm text-muted-foreground">—</span>;
      },
    }),
    columnHelper.accessor('date_of_joining', {
      header: 'Joined',
      size: 110,
      cell: (info) => <span className="text-sm whitespace-nowrap">{formatDate(info.getValue())}</span>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 140,
      // Activating/deactivating an employee is a change to the RECORD, not a mapping — read-only
      // badge for a login that can't manage records, same data either way.
      cell: (info) => (canManageEmployees
        ? <StatusToggle employee={info.row.original} disabled={isProtectedSuperAdmin(info.row.original)} />
        : <StatusBadge status={info.getValue()} />),
    }),
    columnHelper.accessor('is_timesheet_approval_required', {
      header: 'Timesheet Approval',
      size: 150,
      // Straight from the API response, same as every other status-like column here — never
      // computed client-side.
      cell: (info) => {
        const required = info.getValue() ?? true;
        return (
          <Badge variant={required ? 'secondary' : 'outline'} className="text-xs">
            {required ? 'Required' : 'Not Required'}
          </Badge>
        );
      },
    }),
  ], [navigate, isHR, canManageEmployees, entityIdByBuId, entityNameById]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  // "Business Units" alone still accepts "Parent -> Sub" to target a Sub-BU nested under a
  // Parent — equivalent to naming the Parent in "Business Units" and its Sub-BU in the separate
  // "Sub BU" column below (row 2). Note: this is no longer the same shape the Export Excel button
  // writes — that export now emits one row per BU mapping (see buExportRows/handleExportExcel
  // above), so a multi-BU employee's exported file has several rows for that one employee and
  // isn't a drop-in re-import template; only this single-row-per-employee sample format is.
  const handleDownloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([
      // Row 1: a Business Unit with no Sub-BUs — Sub BU stays blank.
      {
        'Employee Code': 'EMP-0076',
        'Full Name': 'Omkar Patil',
        'Designation': 'Software Engineer',
        'Total Experience': 5.2,
        'Company Experience': 2.1,
        'Email ID': 'omkar@example.com',
        'Resource Description': 'Java, React',
        'Payroll Entity': 'GTT India Pvt Ltd',
        'Location': 'Pune',
        'Sub Location': 'Hinjewadi',
        'Original Entity': 'GTT Client Entity',
        'Date of Joining': '2023-01-15',
        'Date of Leaving': '',
        'Business Units': 'Finance BU',
        'Entity Name': '',
        'Sub BU': '',
      },
      // Row 2: a Business Unit that has Sub-BUs — Sub BU is required (here via the separate
      // column; "Delivery BU -> Delivery Sub BU" inside "Business Units" itself means the same
      // thing).
      {
        'Employee Code': 'EMP-0077',
        'Full Name': 'Priya Sharma',
        'Designation': 'Business Analyst',
        'Total Experience': 3.0,
        'Company Experience': 1.5,
        'Email ID': 'priya@example.com',
        'Resource Description': 'SQL, Power BI',
        'Payroll Entity': 'GTT India Pvt Ltd',
        'Location': 'Pune',
        'Sub Location': 'Hinjewadi',
        'Original Entity': 'GTT Client Entity',
        'Date of Joining': '2024-03-01',
        'Date of Leaving': '',
        'Business Units': 'Delivery BU',
        'Entity Name': '',
        'Sub BU': 'Delivery Sub BU',
      },
      // Row 3: this Business Unit name happens to exist under more than one of the user's
      // Entities — Entity Name is required to pick which one.
      {
        'Employee Code': 'EMP-0078',
        'Full Name': 'Rahul Deshmukh',
        'Designation': 'HR Executive',
        'Total Experience': 4.0,
        'Company Experience': 1.0,
        'Email ID': 'rahul@example.com',
        'Resource Description': 'Recruitment, Payroll',
        'Payroll Entity': 'GTT India Pvt Ltd',
        'Location': 'Pune',
        'Sub Location': 'Hinjewadi',
        'Original Entity': 'GTT Client Entity',
        'Date of Joining': '2022-07-01',
        'Date of Leaving': '',
        'Business Units': 'HR BU',
        'Entity Name': 'Entity 1',
        'Sub BU': '',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employee_sample.xlsx");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length > 0) {
          setPreviewData(data);
          setPreviewLimit(5);
          setPreviewFile(file);
          setIsPreviewOpen(true);
        }
      } catch (error) {
        showError('Failed to parse Excel file.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Shared by both the mutation's onSuccess and its onError-with-a-body branch below — either way
  // the response carries the same { total, imported, error_rows } shape, and either way the user
  // needs the same "how many actually made it in" toast, not just a silent result screen.
  const notifyImportResult = (result) => {
    const data = result?.data || result;
    const errors = data.error_rows || data.errors || data.failed || [];
    const total = data.total ?? data.total_processed ?? 0;
    const imported = data.imported ?? data.success_count ?? 0;
    if (errors.length > 0) {
      warning(`Imported ${imported} of ${total}. ${errors.length} row(s) need fixing — see Error Rows.`);
    } else {
      success(`Imported ${imported} of ${total} rows successfully.`);
    }
  };

  const handleConfirmImport = () => {
    if (!previewFile) return;

    importMutation.mutate(previewFile, {
      onSuccess: (res) => {
        setImportResult(res);
        notifyImportResult(res);
        setIsPreviewOpen(false);
        setPreviewFile(null);
        setPreviewData(null);
      },
      onError: (err) => {
        // If the backend returns a 400 with a detailed error array, capture it
        if (err.response?.data) {
          setImportResult(err.response.data);
          notifyImportResult(err.response.data);
          setIsPreviewOpen(false);
          setPreviewFile(null);
          setPreviewData(null);
        } else {
          showError(extractApiError(err));
        }
      }
    });
  };

  const getExportParams = () => ({
    status: statusFilter,
    ...(roleFilter !== 'all' && { role_id: roleFilter }),
    ...(isBuFiltered && { businessUnitIds: buIds.join(',') }),
    ...(isEntityFiltered && { entityIds: entityIds.join(',') }),
    ...(debouncedSearch && debouncedSearch.length >= 3 && { search: debouncedSearch }),
  });

  // The real backend caps `limit` at 200 per request (bakend/src/validations/employeeValidation.js)
  // and rejects anything higher outright, so exports/print page through it instead of asking for
  // everything in one call.
  const EXPORT_PAGE_LIMIT = 200;

  const fetchAllEmployeesForExport = async (filterParams) => {
    const all = [];
    let page = 1;
    let total = Infinity;
    while (all.length < total) {
      const res = await employeesApi.getAll({ ...filterParams, page, limit: EXPORT_PAGE_LIMIT });
      const batch = res?.data ?? [];
      if (!batch.length) break;
      all.push(...batch);
      total = res?.meta?.total ?? all.length;
      page += 1;
    }
    // Page boundaries can return the same employee twice — keep each one once.
    return [...new Map(all.map((emp) => [emp.id ?? emp.employee_code, emp])).values()];
  };

  // Excel export rows for one employee's Business Units, as { businessUnit, subBu }:
  //  - a Sub-BU mapping -> { its Parent's name, its own name }
  //  - a Parent mapped together with one of its own Sub-BUs is already covered by that
  //    Sub-BU's row, so it gets no extra blank-Sub-BU row of its own
  //  - any other BU -> { its own name, '' }
  //  - no BU at all -> a single blank row, so the employee still appears in the export
  const buExportRows = (emp) => {
    // GET /employees returns `business_units` (snake_case) — reading only `businessUnits`
    // left the export's BU column blank for every employee.
    const units = emp.business_units ?? emp.businessUnits ?? [];
    const coveredParentIds = new Set(
      units.map((bu) => bu.parent_business_unit_id).filter((id) => id != null)
    );
    const rows = units
      .filter((bu) => bu.parent_business_unit_id != null || !coveredParentIds.has(bu.id))
      .map((bu) => {
        const name = bu.name ?? bu.company_name ?? '';
        return bu.parent_business_unit_id != null && bu.parent_business_unit_name
          ? { businessUnit: bu.parent_business_unit_name, subBu: name }
          : { businessUnit: name, subBu: '' };
      })
      .sort((a, b) => a.businessUnit.localeCompare(b.businessUnit) || a.subBu.localeCompare(b.subBu));
    return rows.length > 0 ? rows : [{ businessUnit: '', subBu: '' }];
  };

  const handleExportExcel = async () => {
    try {
      const data = await fetchAllEmployeesForExport(getExportParams());
      if (data.length === 0) {
        showError("No data to export");
        return;
      }
      // One row per employee — their BUs and Sub-BUs are joined into the two columns (never
      // repeated rows). The paged fetch is also de-duplicated by id in case a page boundary
      // returns the same employee twice.
      const uniqueData = [...new Map(data.map((emp) => [emp.id ?? emp.employee_code, emp])).values()];
      const joinUnique = (values) => [...new Set(values.filter(Boolean))].join(', ');
      const exportData = uniqueData.map((emp) => {
        const rows = buExportRows(emp);
        const bu = {
          businessUnit: joinUnique(rows.map((r) => r.businessUnit)),
          subBu: joinUnique(rows.map((r) => r.subBu)),
        };
        return {
        'Employee ID': emp.employee_code,
        'Name': emp.full_name,
        'Email ID': emp.email,
        'Designation': emp.designation,
        'Payroll Entity': emp.payroll_entity,
        'Location': emp.location,
        'Sub Location': emp.sub_location,
        'Original Entity': emp.original_entity,
        'Business Unit': bu.businessUnit,
        'Sub BU': bu.subBu,
        'Total Experience (yrs)': emp.total_experience,
        'Company Experience (yrs)': emp.company_experience,
        'Joined Date': formatDate(emp.date_of_joining),
        'Status': emp.status,
        'Timesheet Approval': (emp.is_timesheet_approval_required ?? true) ? 'Required' : 'Not Required'
        };
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Employees");
      XLSX.writeFile(wb, "employees_export.xlsx");
      success("Exported to Excel successfully");
    } catch (error) {
      console.error("Excel Export Error:", error);
      showError("Failed to export Excel");
    }
  };

  const handleExportPDF = async () => {
    try {
      const data = await fetchAllEmployeesForExport(getExportParams());
      if (data.length === 0) {
        showError("No data to export");
        return;
      }
      const doc = new jsPDF();
      doc.text("Employees List", 14, 15);
      
      const tableColumn = ["ID", "Name", "Email", "Designation", "Total Exp", "Comp Exp", "Status"];
      const tableRows = [];

      data.forEach(emp => {
        const rowData = [
          emp.employee_code,
          emp.full_name,
          emp.email,
          emp.designation,
          emp.total_experience || '-',
          emp.company_experience || '-',
          emp.status
        ];
        tableRows.push(rowData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
      });
      doc.save("employees_export.pdf");
      success("Exported to PDF successfully");
    } catch (error) {
      console.error("PDF Export Error:", error);
      showError("Failed to export PDF");
    }
  };

  const handlePrint = async () => {
    try {
      const data = await fetchAllEmployeesForExport(getExportParams());
      if (data.length === 0) {
        showError("No data to print");
        return;
      }
      
      const printWindow = window.open('', '', 'width=800,height=600');
      printWindow.document.write(`
        <html>
          <head>
            <title>Employees List</title>
            <style>
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              body { font-family: sans-serif; padding: 20px; }
            </style>
          </head>
          <body>
            <h2>Employees List</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Designation</th>
                  <th>Total Exp</th>
                  <th>Comp Exp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.map(emp => `
                  <tr>
                    <td>${emp.employee_code || ''}</td>
                    <td>${emp.full_name || ''}</td>
                    <td>${emp.email || ''}</td>
                    <td>${emp.designation || ''}</td>
                    <td>${emp.total_experience || '-'}</td>
                    <td>${emp.company_experience || '-'}</td>
                    <td>${emp.status || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    } catch (error) {
      console.error("Print Error:", error);
      showError("Failed to print");
    }
  };

  const renderImportResults = () => {
    if (!importResult) return null;
    
    const data = importResult.data || importResult;
    const errors = data.error_rows || data.errors || data.failed || [];
    const total = data.total ?? data.total_processed ?? 0;
    const imported = data.imported ?? data.success_count ?? 0;
    // `skipped` (from the API) counts DUPLICATE rows only — validation errors (missing required
    // field, invalid reference, etc.) come back in `errors` with `skipped` still 0. The error table
    // used to be gated on `skipped > 0`, so a sheet that was 100% validation errors (no duplicates
    // at all) rendered NO error table and just "0 imported" with nothing to explain why.
    const skipped = data.skipped ?? data.error_count ?? 0;
    // Rows that failed for a reason OTHER than "duplicate" — a plain validation failure.
    const failed = Math.max(0, errors.length - skipped);

    return (
      <div className="space-y-5">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">Total rows:</span>
            <span className="font-mono text-xs font-semibold">{total}</span>
          </div>
          <Badge className="gap-1.5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {imported} imported
          </Badge>
          {skipped > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {skipped} duplicates skipped
            </Badge>
          )}
          {failed > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {failed} failed
            </Badge>
          )}
        </div>

        {/* Error rows */}
        {errors.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error Rows ({errors.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-destructive/5">
                      <TableHead className="w-24 sticky top-0 bg-red-50">Row #</TableHead>
                      <TableHead className="sticky top-0 bg-red-50">Error Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errors.map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-destructive/5">
                        <TableCell className="font-mono text-xs align-top">
                          {row.row ?? row.rowNumber ?? row.row_number ?? idx + 1}
                        </TableCell>
                        <TableCell className="text-sm text-destructive whitespace-pre-line">
                          {row.errors?.length > 0
                            ? row.errors.join('\n')
                            : row.message ?? row.error_message ?? row.error ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {errors.length === 0 && (
          <div className="text-center py-8 text-green-600 bg-green-50 rounded-md border border-green-100">
             All records were imported successfully!
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Employees"
        actions={
          <>
            {/* Desktop toolbar — unchanged from the original layout. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <SearchInput
                placeholder="Search by name, code, email..."
                value={search}
                onChange={handleSearch}
                className="w-[250px]"
                inputClassName="bg-white"
              />
              <FilterToggleButton
                isOpen={filtersOpen}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                activeCount={activeFilterCount}
              />
              {isHR && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="toolbar" className="bg-white">
                      <FileDown className="h-4 w-4" /> Export <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                      <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                      Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                      <FileText className="mr-2 h-4 w-4 text-red-500" />
                      PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePrint} className="cursor-pointer">
                      <Printer className="mr-2 h-4 w-4 text-slate-600" />
                      Print / View
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canManageEmployees && (
                <Button variant="outline" size="toolbar" className="bg-white" onClick={handleDownloadSample}>
                  <Download className="h-4 w-4" /> Sample
                </Button>
              )}
              {canManageEmployees && (
                <Button
                  variant="outline"
                  size="toolbar"
                  className="bg-white"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                >
                  <Upload className="h-4 w-4" />
                  {importMutation.isPending ? 'Importing…' : 'Import Excel'}
                </Button>
              )}
              {canManageEmployees && !isPreviewOpen && !importResult && (
                <Button size="toolbar" onClick={() => navigate(ROUTES.EMPLOYEE_NEW)}>
                  <Plus className="h-4 w-4" /> Add Employee
                </Button>
              )}
            </div>
            {/* Mobile header — only a compact primary action stays up top; search/filters/more
                move into their own row below the header (see the md:hidden block after
                PageHeader). */}
            {canManageEmployees && !isPreviewOpen && !importResult && (
              <Button size="toolbar" className="md:hidden" onClick={() => navigate(ROUTES.EMPLOYEE_NEW)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
            {/* The Import Excel file input must stay mounted (not conditionally rendered only in
                the desktop block above) so both the desktop button and the mobile "More" menu
                item can trigger the same ref-driven picker. */}
            {canManageEmployees && (
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx,.csv"
                onChange={handleFileUpload}
              />
            )}
          </>
        }
      />

      {/* Mobile toolbar — employee count, full-width search, and a compact Filters + More row.
          Reuses the exact same state/handlers as the desktop toolbar above; only the layout differs. */}
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          {meta.total ?? employees.length} employee{(meta.total ?? employees.length) === 1 ? '' : 's'}
        </p>
        <SearchInput
          placeholder="Search employees..."
          value={search}
          onChange={handleSearch}
          className="w-full"
          inputClassName="h-10 bg-white"
        />
        <div className="flex items-center justify-between gap-2">
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={activeFilterCount}
          />
          {(isHR || canManageEmployees) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="toolbar" className="h-10 bg-white">
                  <MoreVertical className="h-4 w-4" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isHR && (
                  <>
                    <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                      <FileSpreadsheet className="h-4 w-4 text-green-600" /> Export Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                      <FileText className="h-4 w-4 text-red-500" /> Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePrint} className="cursor-pointer">
                      <Printer className="h-4 w-4 text-slate-600" /> Print / View
                    </DropdownMenuItem>
                  </>
                )}
                {canManageEmployees && (
                  <>
                    <DropdownMenuItem onClick={handleDownloadSample} className="cursor-pointer">
                      <Download className="h-4 w-4" /> Sample
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer"
                      disabled={importMutation.isPending}
                    >
                      <Upload className="h-4 w-4" /> {importMutation.isPending ? 'Importing…' : 'Import Excel'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <SegmentedToggle
            options={[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(1); }}
            className="bg-white"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Role</Label>
          <SearchableSelect
            options={[
              { label: "All roles", value: "all" },
              ...roleFilterOptions.map((r) => ({
                label: r.role_name,
                value: String(r.id)
              }))
            ]}
            value={roleFilter}
            onValueChange={(v) => { setRoleFilter(v); setPage(1); }}
            placeholder="All roles"
            searchPlaceholder="Search role..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
        {showEntityFilter && (
          <EntityFilter multiple value={entityIds} onChange={(v) => { setEntityIds(v); setPage(1); }} />
        )}
        {showBuFilter && (
          <BusinessUnitFilter
            multiple
            value={buIds}
            entityId={entityIds}
            onChange={(v) => { setBuIds(v); setPage(1); }}
          />
        )}
      </FilterPanel>

      {importResult ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Import Results</h3>
            <Button variant="outline" onClick={() => setImportResult(null)}>
              Back to Employees
            </Button>
          </div>
          {renderImportResults()}
        </div>
      ) : isPreviewOpen ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-lg font-medium text-slate-800">Preview Import Data</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[min(518px,60vh)]">
              {previewData && previewData.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {previewData[0]?.map((header, i) => (
                        <TableHead key={i} className="whitespace-nowrap font-semibold sticky top-0 bg-muted/50">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(1, previewLimit + 1).map((row, i) => (
                      <TableRow key={i}>
                        {previewData[0].map((_, colIndex) => (
                          <TableCell key={colIndex} className="whitespace-nowrap py-3 text-sm">
                            {row[colIndex] != null ? row[colIndex].toString() : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {previewData.length > previewLimit + 1 && (
                      <TableRow>
                        <TableCell colSpan={previewData[0].length} className="text-center bg-muted/10 py-4">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => setPreviewLimit(prev => Math.min(prev + 10, previewData.length - 1))}
                          >
                            Show more rows ({previewData.length - previewLimit - 1} remaining)
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-3 bg-muted/10">
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)} disabled={importMutation.isPending}>
                Cancel
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirmImport} disabled={importMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {importMutation.isPending ? 'Importing…' : 'Confirm Import'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table — unchanged, including frozen/sticky columns. */}
          <DataTable
            className="hidden md:flex"
            columns={columns}
            data={employees}
            isLoading={isPending}
            toolbar={null}
            pagination={meta.total != null ? {
              page: meta.current_page ?? page,
              limit: meta.per_page ?? limit,
              total: meta.total,
            } : undefined}
            sorting={sorting}
            onSortingChange={(s) => { setSorting(s); setPage(1); }}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
            onRowClick={canManageEmployees ? (row) => { if (!isProtectedSuperAdmin(row)) navigate(buildPath(ROUTES.EMPLOYEE_EDIT, { id: row.id })); } : undefined}
          />

          {/* Mobile — compact card list instead of the frozen-column table, same data/handlers. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {isPending ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))
              ) : employees.length === 0 ? (
                <EmptyState title="No records found" description="Try adjusting your search or filters." />
              ) : (
                employees.map((emp) => (
                  <div
                    key={emp.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors',
                      canManageEmployees && !isProtectedSuperAdmin(emp) && 'active:bg-slate-50'
                    )}
                    onClick={canManageEmployees && !isProtectedSuperAdmin(emp) ? () => navigate(buildPath(ROUTES.EMPLOYEE_EDIT, { id: emp.id })) : undefined}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback>{getInitials(emp.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{emp.full_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {emp.employee_code}
                        {' · '}
                        <span className={emp.status === 'active' ? 'text-green-600' : 'text-slate-400'}>
                          {emp.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          aria-label="Employee actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => setViewTarget(emp)}>
                          <Eye className="h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        {isHR && !isProtectedSuperAdmin(emp) && canManageEmployees && (
                          <DropdownMenuItem onClick={() => navigate(buildPath(ROUTES.EMPLOYEE_EDIT, { id: emp.id }))}>
                            <Pencil className="h-4 w-4" /> Edit Employee
                          </DropdownMenuItem>
                        )}
                        {isHR && !isProtectedSuperAdmin(emp) && (
                          <DropdownMenuItem onClick={() => setMappingTarget(emp)}>
                            <UserCog className="h-4 w-4" /> Manage Roles / Permissions
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>

            {meta.total != null && (() => {
              const mobileLimit = meta.per_page ?? limit;
              const mobilePage = meta.current_page ?? page;
              const totalPages = Math.max(1, Math.ceil(meta.total / mobileLimit));
              return (
                <div className="flex shrink-0 items-center justify-between border-t pt-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Showing {meta.total === 0 ? 0 : ((mobilePage - 1) * mobileLimit) + 1}–{Math.min(mobilePage * mobileLimit, meta.total)} of {meta.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setPage(mobilePage - 1)}
                      disabled={mobilePage <= 1 || isPending}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2 text-xs text-muted-foreground">
                      {mobilePage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setPage(mobilePage + 1)}
                      disabled={mobilePage >= totalPages || isPending}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}

      <RoleBuMappingDialog
        employee={mappingTarget}
        actorRoleName={actorRoleName}
        allRoles={rolesData?.data ?? []}
        businessUnits={mappingDialogBusinessUnits}
        onOpenChange={(open) => !open && setMappingTarget(null)}
      />

      <EmployeeViewDrawer
        employeeId={viewTarget?.id}
        employeeName={viewTarget?.full_name}
        open={!!viewTarget}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />

      <Outlet />
    </div>
  );
};

export default EmployeeList;
