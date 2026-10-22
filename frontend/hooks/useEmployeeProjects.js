import { useQuery } from '@tanstack/react-query';
import { employeeProjectsApi } from '@/api/employeeProjects.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// GET /employee-timesheets/projects is NOT scoped by X-Company-Id — the backend
// (employeeTimesheetService.getMappedProjects) deliberately ignores companyId and always returns
// every one of the employee's active Service PO mappings across every BU they're mapped to
// (cross-BU resourcing), in one call. So this never needs to fan out per-BU or care which BU is
// globally "active" — that selection has no bearing on which projects show up here.
export const useEmployeeMappedProjects = () =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_PROJECTS,
    queryFn: () => employeeProjectsApi.getMappedProjects(),
  });
