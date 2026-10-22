import apiClient from '@/services/apiClient';

export const employeeProjectHoursReportApi = {
  getFilterTree: async () => {
    const res = await apiClient.get('/employee-reports/project-hours/filter-tree');
    return res.data?.data ?? [];
  },
  getReport: async (params) => {
    const res = await apiClient.get('/employee-reports/project-hours', { params });
    return res.data?.data ?? { projects: [], grand_total_hours: 0 };
  },
};
