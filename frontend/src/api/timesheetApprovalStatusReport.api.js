import apiClient from '@/services/apiClient';

export const timesheetApprovalStatusReportApi = {
  getReport: async (params) => {
    const res = await apiClient.get('/employee-reports/timesheet-approval-status', { params });
    const raw = res.data?.data;
    // The live endpoint has been seen in two shapes: `data.data` as the array of buckets
    // directly, and `data.data.data` (an extra wrapper object) holding that same array. A
    // single bucket has also been seen returned bare (no array) when there's exactly one —
    // normalize all three so the page's `.map` never blows up.
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return [raw];
    return [];
  },
};
