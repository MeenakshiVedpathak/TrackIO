import { useQuery } from '@tanstack/react-query';
import { servicePOHierarchyApi } from '@/api/servicePOHierarchy.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useServicePOHierarchyTree = (servicePOId, { enabled = true } = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_PO_HIERARCHY(servicePOId),
    queryFn: () => servicePOHierarchyApi.getTree(servicePOId),
    enabled: !!servicePOId && enabled,
  });
