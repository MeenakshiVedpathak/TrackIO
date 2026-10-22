import apiClient from '@/services/apiClient';

// Only the Service POs/projects mapped to the logged-in employee — the backend is the source
// of truth for this mapping (employee-servicepo-mapping), never the full Service PO list
// filtered client-side. Unscoped by BU: the backend (employeeTimesheetService.getMappedProjects)
// deliberately ignores X-Company-Id here and always returns every mapping across every BU the
// employee is mapped to (cross-BU resourcing) — see useEmployeeMappedProjects.
export const employeeProjectsApi = {
  getMappedProjects: () =>
    apiClient.get('/employee-timesheets/projects').then((r) => r.data?.data ?? []),
};
