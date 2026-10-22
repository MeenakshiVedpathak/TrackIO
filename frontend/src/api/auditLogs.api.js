import apiClient, { explicitBuScope } from '@/services/apiClient';
import { ALL_BUS } from '@/components/common/BusinessUnitFilter';

// Shared getReport-style helper: defaults to buId: ALL_BUS so the navbar's
// active BU header (X-Company-Id) is not applied, allowing cross-BU queries.
const getAuditLogsData = (url, params = {}) => {
  const { buId = ALL_BUS, ...query } = params;
  return apiClient.get(url, { params: query, ...explicitBuScope(buId) }).then((r) => r.data);
};

export const auditLogsApi = {
  getList: (params) => getAuditLogsData('/audit-logs', params),
  getFilterOptions: () => getAuditLogsData('/audit-logs/filter-options'),
  getOne: (id) => getAuditLogsData(`/audit-logs/${id}`),
  getSessions: (params) => getAuditLogsData('/audit-logs/sessions', params),
  getDevices: (params) => getAuditLogsData('/audit-logs/devices', params),
  download: async (params = {}, format = 'excel') => {
    const { buId = ALL_BUS, ...query } = params;
    const res = await apiClient.get('/audit-logs', {
      params: { ...query, format },
      responseType: 'blob',
      ...explicitBuScope(buId),
    });
    const match = /filename="?([^"]+)"?/i.exec(res.headers['content-disposition'] ?? '');
    return {
      blob: res.data,
      filename: match?.[1] ?? `Audit_Logs.${format === 'csv' ? 'csv' : 'xlsx'}`,
    };
  },
  // Fire-and-forget: callers never await/catch beyond swallowing the error themselves — the
  // server counts attempts server-side and only writes an audit row on the 2nd one within 15 min.
  reportAccessDenied: (body) => apiClient.post('/audit-logs/access-denied', body),
};
