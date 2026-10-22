import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { buHeadsApi } from '@/api/buHeads.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useBuHeads = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.BU_HEADS(params),
    queryFn: () => buHeadsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useCreateBuHead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buHeadsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bu-heads'] }),
  });
};

export const useUpdateBuHeadStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => buHeadsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bu-heads'] }),
  });
};

export const useBuHeadMappedCompanies = (buHeadId) =>
  useQuery({
    queryKey: QUERY_KEYS.BU_HEAD_MAPPED_BUS(buHeadId),
    queryFn: () => buHeadsApi.getMappedCompanies(buHeadId),
    enabled: !!buHeadId,
  });

// The backend has no bulk-replace mapping endpoint — only incremental POST (add, can carry
// multiple ids) and DELETE (remove exactly one). This diffs the Map BU modal's desired final
// selection against what's currently mapped and fires the right calls underneath a single
// "Save" button, so the user experiences one atomic action either way.
export const useSyncBuHeadCompanies = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ buHeadId, added, removed }) => {
      if (added.length) await buHeadsApi.addCompanies(buHeadId, added);
      await Promise.all(removed.map((companyId) => buHeadsApi.removeCompany(buHeadId, companyId)));
    },
    onSuccess: (_data, { buHeadId }) => Promise.all([
      qc.invalidateQueries({ queryKey: ['bu-heads'] }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.BU_HEAD_MAPPED_BUS(buHeadId) }),
    ]),
  });
};
