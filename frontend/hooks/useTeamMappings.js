import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamMappingsApi } from '@/api/teamMappings.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useTeamMappings = () =>
  useQuery({
    queryKey: QUERY_KEYS.TEAM_MAPPINGS,
    queryFn: teamMappingsApi.getMyTeam,
  });

export const useAvailableManagers = () =>
  useQuery({
    queryKey: QUERY_KEYS.TEAM_MAPPING_AVAILABLE_MANAGERS,
    queryFn: teamMappingsApi.getAvailableManagers,
  });

export const useAddTeamManager = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: teamMappingsApi.addManager,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPINGS }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_AVAILABLE_MANAGERS }),
    ]),
  });
};

export const useRemoveTeamManager = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: teamMappingsApi.removeManager,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPINGS }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_AVAILABLE_MANAGERS }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_SERVICE_PO_GRANTS }),
    ]),
  });
};

export const useTeamServicePoGrants = () =>
  useQuery({
    queryKey: QUERY_KEYS.TEAM_MAPPING_SERVICE_PO_GRANTS,
    queryFn: teamMappingsApi.getServicePoGrants,
  });

export const useGrantTeamServicePo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ managerUserId, servicePOId }) => teamMappingsApi.grantServicePo(managerUserId, servicePOId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_SERVICE_PO_GRANTS }),
  });
};

export const useRevokeTeamServicePo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ managerUserId, servicePOId }) => teamMappingsApi.revokeServicePo(managerUserId, servicePOId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_SERVICE_PO_GRANTS }),
  });
};
