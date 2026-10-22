import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monthlyCostsApi } from '@/api/monthlyCosts.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

const invalidateMonthlyCosts = (qc) => Promise.all([
  qc.invalidateQueries({ queryKey: ['monthly-costs'] }),
  qc.invalidateQueries({ queryKey: ['reports', 'monthly-cost-summary'] }),
]);

export const useMonthlyCosts = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.MONTHLY_COSTS(params),
    queryFn: () => monthlyCostsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useMonthlyCost = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.MONTHLY_COST(id),
    queryFn: () => monthlyCostsApi.getById(id),
    enabled: !!id,
  });

export const useCreateMonthlyCost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: monthlyCostsApi.create,
    onSuccess: () => invalidateMonthlyCosts(qc),
  });
};

export const useUpdateMonthlyCost = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => monthlyCostsApi.update(id, payload),
    onSuccess: () => Promise.all([
      invalidateMonthlyCosts(qc),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MONTHLY_COST(id) }),
    ]),
  });
};

export const useDeleteMonthlyCost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: monthlyCostsApi.delete,
    onSuccess: () => invalidateMonthlyCosts(qc),
  });
};

export const useDeleteMonthlyCosts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => monthlyCostsApi.deleteMany(ids),
    onSuccess: () => invalidateMonthlyCosts(qc),
  });
};

// Deletes every record for one or more Month/Year periods (used by the grouped
// summary list, where each row represents a period rather than a single record).
export const useDeleteMonthlyCostPeriods = () => {
  const qc = useQueryClient();
  return useMutation({
    // `buId` is the list's own Business Unit filter — it has to reach getIdsForPeriod so the
    // delete covers exactly the rows the user is looking at, not every BU's rows for that period.
    mutationFn: async ({ periods, buId }) => {
      const idLists = await Promise.all(
        periods.map(({ month, year }) => monthlyCostsApi.getIdsForPeriod(month, year, buId))
      );
      const ids = idLists.flat();
      if (ids.length === 0) return { deletedCount: 0 };
      return monthlyCostsApi.deleteMany(ids);
    },
    onSuccess: () => invalidateMonthlyCosts(qc),
  });
};

export const useCalculateMonthlyCosts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, year }) => monthlyCostsApi.calculateForMonth(month, year),
    onSuccess: () => invalidateMonthlyCosts(qc),
  });
};

export const useImportMonthlyCosts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: monthlyCostsApi.import,
    onSuccess: () => invalidateMonthlyCosts(qc),
  });
};
