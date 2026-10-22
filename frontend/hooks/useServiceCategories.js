import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceCategoriesApi } from '@/api/serviceCategories.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useServiceCategories = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_CATEGORIES(params),
    queryFn: () => serviceCategoriesApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useServiceCategory = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_CATEGORY(id),
    queryFn: () => serviceCategoriesApi.getById(id),
    enabled: !!id,
  });

export const useCreateServiceCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => serviceCategoriesApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-categories'] }),
  });
};

export const useUpdateServiceCategory = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => serviceCategoriesApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-categories'] }),
  });
};

export const useActiveServiceCategories = () =>
  useQuery({
    queryKey: ['service-categories', 'active'],
    queryFn: () => serviceCategoriesApi.getAll({ status: 'active', limit: 200 }),
    select: (data) => (Array.isArray(data?.data) ? data.data : []),
    staleTime: 5 * 60 * 1000,
  });

export const useToggleServiceCategoryStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => serviceCategoriesApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-categories'] }),
  });
};

export const useDeleteServiceCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => serviceCategoriesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-categories'] }),
  });
};
