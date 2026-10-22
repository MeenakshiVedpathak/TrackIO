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
  const { data: companiesData } = useCompanies(
    { status: 'active', limit: 200 },
    { staleTime: 1000 * 60 * 10 }
  );

  const entityByBuId = useMemo(() => {
    const map = new Map();
    (companiesData?.data ?? []).forEach((c) => {
      map.set(String(c.id), c.entity_id ?? c.entity?.id ?? null);
    });
    return map;
  }, [companiesData]);

  // Normalized to { id, name, entityId } — the BU master calls it `company_name`, the login's own
  // mapping calls it `name`.
  const allUnits = useMemo(() => {
    if (isCrossBu) {
      return (companiesData?.data ?? []).map((c) => ({ id: c.id, name: c.company_name, entityId: c.entity_id ?? c.entity?.id ?? null }));
    }
    return (businessUnits ?? []).map((bu) => ({
      id: bu.id,
      name: bu.name,
      entityId: bu.entity_id ?? bu.entityId ?? entityByBuId.get(String(bu.id)) ?? null,
    }));
  }, [isCrossBu, companiesData, businessUnits, entityByBuId]);

  const units = useMemo(() => {
    if (entityId == null || entityId === 'all') return allUnits;
    return allUnits.filter((u) => String(u.entityId) === String(entityId));
  }, [allUnits, entityId]);

  return { units, isCrossBu, canFilter: allUnits.length > 1 };
};

export default useSelectableBusinessUnits;
