import apiClient, { explicitBuScope } from '@/services/apiClient';

/**
 * Off-Day Work Requests API
 * Backend contract: response is wrapped as { success, message, data, meta? }
 */
export const offDayRequestsApi = {
  // Employee endpoints
  listMine: (params) =>
    apiClient
      .get('/employee-timesheets/off-day-requests', { params })
      .then((r) => r.data?.data ?? []),

  create: (payload) =>
    apiClient
      .post('/employee-timesheets/off-day-requests', payload)
      .then((r) => r.data?.data ?? r.data),

  resubmit: (id, payload) =>
    apiClient
      .put(`/employee-timesheets/off-day-requests/${id}/resubmit`, payload)
      .then((r) => r.data?.data ?? r.data),

  // Manager / Project Manager queue endpoints
  // `buId` is this screen's own Business Unit filter (independent of whatever's globally active
  // in the navbar) — pulled out of `params` and applied as an explicit request-scoped header, same
  // pattern every other BU-filterable list uses (see myTeamApi.getEmployees). Omitted (undefined)
  // leaves the global X-Company-Id header untouched, exactly as before this filter existed.
  listQueue: ({ buId, ...params } = {}) =>
    apiClient
      .get('/my-team/off-day-requests', { params, ...explicitBuScope(buId) })
      .then((r) => r.data),

  approve: (id) =>
    apiClient
      .put(`/my-team/off-day-requests/${id}/approve`)
      .then((r) => r.data),

  // Not live on the backend yet — see BACKEND_BULK_APPROVE_PROMPT.md for the endpoint spec this
  // call assumes. Until that route exists, callers should fall back to N single `approve` calls
  // (WeekendRequestsTable does this automatically on a 404).
  bulkApprove: (ids) =>
    apiClient
      .post('/my-team/off-day-requests/bulk-approve', { ids })
      .then((r) => r.data),

  reject: (id, payload) =>
    apiClient
      .put(`/my-team/off-day-requests/${id}/reject`, payload)
      .then((r) => r.data),
};
