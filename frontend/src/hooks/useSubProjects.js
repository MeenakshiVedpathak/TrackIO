import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subProjectsApi } from '@/api/subProjects.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useSubProjects = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.SUB_PROJECTS(params),
    queryFn: () => subProjectsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useSubProjectsByPO = (poId) =>
  useQuery({
    queryKey: QUERY_KEYS.SUB_PROJECTS_BY_PO(poId),
    queryFn: () => subProjectsApi.getByPO(poId),
    enabled: !!poId,
  });

export const useSubProject = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.SUB_PROJECT(id),
    queryFn: () => subProjectsApi.getById(id),
    enabled: !!id,
  });

export const useCreateSubProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: subProjectsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-projects'] }),
  });
};

export const useUpdateSubProject = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => subProjectsApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['sub-projects'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.SUB_PROJECT(id) })
      ]),
  });
};

export const useToggleSubProjectStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => subProjectsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-projects'] }),
  });
};

export const useDeleteSubProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: subProjectsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-projects'] }),
  });
};
