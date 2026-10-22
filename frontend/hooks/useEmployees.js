import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeesApi } from '@/api/employees.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useEmployees = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEES(params),
    queryFn: () => employeesApi.getAll(params),
    placeholderData: (prev) => prev,
  });

export const useActiveEmployees = (buId) =>
  useQuery({
    queryKey: [QUERY_KEYS.EMPLOYEES_ACTIVE, buId],
    queryFn: () => employeesApi.getActiveList(buId),
    staleTime: 1000 * 60 * 10,
  });

// NOTE: Service PO → Map Employees' left panel is NOT served from here. Every hook in this file
// reads the generic employee endpoints, which scope to the caller's own team or their selected BU —
// the wrong scope for PO mapping, and the reason that screen only ever showed a fraction of the
// list. It uses useServicePOEmployeeOptions in useEmployeeServicePOMapping.js instead.

// Service PO create/edit's Delivery Head dropdown — response envelope not yet confirmed against
// the exact shape the new backend endpoint returns, so `select` defensively unwraps either
// `{ data: [...] }` or a bare array.
export const useEligibleDeliveryHeads = (enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.ELIGIBLE_DELIVERY_HEADS,
    queryFn: employeesApi.getEligibleDeliveryHeads,
    select: (data) => {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      return [];
    },
    staleTime: 1000 * 60 * 5,
    enabled,
  });

export const useEmployee = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE(id),
    queryFn: () => employeesApi.getById(id),
    enabled: !!id,
  });

// Seeds Employee List's "Map Roles & Business Units" dialog — GET /employees (list) returns no
// role/BU data, so the dialog can't rely on the row it was opened from.
export const useEmployeeMappings = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_MAPPINGS(id),
    queryFn: () => employeesApi.getMappings(id),
    enabled: !!id,
  });

// Employee Identity Migration: Primary/Secondary Manager pickers. GET /employees (list)
// deliberately carries no role/BU data (pagination cost), so eligibility can't be filtered off
// that response client-side — this pre-filters server-side via GET /employees/eligible-managers,
// the same manager.view_mapped_employees rule assertValidManager() enforces at save time.
export const useAssignableManagers = () =>
  useQuery({
    queryKey: QUERY_KEYS.ELIGIBLE_MANAGERS,
    queryFn: employeesApi.getEligibleManagers,
    select: (data) => {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      return [];
    },
  });

export const useCreateEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
};

export const useUpdateEmployee = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => employeesApi.update(id, payload),
    onSuccess: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['employees'] }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYEE(id) }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYEE_MAPPINGS(id) }),
      ]),
  });
};

// Employee Identity Migration: targets the employee directly (no more separate linked-User
// lookup — see employees.api.js's resetPassword for the guessed-and-flagged endpoint).
export const useResetEmployeePassword = () =>
  useMutation({
    mutationFn: ({ id, newPassword, confirmPassword }) => employeesApi.resetPassword(id, newPassword, confirmPassword),
  });

export const useDeleteEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
};

export const useImportEmployees = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeesApi.import,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
};

export const useToggleEmployeeStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => employeesApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
};
 