import apiClient from '@/services/apiClient';

const parseFilename = (contentDisposition) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition ?? '');
  return match?.[1] ?? null;
};

// The `format` query value isn't a real file extension ('excel' → .xlsx) — map it rather than
// using it verbatim, which is how a download previously ended up named "work-log-daily.excel".
const FORMAT_EXTENSIONS = { excel: 'xlsx', csv: 'csv', pdf: 'pdf' };

// Extension is always derived from `format`, never trusted from the backend's filename (its
// Content-Disposition header has been observed sending the same wrong "name.excel" extension) —
// only the base name is taken from the header, when present.
const resolveFilename = (contentDisposition, fallbackBase, format) => {
  const ext = FORMAT_EXTENSIONS[format] ?? format;
  const headerName = parseFilename(contentDisposition);
  const base = headerName ? headerName.replace(/\.[^./\\]+$/, '') : fallbackBase;
  return `${base}.${ext}`;
};

// format: 'json' (default) | 'excel' | 'csv' | 'pdf'. JSON returns the rows directly; the file
// formats return a Blob + filename (base parsed from the backend's Content-Disposition header,
// extension always normalized — see resolveFilename) for the caller to hand to utils/download.js
// — never parsed as JSON.
const getReport = async (path, params, fallbackFilename) => {
  const format = params.format ?? 'json';
  const res = await apiClient.get(path, {
    params,
    responseType: format === 'json' ? 'json' : 'blob',
  });
  if (format === 'json') return res.data?.data ?? { rows: [], totalHours: 0 };
  return { blob: res.data, filename: resolveFilename(res.headers['content-disposition'], fallbackFilename, format) };
};

export const employeeReportsApi = {
  getDaily: (params) => getReport('/employee-reports/daily', params, 'work-log-daily'),
  getMonthly: (params) => getReport('/employee-reports/monthly', params, 'work-log-monthly'),
  getRange: (params) => getReport('/employee-reports/range', params, 'work-log-range'),
  // One row per work-log entry (never aggregated), sorted by date desc then start time asc.
  // Exactly one of {startDate,endDate} or {month,year} must be present; employee_id (Manager
  // only), service_po_id, project_id are optional filters. startTime/endTime come back null for
  // older entries logged before start/end time existed — never fabricate them client-side.
  getWorkLogTime: (params) => getReport('/employee-reports/work-log-time', params, 'work-log-time'),
};
