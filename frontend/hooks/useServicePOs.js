import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicePOsApi } from '@/api/servicePOs.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useServicePOs = (params, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_POS(params),
    queryFn: () => servicePOsApi.getAll(params),
    placeholderData: (prev) => prev,
    ...options,
  });

// `buId` narrows the list to one Business Unit — passed only by screens that gate the Service PO
// picker behind a BU choice. Left undefined by every other caller, who then share a single
// cross-BU cache entry exactly as before.
export const useActiveServicePOs = (enabled = true, buId) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_POS_ACTIVE(buId),
    queryFn: () => servicePOsApi.getActiveList(buId),
    staleTime: 1000 * 60 * 10,
    enabled,
  });

export const useServicePO = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_PO(id),
    queryFn: () => servicePOsApi.getById(id),
    enabled: !!id,
  });

export const useServicePOUtilisation = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_PO_UTILISATION(id),
    queryFn: () => servicePOsApi.getUtilisation(id),
    enabled: !!id,
  });

export const useCreateServicePO = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: servicePOsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-pos'] }),
  });
};

export const useUpdateServicePO = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => servicePOsApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['service-pos'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.SERVICE_PO(id) })
      ]),
  });
};

export const useCloseServicePO = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => servicePOsApi.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-pos'] }),
  });
};

export const useAllocateResources = (poId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeIds) => servicePOsApi.allocate(poId, employeeIds),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['service-pos'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.SERVICE_PO(poId) })
      ]),
  });
};

export const useDeallocateResource = (poId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId) => servicePOsApi.deallocate(poId, employeeId),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['service-pos'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.SERVICE_PO(poId) })
      ]),
  });
};

export const useDeleteServicePO = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => servicePOsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-pos'] }),
  });
};

export const useImportServicePOs = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file) => servicePOsApi.importFile(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-pos'] }),
  });
};
