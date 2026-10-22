import apiClient, { explicitBuScope } from '@/services/apiClient';

export const monthlyCostsApi = {
  // `buId` isn't used by any current caller (monthlyCostSample.js, ResourceRecommendations.jsx,
  // WhatIfSimulator.jsx, MonthlyCostDetail.jsx all omit it, so explicitBuScope(undefined) is a
  // no-op and behavior is unchanged) — handled defensively so a future BU-filtered caller doesn't
  // silently inherit the stale global X-Company-Id header, the same bug clients.api.js had.
  getAll: ({ buId, ...params } = {}) =>
    apiClient.get('/monthly-costs', { params, ...explicitBuScope(buId) }).then((r) => r.data),
  getById: (id) => apiClient.get(`/monthly-costs/${id}`).then((r) => r.data?.data),
  create: (payload) => apiClient.post('/monthly-costs', payload).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/monthly-costs/${id}`, payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/monthly-costs/${id}`, { data: { is_delete: true } }).then((r) => r.data),
  deleteMany: (ids) => apiClient.delete('/monthly-costs', { data: { ids } }).then((r) => r.data),
  // Fetches every record id for a given month/year (paged internally at the API's 200-row cap)
  // so a whole period can be bulk-deleted from the grouped summary list.
  // `buId` MUST mirror whatever BU the summary list is currently filtered to: this collects the
  // ids that are about to be deleted, so an unscoped call here would wipe every BU's rows for
  // that period while the user was looking at one BU's numbers.
  getIdsForPeriod: async (month, year, buId) => {
    const ids = [];
    let page = 1;
    let total = Infinity;
    while (ids.length < total) {
      const res = await apiClient
        .get('/monthly-costs', { params: { month, year, page, limit: 200 }, ...explicitBuScope(buId) })
        .then((r) => r.data);
      const rows = Array.isArray(res?.data) ? res.data : [];
      ids.push(...rows.map((r) => r.id));
      total = res?.meta?.total ?? ids.length;
      if (rows.length === 0) break;
      page += 1;
    }
    return ids;
  },
  calculateForMonth: (month, year) =>
    apiClient.post('/monthly-costs/calculate', { month, year }).then((r) => r.data),
  // Imported rows are stamped with the BU picked on the import screen rather than inheriting
  // the login-time active BU: the navbar's global BU switcher is commented out (see
  // components/layout/UserMenu), so that value is not something the user can correct, and
  // uploading a whole month's costs against the wrong BU is expensive to undo.
  //
  // The chosen id goes out twice on purpose:
  //   · `business_unit_id` form field — what the backend should read to stamp each created row.
  //   · X-Company-Id via explicitBuScope — scopes the request itself to that same BU, so the
  //     endpoint lands on the right BU even before it learns to read the form field.
  // Both carry the same id, so there is nothing for the backend to reconcile. A null id (an
  // account with no BUs at all — Platform Admin/Entity Admin, already unscoped) sends neither
  // and leaves the interceptor's existing behaviour untouched.
  // `onUploadProgress` is optional — axios's native progress callback, forwarded straight
  // through so a caller (the mobile "Uploading…" screen) can show a real percentage instead of
  // an indeterminate spinner. Omitted entirely when not passed, so this is a no-op for every
  // existing caller.
  import: ({ file, businessUnitId = null, onUploadProgress }) => {
    const form = new FormData();
    form.append('file', file);
    if (businessUnitId != null) form.append('business_unit_id', String(businessUnitId));

    // explicitBuScope also sets skipCompanyHeader, so its headers must be merged into (not
    // spread over) the multipart Content-Type the upload depends on.
    const scope = explicitBuScope(businessUnitId ?? undefined);
    return apiClient
      .post('/monthly-costs/import', form, {
        ...scope,
        headers: { ...(scope.headers ?? {}), 'Content-Type': 'multipart/form-data' },
        ...(onUploadProgress && {
          onUploadProgress: (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
        }),
      })
      .then((r) => r.data);
  },
};
