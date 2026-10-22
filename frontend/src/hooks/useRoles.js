import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '@/api/roles.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useRoles = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.ROLES(params),
    queryFn: () => rolesApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useRole = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.ROLE(id),
    queryFn: () => rolesApi.getById(id),
    enabled: !!id,
  });

export const useCreateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rolesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};

export const useUpdateRole = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => rolesApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['roles'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.ROLE(id) })
      ]),
  });
};

export const useToggleRoleStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => rolesApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};

export const useDeleteRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rolesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};
