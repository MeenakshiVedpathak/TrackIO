import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceTypesApi } from '@/api/serviceTypes.api';

export const useServiceTypes = (params) =>
  useQuery({
    queryKey: ['service-types', params],
    queryFn: () => serviceTypesApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useServiceType = (id) =>
  useQuery({
    queryKey: ['service-types', id],
    queryFn: () => serviceTypesApi.getById(id),
    enabled: !!id,
  });

export const useActiveServiceTypes = () =>
  useQuery({
    queryKey: ['service-types', 'active'],
    queryFn: () => serviceTypesApi.getAll({ limit: 200 }),
    select: (data) => (Array.isArray(data?.data) ? data.data : []),
    staleTime: 5 * 60 * 1000,
  });

export const useCreateServiceType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => serviceTypesApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types'] }),
  });
};

export const useUpdateServiceType = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => serviceTypesApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types'] }),
  });
};

export const useDeleteServiceType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => serviceTypesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types'] }),
  });
};
