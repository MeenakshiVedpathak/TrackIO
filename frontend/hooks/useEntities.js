import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entitiesApi } from '@/api/entities.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useEntities = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.ENTITIES(params),
    queryFn: () => entitiesApi.getAll(params),
    placeholderData: (prev) => prev,
  });

// No dedicated /entities/active/list endpoint (unlike Clients/Projects) — reuse the paginated
// list with a generous limit, same fallback the app already uses for Service Types/Categories.
// `refetchOnMount: 'always'` because this feeds a create-flow dropdown (Create BU) that's opened
// rarely but must reflect Entities created moments ago on a different screen — the 10 min
// staleTime below is fine for avoiding duplicate fetches within one mount, but must not let a
// cached empty result (e.g. fetched before any Entity existed) silently persist into a later
// mount and hide real options with no error and no visible network call.
export const useActiveEntities = (options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.ENTITIES_ACTIVE,
    queryFn: () => entitiesApi.getAll({ status: 'active', limit: 200 }),
    select: (data) => (Array.isArray(data?.data) ? data.data : []),
    staleTime: 1000 * 60 * 10,
    refetchOnMount: 'always',
    ...options,
  });

export const useEntity = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.ENTITY(id),
    queryFn: () => entitiesApi.getById(id),
    enabled: !!id,
  });

export const useCreateEntity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: entitiesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entities'] }),
  });
};

export const useUpdateEntity = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => entitiesApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['entities'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.ENTITY(id) })
      ]),
  });
};

export const useToggleEntityStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => entitiesApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entities'] }),
  });
};

export const useDeleteEntity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: entitiesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entities'] }),
  });
};
