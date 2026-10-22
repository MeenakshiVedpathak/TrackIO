import { useQuery } from '@tanstack/react-query';
import { organizationOverviewApi } from '@/api/organizationOverview.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// One query backs the whole Organization Overview form — all four tabs derive from this same
// cached response (see OrganizationOverview.jsx), so switching tabs never refetches. `refetch` is
// what the header's Refresh button calls; it re-runs this same request, nothing tab-specific.
export const useOrganizationOverview = () =>
  useQuery({
    queryKey: QUERY_KEYS.ORGANIZATION_OVERVIEW,
    queryFn: organizationOverviewApi.get,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

export default useOrganizationOverview;
