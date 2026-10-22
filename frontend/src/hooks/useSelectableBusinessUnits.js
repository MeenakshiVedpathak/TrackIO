import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCompanies } from '@/hooks/useCompanies';
import { canScopeAcrossBus } from '@/services/apiClient';

// The single source of truth for "which Business Units can THIS login narrow a screen to" —
// shared by components/common/BusinessUnitFilter (what the dropdown offers) and
// hooks/useMasterBuFilter (whether a Master shows the control at all), so the two can never
// disagree about whether a filter is available.
//
// Where the options come from depends on the login, because the two kinds of login have their
// BUs in different places:
//
//   · Cross-BU logins — Admin, Entity Admin, Platform Admin (canScopeAcrossBus). These carry no
//     company_id of their own, so `useAuth().businessUnits` is typically EMPTY for them, and a
//     filter built from it would silently render nothing. That was the actual bug: an Admin —
//     the one role that sees every BU at once and therefore needs the filter most — got no BU
//     filter anywhere. Their options come from the BU master instead (GET /companies, already
//     scoped server-side to the caller's own Entities), which is the same source Service PO
//     Master and Employee Master already used for their own hand-rolled Admin BU filters.
//
//   · BU-scoped logins — BU Admin, BU Head, and below. Their reach IS their mapping, so their
//     own `businessUnits[]` is authoritative and needs no request.
//
// `canFilter` encodes the product rule for both: offer the filter only when there are at least
// two BUs to choose between. An Admin on a single-BU tenant, or a BU Admin mapped to exactly one
// BU, has nothing to narrow — the control would be a no-op, and for the single-BU login their one
// BU already IS "all of theirs" (see explicitBuScope, which resolves 'all' to that BU's header).
//
// `entityId` (optional) narrows the returned `units` to one Entity's BUs — the Entity filter that
// sits above this one in every Filters panel (see components/common/EntityFilter). `canFilter` is
// deliberately computed off the UNNARROWED set: picking an Entity whose BUs happen to number
// exactly one must not make the BU filter disappear out from under the user, only shrink its
// options down to that one BU.
export const useSelectableBusinessUnits = (entityId) => {
  const { businessUnits } = useAuth();
  const isCrossBu = canScopeAcrossBus();

  // Fetched for every login now (not just cross-BU ones): it's the BU list itself for a cross-BU
  // login, and — just as importantly — the ONLY source that reliably carries entity_id per BU for
  // a BU-scoped one. The login's own `businessUnits[]` mapping (GET /employees/:id/business-units)
  // does not include entity info at all, confirmed live: a multi-BU login's Entity dropdown came
  // back empty everywhere that tried to read bu.entity_id directly off it. GET /companies is
  // already scoped server-side to the caller (see companies.api.js) and confirmed readable
  // read-only by the BU-scoped senior tier too (see CompanyList.jsx), so this degrades safely for
  // any login it isn't authorized for: the query just errors silently and entityId stays null,
  // same as today.
  // Long staleTime because this mounts on every report and master a cross-BU login opens, and the
  // BU master changes rarely.
  // Bumped from 200 -> 500 (matches the backend's own "load full list" limit cap) — a truncated
  // fetch here wouldn't just drop a few options, it could silently strand a Sub-BU whose Parent
  // BU fell outside the first 200 rows, or vice versa, breaking the hierarchy the tree selector
  // builds client-side from this exact list.
  const { data: companiesData, isPending: isLoadingBuMaster } = useCompanies(
    { status: 'active', limit: 500 },
    { staleTime: 1000 * 60 * 10 }
  );

  const entityByBuId = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      map.set(String(c.id), c.entity_id ?? c.entity?.id ?? null);
    });
    return map;
  }, [companiesData]);

  // Same fallback pattern as entityByBuId — the BU-scoped login's own `businessUnits[]` mapping
  // (GET /employees/:id/business-units) isn't confirmed to carry `parent_business_unit_id` any
  // more than it carries entity_id (see the file-header comment), so this covers it from the BU
  // master (GET /companies) the same way.
  const parentByBuId = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      map.set(String(c.id), c.parent_business_unit_id ?? null);
    });
    return map;
  }, [companiesData]);

  // Normalized to { id, name, entityId, parentId } — the BU master calls it `company_name`, the
  // login's own mapping calls it `name`. `parentId` is null for a top-level Parent BU, or the id
  // of the Parent BU a Sub-BU belongs to — this is what lets a BU selector group Sub-BUs under
  // their parent instead of showing one flat list.
  const allUnits = useMemo(() => {
    if (isCrossBu) {
      return (companiesData?.data ?? []).map((c) => ({
        id: c.id,
        name: c.company_name,
        entityId: c.entity_id ?? c.entity?.id ?? null,
        parentId: c.parent_business_unit_id ?? null,
      }));
    }
    const mapped = (businessUnits ?? []).map((bu) => ({
      id: bu.id,
      name: bu.name,
      entityId: bu.entity_id ?? bu.entityId ?? entityByBuId.get(String(bu.id)) ?? null,
      parentId: bu.parent_business_unit_id ?? bu.parentId ?? parentByBuId.get(String(bu.id)) ?? null,
    }));
    // A BU-scoped login explicitly mapped to a top-level Parent BU manages that BU as a whole —
    // every one of its Sub-BUs belongs in `units` too, not just whichever specific Sub-BU(s) this
    // login also happens to carry an individual mapping row for (confirmed live: a BU Admin mapped
    // to "DATA + AI" + its own "DAS" mapping saw only DAS as a pickable Sub-BU everywhere — Client/
    // Project/Service PO creation, every BU filter — with "IBM"/"NON IBM" invisible despite being
    // siblings under the same Parent this login manages). This only ever expands DOWNWARD from an
    // explicitly-mapped Parent — being mapped to just one Sub-BU never grants visibility into its
    // Parent or that Parent's other, unrelated Sub-BUs, which would be a real over-grant.
    const mappedIds = new Set(mapped.map((u) => String(u.id)));
    const mappedRootIds = new Set(mapped.filter((u) => u.parentId == null).map((u) => String(u.id)));
    const unmappedSiblings = (companiesData?.data ?? [])
      .filter((c) => {
        const parentId = c.parent_business_unit_id ?? c.parent?.id;
        return parentId != null && mappedRootIds.has(String(parentId)) && !mappedIds.has(String(c.id));
      })
      .map((c) => ({
        id: c.id,
        name: c.company_name,
        entityId: c.entity_id ?? c.entity?.id ?? null,
        parentId: c.parent_business_unit_id ?? c.parent?.id ?? null,
      }));
    return [...mapped, ...unmappedSiblings];
  }, [isCrossBu, companiesData, businessUnits, entityByBuId, parentByBuId]);

  // `entityId` also accepts an array (the multi-select EntityFilter's value) — an empty array
  // means "no Entity narrowing" (matches the scalar 'all'/null case), same "no filter" semantics
  // the new backend entityIds param uses.
  const units = useMemo(() => {
    if (Array.isArray(entityId)) {
      if (entityId.length === 0) return allUnits;
      const wanted = new Set(entityId.map(String));
      return allUnits.filter((u) => wanted.has(String(u.entityId)));
    }
    if (entityId == null || entityId === 'all') return allUnits;
    return allUnits.filter((u) => String(u.entityId) === String(entityId));
  }, [allUnits, entityId]);

  // `isLoading` — whether the BU master fetch this hook relies on (for entity/parent enrichment on
  // a BU-scoped login, or as the primary source for a cross-BU one) is still in flight. A caller
  // that resolves a saved record's BU against `units.find(...)` on load (e.g. detecting whether it
  // was actually a Sub-BU) needs this to avoid running that lookup against a still-empty/unenriched
  // `units` and permanently misreading the result — see ServicePOForm.jsx's `buUnitsReady`.
  return { units, isCrossBu, canFilter: allUnits.length > 1, isLoading: isLoadingBuMaster };
};

export default useSelectableBusinessUnits;
