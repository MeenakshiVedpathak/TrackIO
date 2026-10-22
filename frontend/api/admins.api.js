import apiClient from '@/services/apiClient';
import { RBAC_MOCK_ENABLED } from '@/mocks/rbacMockConfig';
import {
  delay, getDb, persist, nextId, paginate, findEmployeeById, findRoleByName, mockError,
} from '@/mocks/rbacMockDb';

// Employee Identity Migration: an Admin account is an Employee holding the Admin role now (no
// more separate `users` row) — mock reads/writes the `employees` collection directly.
const isAdmin = (employee) => (employee.role_ids ?? []).includes(findRoleByName('Admin').id);

const serialize = (employee) => employee && {
  id: employee.id,
  email: employee.email,
  status: employee.status,
  role_id: findRoleByName('Admin').id,
  company_id: null,
};

// Platform Admin only.
const mockCreate = async (payload) => {
  await delay();
  if (getDb().employees.some((e) => e.email.toLowerCase() === payload.email.toLowerCase())) {
    throw mockError(409, 'An account with this email already exists.');
  }
  const adminRole = findRoleByName('Admin');
  const employee = {
    id: nextId('employees'),
    employee_code: `ADMIN-${payload.email.split('@')[0]}`.toUpperCase(),
    full_name: payload.email.split('@')[0],
    email: payload.email,
    password: payload.password,
    designation: 'Admin',
    role_ids: [adminRole.id],
    business_unit_ids: [],
    status: 'active',
    primary_manager_employee_id: null,
    secondary_manager_employee_id: null,
    is_timesheet_approval_required: false,
  };
  getDb().employees.push(employee);
  persist();
  return { success: true, message: 'Admin created successfully.', data: serialize(employee) };
};

const mockGetAll = async (params) => {
  await delay();
  const result = paginate(getDb().employees.filter(isAdmin), { ...params, searchFields: ['email'] });
  return { success: true, message: 'OK', data: result.data.map(serialize), meta: result.meta };
};

const mockGetById = async (id) => {
  await delay();
  const employee = findEmployeeById(Number(id));
  if (!employee || !isAdmin(employee)) throw mockError(404, 'Admin not found.');
  return serialize(employee);
};

const mockUpdate = async (id, payload) => {
  await delay();
  const employee = findEmployeeById(Number(id));
  if (!employee || !isAdmin(employee)) throw mockError(404, 'Admin not found.');
  Object.assign(employee, payload);
  persist();
  return { success: true, message: 'Admin updated successfully.', data: serialize(employee) };
};

const mockUpdateStatus = async (id, status) => {
  await delay();
  const employee = findEmployeeById(Number(id));
  if (!employee || !isAdmin(employee)) throw mockError(404, 'Admin not found.');
  employee.status = status;
  persist();
  return { success: true, message: 'Status updated successfully.', data: serialize(employee) };
};

export const adminsApi = {
  create: (payload) => {
    if (RBAC_MOCK_ENABLED) return mockCreate(payload);
    return apiClient.post('/admins', payload).then((r) => r.data);
  },
  getAll: (params) => {
    if (RBAC_MOCK_ENABLED) return mockGetAll(params);
    return apiClient.get('/admins', { params }).then((r) => r.data);
  },
  getById: (id) => {
    if (RBAC_MOCK_ENABLED) return mockGetById(id);
    return apiClient.get(`/admins/${id}`).then((r) => r.data?.data);
  },
  update: (id, payload) => {
    if (RBAC_MOCK_ENABLED) return mockUpdate(id, payload);
    return apiClient.put(`/admins/${id}`, payload).then((r) => r.data);
  },
  updateStatus: (id, status) => {
    if (RBAC_MOCK_ENABLED) return mockUpdateStatus(id, status);
    return apiClient.patch(`/admins/${id}/status`, { status }).then((r) => r.data);
  },
};
