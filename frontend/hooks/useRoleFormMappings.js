import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '@/api/roles.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useRoleFormMappings = (roleId) =>
  useQuery({
    queryKey: QUERY_KEYS.ROLE_FORM_MAPPINGS(roleId),
    queryFn: () => rolesApi.getRoleFormMappings(roleId),
    enabled: !!roleId,
  });

// Bulk replace — PUT /roles/form-mappings/:roleId with the complete list of active form_ids.
export const useReplaceRoleFormMappings = (roleId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formIds) => rolesApi.replaceRoleFormMappings(roleId, formIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.ROLE_FORM_MAPPINGS(roleId) }),
  });
};
