import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '@/api/roles.api';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuth } from '@/hooks/useAuth';

export const useAccessibleForms = (roleIds) =>
  useQuery({
    queryKey: QUERY_KEYS.ACCESSIBLE_FORMS(roleIds ?? []),
    queryFn: () => rolesApi.getAccessibleForms(roleIds),
    enabled: Array.isArray(roleIds) && roleIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

// Mounted in MainLayout, so this runs on every authenticated page load — including a hard
// refresh, not just right after login. Always re-fetches POST /roles/forms for the current
// session's roleIds; whatever accessibleForms was restored from localStorage on boot is only
// the instant-paint placeholder until this resolves and overwrites it with the live mapping
// (so a role/form-mapping change made elsewhere shows up on refresh without a full re-login).
export const useSyncAccessibleForms = () => {
  const { roleIds, isAuthenticated, setAccessibleForms } = useAuth();
  const { data, isSuccess } = useAccessibleForms(isAuthenticated ? roleIds : []);

  useEffect(() => {
    if (isSuccess && data) setAccessibleForms(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, data]);
};

// Imperative re-fetch, bypassing useSyncAccessibleForms's "only once" gate — call this after
// a Role Master edit (permission, form mapping, etc.) so the current session's own
// accessible-forms map (sidebar visibility) picks up the change immediately instead of
// waiting for the next login. is_original_data_visible has no such mid-session refresh —
// it's only ever set at login time.
export const useRefreshAccessibleForms = () => {
  const { roleIds, isAuthenticated, setAccessibleForms } = useAuth();
  return async () => {
    if (!isAuthenticated || !roleIds?.length) return;
    try {
      const forms = await rolesApi.getAccessibleForms(roleIds);
      setAccessibleForms(forms);
    } catch {
      // Non-fatal — MainLayout's fallback sync will retry on next render if this failed.
    }
  };
};
