import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '@/api/forms.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useForms = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.FORMS(params),
    queryFn: () => formsApi.getAll(params),
    placeholderData: (prev) => prev,
  });

// Module rows only — source for the "Module" dropdown on the Add/Edit Form screen. Never derive
// this from the flat useForms() list.
export const useFormModules = (params = { status: 'active' }) =>
  useQuery({
    queryKey: QUERY_KEYS.FORM_MODULES(params),
    queryFn: () => formsApi.getModules(params),
  });

export const useFormById = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.FORM(id),
    queryFn: () => formsApi.getById(id),
    enabled: !!id,
  });

export const useCreateForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: formsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
};

export const useUpdateForm = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => formsApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['forms'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.FORM(id) })
      ]),
  });
};

export const useToggleFormStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => formsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
};

export const useDeleteForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: formsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
};

export const useReorderModules = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items) => formsApi.reorderModules(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
};

export const useReorderForms = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleName, items }) => formsApi.reorderForms(moduleName, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
};

// Full nested Module -> Category -> Form tree — source for the Category management screen and
// for labeling categorized forms in the Form List (no search/status params on this endpoint).
export const useFormHierarchy = () =>
  useQuery({
    queryKey: QUERY_KEYS.FORM_HIERARCHY,
    queryFn: () => formsApi.getHierarchy(),
  });

// The only mutation that changes a form's module and/or category — PUT /forms/:id never touches
// category_id. Callers should send both module_id and category_id together when either changes.
export const useMoveForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => formsApi.moveForm(id, payload),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['forms'] }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.FORM_HIERARCHY }),
    ]),
  });
};
