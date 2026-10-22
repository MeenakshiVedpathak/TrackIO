import apiClient from '@/services/apiClient';

// Employee self-service Work Log — drafts (status: 'pending') until an Admin runs "Sync
// Employee Work Logs" on the Admin Timesheet page, which promotes them to official Timesheet
// records (status: 'synced', read-only from then on). Scoped to the logged-in employee by the
// backend token, never by a client-supplied employee id.
//   GET  /employee-timesheets/calendar?month=&year=   -> [{ date, totalHours, hasEntries, futureDisabled }]
//   GET  /employee-timesheets/daily?date=
//     -> { date, service_pos: [{ service_po_id, service_po_name, hours, po_total_hrs, children }] }
//     (same shape as monthly-summary's per-day entry, just for one date — no individual entry
//     ids are exposed anymore, so entries can't be listed/edited/deleted one at a time)
//   GET  /employee-timesheets/monthly-summary?month=&year=&viewType={day|month}
//     viewType is optional (defaults server-side to 'day') and only changes the response shape:
//     day   -> [{ date, service_pos: [{ service_po_id, service_po_name, hours, po_total_hrs, children }] }]
//     month -> { service_pos: [{ service_po_id, service_po_name, hours, children }], total_hours }
//     (no dates, but the same Parent/Child hierarchy as Day View — a node's `hours` is already
//     rolled up server-side, never re-summed client-side; see MonthlySummaryMonthView below)
//     422 if month/year/viewType is missing or invalid; message is shown via toast as-is.
//   POST /employee-timesheets/entries — whole-day replace, not per-row create. Body is
//     { timesheet_date, entries: [...] }; each line is EITHER hours-based
//     ({ service_po_id, sub_project_id?, hierarchy_node_id?, hours, description }) OR
//     time_entries-based ({ ..., time_entries: [{start_time,end_time}, ...], description } —
//     hours omitted, always server-computed as the sum of the segments), never both. Any
//     existing entry for that date not present in `entries` is deleted server-side, so callers
//     must send every row that should survive, not just edited ones — this is why both the
//     "Work Log" (EmployeeTimesheet.jsx, hours-only) and "Time Entry" (EmployeeTimeEntry.jsx,
//     time_entries-only) forms have to read the day back first before saving; see
//     utils/employeeTimeEntry.js. `entries: []` clears the whole day. Always 200, never
//     409/201 — there's no create-vs-update branch anymore.
//   PUT/DELETE /employee-timesheets/entries/:id — still available for single-row edits. PUT
//     with `time_entries` replaces that row's whole segment breakdown and recalculates hours;
//     omit `time_entries` to leave an existing breakdown untouched.
//   GET /employee-timesheets/entries?status=&page=&limit=&startDate=&endDate=&poId= — flat,
//     individually-id'd list (unlike /daily's aggregated tree), used by the Work Log Rejection
//     Workflow (2026-08-23) to list a rejected entry: status stays 'rejected' after a PUT edit
//     (by design — editing alone doesn't resolve it); rejection_remark/rejected_by_name/
//     rejected_at are preserved through the edit. Each row's `timeEntries` array (non-empty ->
//     Time-based, empty + log_type 'daily' -> Hours-wise, log_type 'monthly' -> Month-wise) is
//     how the Rejected Entries screen picks which edit UI to show — there's no separate "type"
//     field.
//   PUT /employee-timesheets/entries/:id/resubmit — the only way a rejected entry goes back to
//     'pending'; no body. 409 if it wasn't currently 'rejected' (already resubmitted elsewhere).
//
//   GET /employee-timesheets/monthly?month=&year=
//     -> { eligible, service_pos: [{ service_po_id, service_po_name, hours, po_total_hrs, children }] }
//     Same Service PO -> hierarchy tree shape as Daily, but `hours` is the month's total per
//     node rather than one day's. `eligible` (backend-computed, never derived client-side) gates
//     whether the month can be edited/saved.
//   POST /employee-timesheets/monthly — whole-month replace, same semantics as the Daily
//     whole-day replace: body { month, year, entries: [{ service_po_id, hierarchy_node_id?,
//     hours, description }] }, entries omitted are deleted server-side.
//   DELETE /employee-timesheets/monthly?month=&year= — clears the Monthly Work Log for that month.
export const employeeWorkLogApi = {
  getCalendar: ({ month, year }) =>
    apiClient.get('/employee-timesheets/calendar', { params: { month, year } }).then((r) => r.data?.data ?? []),
  getDaily: (date) =>
    apiClient.get('/employee-timesheets/daily', { params: { date } }).then((r) => r.data?.data ?? null),
  getMonthlySummary: ({ month, year, viewType, signal }) =>
    apiClient
      .get('/employee-timesheets/monthly-summary', {
        params: { month, year, ...(viewType ? { viewType } : {}) },
        signal,
      })
      .then((r) => r.data?.data ?? (viewType === 'month' ? { service_pos: [], total_hours: 0 } : [])),
  saveDay: ({ timesheet_date, entries }) =>
    apiClient.post('/employee-timesheets/entries', { timesheet_date, entries }).then((r) => r.data),
  update: (id, payload) => apiClient.put(`/employee-timesheets/entries/${id}`, payload).then((r) => r.data),
  delete: (id) => apiClient.delete(`/employee-timesheets/entries/${id}`).then((r) => r.data),
  getEntries: ({ status, page, limit, startDate, endDate, poId } = {}) =>
    apiClient
      .get('/employee-timesheets/entries', { params: { status, page, limit, startDate, endDate, poId } })
      .then((r) => r.data),
  resubmit: (id) => apiClient.put(`/employee-timesheets/entries/${id}/resubmit`).then((r) => r.data),
  getMonthly: ({ month, year }) =>
    apiClient.get('/employee-timesheets/monthly', { params: { month, year } }).then((r) => r.data?.data ?? null),
  saveMonthly: ({ month, year, entries }) =>
    apiClient.post('/employee-timesheets/monthly', { month, year, entries }).then((r) => r.data),
  deleteMonthly: ({ month, year }) =>
    apiClient.delete('/employee-timesheets/monthly', { params: { month, year } }).then((r) => r.data),
  // POST /employee-timesheets/remind-approval
  // No request body — the backend resolves the employee and their primary manager from the
  // Bearer token alone. Returns { success, message, data: { managerName, pendingCount, period } }.
  // 400 / 429 / 502 are user-facing errors; callers should surface err.response.data.message
  // verbatim rather than a generic fallback.
  remindApproval: () =>
    apiClient.post('/employee-timesheets/remind-approval').then((r) => r.data),
};
