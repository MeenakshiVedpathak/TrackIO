import apiClient from '@/services/apiClient';

// Real, confirmed endpoints (2026-09) for the Platform Admin Reports page — see
// pages/platformAdminReports/. Both list endpoints follow this app's standard envelope
// ({ success, message, data, meta }), though `data`'s own shape differs between them (see
// getEmployeeWorkLogSynced below).
const parseFilename = (contentDisposition) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition ?? '');
  return match?.[1] ?? null;
};

export const platformAdminReportsApi = {
  // GET /platform-admin/total-admins — params: page, limit, status ('active'|'inactive'|'all'),
  // search, sort_by ('email'|'created_at'|'full_name'|'employee_code'), sort_order ('ASC'|'DESC').
  // data: [{ id, employee_code, full_name, email, status, created_at, created_by: {id,name,email}|null }]
  getTotalAdmins: (params) =>
    apiClient.get('/platform-admin/total-admins', { params }).then((r) => r.data),

  // GET /platform-admin/employee-work-log-synced — params: month (1-12, required), year
  // (required), page, limit, status (the EMPLOYEE's own status — 'active'|'inactive'|'all', NOT
  // a work-log sync status), search, sortBy ('employee_name'|'employee_code'|'total_hours')
  // sortOrder ('ASC'|'DESC'). NOTE the camelCase sortBy/sortOrder here vs snake_case
  // sort_by/sort_order on Total Admins above — confirmed, not a typo.
  // data: { period: {...}, records: [{ employee_id, employee_code, employee_name, admin_name,
  // entity_name, bu_name, total_hours }] } — rows are data.records; meta (pagination) is the
  // top-level `meta`, a sibling of `data`, not nested inside it.
  getEmployeeWorkLogSynced: (params) =>
    apiClient.get('/platform-admin/employee-work-log-synced', { params }).then((r) => r.data),

  // GET /platform-admin/employee-work-log-synced/export — params: month, year, status, search
  // (no sort params). Returns a real 2-sheet .xlsx binary ("Hours > 0" / "Hours = 0") — the
  // filename comes from the response's Content-Disposition header, never generated client-side.
  exportEmployeeWorkLogSynced: async (params) => {
    const res = await apiClient.get('/platform-admin/employee-work-log-synced/export', {
      params,
      responseType: 'blob',
    });
    const filename = parseFilename(res.headers['content-disposition'])
      ?? `employee-work-log-synced-${params.month}-${params.year}.xlsx`;
    return { blob: res.data, filename };
  },
};
