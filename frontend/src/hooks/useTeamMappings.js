import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamMappingsApi } from '@/api/teamMappings.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useTeamMappings = () =>
  useQuery({
    queryKey: QUERY_KEYS.TEAM_MAPPINGS,
    queryFn: teamMappingsApi.getMyTeam,
  });

export const useAvailableTeamLeads = () =>
  useQuery({
    queryKey: QUERY_KEYS.TEAM_MAPPING_AVAILABLE_TEAM_LEADS,
    queryFn: teamMappingsApi.getAvailableTeamLeads,
  });

export const useAddTeamLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: teamMappingsApi.addTeamLead,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPINGS }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_AVAILABLE_TEAM_LEADS }),
    ]),
  });
};

export const useRemoveTeamLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: teamMappingsApi.removeTeamLead,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPINGS }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_AVAILABLE_TEAM_LEADS }),
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
    mutationFn: ({ teamLeadUserId, servicePOId }) => teamMappingsApi.grantServicePo(teamLeadUserId, servicePOId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_SERVICE_PO_GRANTS }),
  });
};

export const useRevokeTeamServicePo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamLeadUserId, servicePOId }) => teamMappingsApi.revokeServicePo(teamLeadUserId, servicePOId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.TEAM_MAPPING_SERVICE_PO_GRANTS }),
  });
};
