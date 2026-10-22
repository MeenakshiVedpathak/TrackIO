import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { costBudgetsApi } from '@/api/costBudgets.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useCostBudgets = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.COST_BUDGETS(params),
    queryFn: () => costBudgetsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useCostBudgetsByServicePo = (servicePoId) =>
  useQuery({
    queryKey: QUERY_KEYS.COST_BUDGETS_BY_SERVICE_PO(servicePoId),
    queryFn: () => costBudgetsApi.getByServicePo(servicePoId),
    enabled: !!servicePoId,
  });

export const useCreateCostBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: costBudgetsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-budgets'] }),
  });
};

export const useUpdateCostBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => costBudgetsApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-budgets'] }),
  });
};

export const useDeactivateCostBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => costBudgetsApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-budgets'] }),
  });
};
