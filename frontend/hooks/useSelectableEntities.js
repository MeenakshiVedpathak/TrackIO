import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useActiveEntities } from '@/hooks/useEntities';
import { useCompanies } from '@/hooks/useCompanies';
import { canScopeAcrossBus } from '@/services/apiClient';

// The Entity-level sibling of useSelectableBusinessUnits — "which Entities can THIS login narrow a
// screen to", so components/common/EntityFilter and every BU filter it sits above agree on when an
// Entity choice is even offered.
//
//   · Cross-BU logins — Admin, Entity Admin, Platform Admin. Their options come from GET /entities
//     (useActiveEntities), already scoped server-side to the caller's own Entities — an Entity
//     Admin sees only the Entities they administer, Admin/Platform Admin see all.
//
//   · BU-scoped logins — BU Admin, BU Head, and below. There is no GET /entities call for them
//     (it 403s a BU-scoped login — see ServicePOMapping's own Entity/BU filter comment). Their
//     options are the distinct Entities behind their own mapped `businessUnits[]` — but that
//     mapping (GET /employees/:id/business-units) doesn't carry entity info itself, confirmed
//     live (an Entity dropdown built straight off it came back empty for a multi-BU login). So
//     each BU id is looked up against the company master (GET /companies) instead, same source
//     useSelectableBusinessUnits now uses for the same reason — already scoped server-side to the
//     caller and confirmed readable read-only by the BU-scoped senior tier (see CompanyList.jsx),
//     so a role it truly isn't authorized for just gets an empty lookup and the filter stays
//     hidden, the same "nothing to narrow" fallback `canFilter` already encodes below.
//
// `canFilter` mirrors useSelectableBusinessUnits' rule: offer the filter only when there are at
// least two Entities to choose between.
export const useSelectableEntities = () => {
  const { businessUnits } = useAuth();
  const isCrossBu = canScopeAcrossBus();

  const { data: activeEntities } = useActiveEntities({ enabled: isCrossBu });
  const { data: companiesData } = useCompanies(
    { status: 'active', limit: 200 },
    { enabled: !isCrossBu, staleTime: 1000 * 60 * 10 }
  );

  const entities = useMemo(() => {
    if (isCrossBu) {
      return (activeEntities ?? []).map((e) => ({ id: e.id, name: e.entity_name }));
    }
    const myBuIds = new Set((businessUnits ?? []).map((bu) => String(bu.id)));
    const byId = new Map();
    (companiesData?.data ?? [])
      .filter((c) => myBuIds.has(String(c.id)))
      .forEach((c) => {
        const id = c.entity_id ?? c.entity?.id;
        const name = c.entity?.entity_name;
        if (id != null && name && !byId.has(id)) byId.set(id, { id, name });
      });
    return Array.from(byId.values());
  }, [isCrossBu, activeEntities, companiesData, businessUnits]);

  return { entities, isCrossBu, canFilter: entities.length > 1 };
};

export default useSelectableEntities;
