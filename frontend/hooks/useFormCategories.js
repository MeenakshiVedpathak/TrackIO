import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '@/api/forms.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

const invalidateCategories = (qc) => Promise.all([
  qc.invalidateQueries({ queryKey: ['forms', 'categories'] }),
  qc.invalidateQueries({ queryKey: QUERY_KEYS.FORM_HIERARCHY }),
]);

// Returns [] (not an error) when the module has no categories yet — callers render
// "No Category Available" rather than treating that as a loading/error state.
export const useFormCategories = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.FORM_CATEGORIES(params),
    queryFn: () => formsApi.getCategories(params),
    placeholderData: (prev) => prev,
  });

export const useCreateFormCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => formsApi.createCategory(payload),
    onSuccess: () => invalidateCategories(qc),
  });
};

export const useUpdateFormCategory = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => formsApi.updateCategory(id, payload),
    onSuccess: () => invalidateCategories(qc),
  });
};

export const useToggleFormCategoryStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => formsApi.updateCategory(id, { status }),
    onSuccess: () => invalidateCategories(qc),
  });
};

export const useDeleteFormCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => formsApi.deleteCategory(id),
    onSuccess: () => invalidateCategories(qc),
  });
};

export const useReorderFormCategories = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, items }) => formsApi.reorderCategories(moduleId, items),
    onSuccess: () => invalidateCategories(qc),
  });
};
