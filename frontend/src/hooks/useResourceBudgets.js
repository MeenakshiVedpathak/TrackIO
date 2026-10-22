import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resourceBudgetsApi } from '@/api/resourceBudgets.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useResourceBudgetMappedEmployees = (servicePoId) =>
  useQuery({
    queryKey: QUERY_KEYS.RESOURCE_BUDGET_MAPPED_EMPLOYEES(servicePoId),
    queryFn: () => resourceBudgetsApi.getMappedEmployees(servicePoId),
    enabled: !!servicePoId,
  });

export const useResourceBudgetsByServicePo = (servicePoId) =>
  useQuery({
    queryKey: QUERY_KEYS.RESOURCE_BUDGETS_BY_SERVICE_PO(servicePoId),
    queryFn: () => resourceBudgetsApi.getByServicePo(servicePoId),
    enabled: !!servicePoId,
  });

export const useResourceBudgets = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.RESOURCE_BUDGETS(params),
    queryFn: () => resourceBudgetsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useBulkSaveResourceBudgets = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resourceBudgetsApi.bulkSave,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resource-budgets'] }),
  });
};

export const useDeactivateResourceBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => resourceBudgetsApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resource-budgets'] }),
  });
};
