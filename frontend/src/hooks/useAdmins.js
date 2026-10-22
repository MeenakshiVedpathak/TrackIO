import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminsApi } from '@/api/admins.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useAdmins = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.ADMINS(params),
    queryFn: () => adminsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useAdmin = (id) =>
  useQuery({
    queryKey: ['admins', id],
    queryFn: () => adminsApi.getById(id),
    enabled: !!id,
  });

export const useCreateAdmin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] }),
  });
};

export const useUpdateAdmin = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => adminsApi.update(id, payload),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['admins'] }),
      qc.invalidateQueries({ queryKey: ['admins', id] }),
    ]),
  });
};

export const useUpdateAdminStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => adminsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] }),
  });
};
