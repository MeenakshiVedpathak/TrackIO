import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { QUERY_KEYS } from '@/constants/queryKeys';
 
export const useProjects = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.PROJECTS(params),
    queryFn: () => projectsApi.getAll(params),
    placeholderData: (prev) => prev,
  });
 
export const useActiveProjects = () =>
  useQuery({
    queryKey: QUERY_KEYS.PROJECTS_ACTIVE,
    queryFn: projectsApi.getActiveList,
    staleTime: 1000 * 60 * 10,
  });
 
// Service PO create/edit's Project dropdown is scoped to the selected Client — reuses the
// existing paginated /projects list (no new API method needed) with client_id + status=active.
// Disabled until a client is picked; refetches whenever clientId changes.
export const useProjectsByClient = (clientId) =>
  useQuery({
    queryKey: QUERY_KEYS.PROJECTS_BY_CLIENT(clientId),
    queryFn: () => projectsApi.getAll({ client_id: clientId, status: 'active', limit: 200 }),
    select: (data) => (Array.isArray(data?.data) ? data.data : []),
    enabled: !!clientId,
  });
 
export const useProject = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.PROJECT(id),
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
  });
 
export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
};
 
export const useUpdateProject = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => projectsApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.PROJECT(id) })
      ]),
  });
};
 
export const useToggleProjectStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => projectsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
};
 
export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
};
 
export const useImportProjects = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.import,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
};
 
 