import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectIsLogDescMandatory, selectLogDescMandatoryPOIds } from '@/store/slices/authSlice';

// Entity rule is_log_desc_mandatory — true when at least one of the employee's Service POs
// (via its BU's Entity) requires a description. Stored at login and kept fresh by the
// /employee-timesheets daily | monthly | entries reads.
export const useLogDescMandatory = () => useSelector(selectIsLogDescMandatory);

// Per-Service-PO check: (servicePOId) => boolean. A PO needs a description only when its own
// Entity has the rule on — an employee mapped across Entities gets mandatory descriptions on
// the "on" Entity's POs and optional ones elsewhere. Falls back to the boolean when the backend
// didn't send the per-PO list.
export const useLogDescRequiredFor = () => {
  const isAny = useSelector(selectIsLogDescMandatory);
  const ids = useSelector(selectLogDescMandatoryPOIds);
  return useCallback(
    (servicePOId) => {
      if (!Array.isArray(ids)) return isAny;
      if (servicePOId === undefined || servicePOId === null || servicePOId === '') return false;
      return ids.includes(Number(servicePOId));
    },
    [ids, isAny],
  );
};

export default useLogDescMandatory;
