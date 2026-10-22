import apiClient, { explicitBuScope } from '@/services/apiClient';

export const timesheetsApi = {
  getAll: (params) => apiClient.get('/timesheets', { params }).then((r) => r.data),
  getById: (id) => apiClient.get(`/timesheets/${id}`).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/timesheets', payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/timesheets/${id}`, { data: { is_delete: true } }).then((r) => r.data),
  // `buId` mirrors confirm()/syncEmployeeWorkLogs()'s convention: it rides both the request body
  // (business_unit_id, for a backend that reads it there) and the X-Company-Id header (via
  // explicitBuScope), so a multi-BU login's explicit choice on the upload dialog is unambiguous
  // rather than falling back to whatever BU happens to be globally active in the navbar.
  //
  // `headers` is built manually (not `...explicitBuScope(buId)` spread directly into the config)
  // because explicitBuScope's own return value may itself carry a `headers` key — spreading it
  // after this call's own `Content-Type: multipart/form-data` would silently replace that header
  // instead of adding to it, breaking the file upload's encoding.
  upload: (file, month, year, buId = null) => {
    const form = new FormData();
    form.append('file', file);
    if (month) form.append('month', month);
    if (year) form.append('year', year);
    if (buId != null) form.append('business_unit_id', buId);
    const scope = explicitBuScope(buId ?? undefined);
    return apiClient
      .post('/timesheets/upload', form, {
        ...scope,
        headers: { 'Content-Type': 'multipart/form-data', ...scope.headers },
      })
      .then((r) => r.data?.data);
  },
  // `buId` pins the confirm to the same BU the preview/import was generated against (the Work Log
  // sync flow passes it); the Excel-upload flow calls this with just an importId, so it defaults to
  // null and leaves the interceptor's global-BU header untouched.
  //
  // Body is `{}`, never `null` — apiClient sets Content-Type: application/json on every request,
  // and axios's default transform stringifies a `null` body down to an effectively empty request
  // body (no bytes) while the header still claims JSON, which the backend's parser rejects with
  // "Invalid JSON in request body" (confirmed live: this was the only bodyless POST in the app
  // passing an explicit `null` instead of omitting the argument or passing `{}`). This endpoint
  // takes no body fields — importId is a URL param and BU rides the header — so `{}` is correct.
  confirm: (importId, buId = null) =>
    apiClient.post(`/timesheets/confirm/${importId}`, {}, explicitBuScope(buId ?? undefined)).then((r) => r.data),
  // `buId` is extracted from the params object so it lands in the React Query key and triggers a
  // refetch on change, but is forwarded as `company_id` in the query string — same convention as
  // clients.api.js's getAll. 'all'/null/undefined is omitted entirely (no filter param).
  //
  // Deliberately does NOT use the shared explicitBuScope() helper here. Without any override, the
  // request interceptor still attaches X-Company-Id from the globally-active BU regardless of what
  // this page's own filter has selected — and that global BU is frozen to the employee's first
  // mapped BU at login (the navbar switcher that used to change it is commented out in
  // UserMenu.jsx), so picking "All Business Units" would silently keep narrowing to that one stale
  // BU instead of widening to everything the caller can see, and picking a *specific* BU would
  // only actually scope to it if it happened to match that same frozen BU. explicitBuScope('all')
  // would only half-fix this: for a login mapped to more than one BU it deliberately LEAVES the
  // header in place (its own doc comment: several other endpoints still 400 on a header-less
  // request from such a login, so it plays it safe) — but GET /timesheets/import/history is being
  // migrated to accept a header-less request as "every BU this caller can see" (companion backend
  // change), so unconditionally dropping the header for 'all' is what's actually correct here,
  // not the shared helper's conservative default. A specific buId still gets an explicit header so
  // it authoritatively overrides the stale global one rather than depending on it. `buId` omitted
  // entirely (TimesheetImportDetail.jsx) is unaffected — the interceptor's default behavior applies.
  getHistory: ({ buId, ...params } = {}) => {
    const companyIdParam = buId && buId !== 'all' ? { company_id: buId } : {};
    const buScope = buId === undefined
      ? {}
      : buId && buId !== 'all'
        ? { skipCompanyHeader: true, headers: { 'X-Company-Id': String(buId) } }
        : { skipCompanyHeader: true };
    return apiClient
      .get('/timesheets/import/history', { params: { ...params, ...companyIdParam }, ...buScope })
      .then((r) => r.data);
  },
  getImportById: (id) =>
    apiClient.get(`/timesheets/import/${id}`).then((r) => r.data?.data),
  // `buId` scopes this to the BU the import actually belongs to, NOT whatever's globally active
  // in the navbar — those silently diverge the moment a login opens an import from any BU other
  // than its active one (e.g. from Timesheet Imports' "All Business Units" view), and the
  // interceptor's default X-Company-Id header then mismatches the import's own company, coming
  // back with zero rows despite the import genuinely having some (confirmed live: TimesheetList.jsx
  // passes the row's own `company.id`/buFilter through; TimesheetImportDetail.jsx falls back to the
  // BU the history lookup below resolves it under). Omitted entirely, this keeps the interceptor's
  // default behavior — used nowhere today, kept for any future caller that genuinely wants that.
  getImportRows: (id, buId = null) =>
    apiClient.get(`/timesheets/import/${id}/rows`, explicitBuScope(buId ?? undefined)).then((r) => r.data),
  deleteImports: (ids) =>
    apiClient.delete('/timesheets', { data: { ids } }).then((r) => r.data),
  bulkUpdateModifiedHours: (timesheetImportId, timesheets) =>
    apiClient.put(`/timesheets/import/${timesheetImportId}/hours`, { timesheets }).then((r) => r.data),
  publishImport: (timesheetImportId) =>
    apiClient.put(`/timesheets/import/${timesheetImportId}/publish`).then((r) => r.data),
  // Preview call — returns the same shape as upload()'s preview response. Confirming reuses
  // the existing confirm() above, since both sources feed the same import pipeline.
  //
  // BU-scoped exactly like the Monthly Costs import: the chosen id rides X-Company-Id (via
  // explicitBuScope) and also goes in the body as business_unit_id, both carrying the same id so
  // the backend can read either. A null id (a single-BU user, or an unscoped Platform/Entity Admin)
  // sends neither and leaves the interceptor's global-BU header untouched.
  syncEmployeeWorkLogs: (month, year, buId = null) => {
    const body = { month, year };
    if (buId != null) body.business_unit_id = buId;
    return apiClient
      .post('/timesheets/sync-employee-worklogs', body, explicitBuScope(buId ?? undefined))
      .then((r) => r.data?.data);
  },
};
