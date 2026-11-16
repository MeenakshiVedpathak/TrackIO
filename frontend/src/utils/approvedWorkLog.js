// Approved-log lock (employee side). The backend refuses any change to an approved work log, so
// the UI mirrors that up front instead of letting the user hit a 409.
//
// The lock is per LINE per date (one Service PO + Module/Task node): only the approved line itself
// is read-only. Other lines of the same Service PO (pending / reverted / rejected) stay editable —
// the backend keeps approved lines untouched on a whole-day save even when they're not in the
// payload, and 409s only when a payload tries to change one.
//
// Approved is detected defensively (`status` / `approval_status` / `is_approved`) because the
// aggregated GET /daily, /monthly and /monthly-summary trees and the flat /entries list don't
// share one documented field; whichever one the response carries is honoured.
export const APPROVED_LOCK_TOOLTIP = 'Approved — ask your approver to revert it to edit.';

export const isApprovedLog = (node) =>
  node?.status === 'approved'
  || node?.approval_status === 'approved'
  || node?.is_approved === true;

// `<service_po_id>:<hierarchy node id | 'null'>` — one work-log line.
export const lineKeyOf = (servicePOId, hierarchyNodeId) =>
  `${servicePOId}:${hierarchyNodeId == null || hierarchyNodeId === '' ? 'null' : hierarchyNodeId}`;

export const entryHierarchyIdOf = (e) => e?.hierarchy_node_id ?? e?.hierarchy_id ?? e?.service_po_hierarchy_id ?? null;

// Line keys that are approved in a flat list of entries.
export const approvedLineKeysOf = (entries = []) => {
  const keys = new Set();
  entries.forEach((e) => {
    if (isApprovedLog(e) && e.service_po_id != null) keys.add(lineKeyOf(e.service_po_id, entryHierarchyIdOf(e)));
  });
  return keys;
};

// Backend 409s raised by the approved-log lock — shown as-is (the backend wording is already
// specific), but callers also use this to know the screen is stale and should refetch.
const APPROVED_CONFLICT_PATTERN = /approved/i;
export const isApprovedConflict = (err) =>
  err?.response?.status === 409 && APPROVED_CONFLICT_PATTERN.test(err?.response?.data?.message ?? '');

// Hours on approved (locked) lines for `day` — they still count towards the daily cap even though
// a save never sends them. Every node carries its own hours (see WorkLogEntryTable's groupTotal),
// so each locked line's own figure is summed.
export const lockedHoursForDay = (rows = [], day) =>
  rows
    .filter((row) => row.lockedByDay?.[day])
    .reduce((sum, row) => sum + Number(row.hoursByDay?.[day] ?? 0), 0);
