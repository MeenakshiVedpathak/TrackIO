import { useState } from 'react';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { ALL_BUS } from '@/components/common/BusinessUnitFilter';
import { ALL_ENTITIES } from '@/components/common/EntityFilter';

// The Master screens' own Business Unit filter state, paired with components/common/
// BusinessUnitFilter (the same control the Reports suite uses).
//
// Availability comes from useSelectableBusinessUnits, exactly as the control's own does, so the
// two can't disagree: the filter is offered whenever the login has more than one BU to choose
// between — the login's mapped BUs for a BU Admin/BU Head, the BU master for an Admin or Entity
// Admin (who have no mapping of their own and would otherwise get no filter at all). A login with
// a single BU gets none: the navbar already pins every screen to it, and 'all' resolves to that
// same BU anyway.
//
// Defaults to "All Business Units", same as Reports: a master opens showing every BU the login
// can reach, and narrowing to one is an explicit choice made here. That also means these screens
// no longer follow the navbar switcher — picking a BU here never changes the global selection or
// any other screen.
export const useMasterBuFilter = ({ enabled = true } = {}) => {
  const { canFilter } = useSelectableBusinessUnits();
  const { canFilter: canFilterEntity } = useSelectableEntities();

  const showBuFilter = enabled && canFilter;
  const showEntityFilter = enabled && canFilterEntity;

  const [entityId, setEntityIdState] = useState(ALL_ENTITIES);
  const [buId, setBuId] = useState(ALL_BUS);

  // Picking a different Entity resets the BU choice — whatever was selected may not even belong
  // to the new Entity, and BusinessUnitFilter's own options are about to change out from under it.
  const setEntityId = (id) => {
    setEntityIdState(id);
    setBuId(ALL_BUS);
  };

  return {
    entityId,
    setEntityId,
    showEntityFilter,
    // For the screen's active-filter badge: only counts once the user has narrowed to one Entity.
    isEntityFiltered: showEntityFilter && entityId !== ALL_ENTITIES,
    resetEntityId: () => setEntityIdState(ALL_ENTITIES),
    buId,
    setBuId,
    showBuFilter,
    // For the screen's active-filter badge: only counts once the user has narrowed to one BU.
    isBuFiltered: showBuFilter && buId !== ALL_BUS,
    resetBuId: () => setBuId(ALL_BUS),
    // Spread into the list query's params. `buId` is a pseudo-param: it rides along inside the
    // params object so it lands in the React Query key and refetches on change, but the api layer
    // pulls it out and turns it into the request's BU scope (X-Company-Id) rather than a
    // query-string field — see reports.api.js's getReport, where this convention started.
    // Omitted entirely when there's no filter, which leaves the global header behaviour untouched.
    // `entity_id` (snake_case, matching CompanyList's own already-working Entity filter) rides
    // along as a real query-string field instead — none of the Master api.js `getAll` functions
    // destructure/strip it, so it passes straight through to the backend.
    buParams: {
      ...(showBuFilter ? { buId } : {}),
      ...(showEntityFilter && entityId !== ALL_ENTITIES ? { entity_id: entityId } : {}),
    },
  };
};

export default useMasterBuFilter;
