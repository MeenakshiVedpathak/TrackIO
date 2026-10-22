import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/api/clients.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// `options.enabled` lets a caller hold the request until its params are meaningful — e.g. a form
// that scopes clients to a Business Unit the user has not picked yet. Same shape as useCompanies.
export const useClients = (params, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.CLIENTS(params),
    queryFn: () => clientsApi.getAll(params),
    placeholderData: (prev) => prev,
    enabled: options.enabled ?? true,
  });

export const useActiveClients = () =>
  useQuery({
    queryKey: QUERY_KEYS.CLIENTS_ACTIVE,
    queryFn: clientsApi.getActiveList,
    staleTime: 1000 * 60 * 10,
  });

export const useClient = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.CLIENT(id),
    queryFn: () => clientsApi.getById(id),
    enabled: !!id,
  });

export const useCreateClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
};

export const useUpdateClient = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => clientsApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['clients'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.CLIENT(id) })
      ]),
  });
};

export const useToggleClientStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => clientsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
};

export const useDeleteClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
};

export const useImportClients = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientsApi.import,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
};
