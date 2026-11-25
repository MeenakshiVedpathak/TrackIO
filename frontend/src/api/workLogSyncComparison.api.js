import apiClient, { explicitBuScope } from '@/services/apiClient';

// Work Log Sync Comparison — one row per work log entry with the hours the employee logged
// (before sync) next to the official timesheet hours after the monthly cap (after sync).
//   GET /reports/work-log-sync-comparison                 -> { data: { period, totals, records[] }, meta }
//   GET /reports/work-log-sync-comparison/filter-options  -> { data: { employees, clients, ... } }
// Period: exactly ONE of date | start_date+end_date | month+year (a mix is a 400).
// `buId` is the same pseudo-param every report uses (see reports.api.js getReport): pulled out of
// the query string and turned into the X-Company-Id scope instead.
const BASE = '/reports/work-log-sync-comparison';

// An error on a `responseType: 'blob'` request carries its JSON body as a Blob — read it back so
// extractApiError can show the backend's own message (e.g. "too many rows, narrow the period").
const unwrapBlobError = async (err) => {
  const data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      err.response.data = JSON.parse(await data.text());
    } catch {
      // not JSON — leave as-is, extractApiError falls back to a generic message
    }
  }
  return err;
};

export const workLogSyncComparisonApi = {
  getReport: (params = {}, { signal } = {}) => {
    const { buId, ...query } = params;
    return apiClient.get(BASE, { params: query, signal, ...explicitBuScope(buId) }).then((r) => r.data);
  },

  getFilterOptions: (params = {}, { signal } = {}) => {
    const { buId, ...query } = params;
    return apiClient
      .get(`${BASE}/filter-options`, { params: query, signal, ...explicitBuScope(buId) })
      .then((r) => r.data?.data ?? {});
  },

  // Same endpoint with format=excel|csv and the current filters/sort (page/limit stripped by the
  // caller). File name comes from Content-Disposition.
  download: async (params = {}, format = 'excel') => {
    const { buId, ...query } = params;
    try {
      const res = await apiClient.get(BASE, {
        params: { ...query, format },
        responseType: 'blob',
        ...explicitBuScope(buId),
      });
      const disposition = res.headers?.['content-disposition'] ?? '';
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const plain = /filename="?([^";]+)"?/i.exec(disposition);
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      const filename = (encoded && decodeURIComponent(encoded[1])) || plain?.[1] || `Work Log Sync Comparison.${ext}`;
      return { blob: res.data, filename };
    } catch (err) {
      throw await unwrapBlobError(err);
    }
  },
};

export default workLogSyncComparisonApi;
