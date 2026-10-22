import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityAdminsApi } from '@/api/entityAdmins.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useEntityAdmins = (params, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.ENTITY_ADMINS(params),
    queryFn: () => entityAdminsApi.getAll(params),
    placeholderData: (prev) => prev,
    ...options,
  });

export const useEntityAdmin = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.ENTITY_ADMIN(id),
    queryFn: () => entityAdminsApi.getById(id),
    enabled: !!id,
  });

export const useCreateEntityAdmin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: entityAdminsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity-admins'] }),
  });
};

export const useUpdateEntityAdmin = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => entityAdminsApi.update(id, payload),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['entity-admins'] }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ENTITY_ADMIN(id) }),
    ]),
  });
};

export const useUpdateEntityAdminStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => entityAdminsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity-admins'] }),
  });
};
