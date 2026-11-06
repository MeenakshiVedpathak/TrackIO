// Approved-log lock (employee side). The backend refuses any change to an approved work log, so
// the UI mirrors that up front instead of letting the user hit a 409.
//
// The lock is per Service PO per date — NOT for the whole day: an employee can still log against
// other POs on a date where one PO already has an approved line.
//
// Approved is detected defensively (`status` / `approval_status` / `is_approved`) because the
// aggregated GET /daily, /monthly and /monthly-summary trees and the flat /entries list don't
// share one documented field; whichever one the response carries is honoured.
export const APPROVED_LOCK_TOOLTIP = 'Approved — ask your approver to revert it to edit.';

export const isApprovedLog = (node) =>
  node?.status === 'approved'
  || node?.approval_status === 'approved'
  || node?.is_approved === true;

// Service PO ids (as strings) that already have an approved line in a flat list of entries.
export const approvedPoIdsOf = (entries = []) => {
  const ids = new Set();
  entries.forEach((e) => {
    if (isApprovedLog(e) && e.service_po_id != null) ids.add(String(e.service_po_id));
  });
  return ids;
};

// Backend 409s raised by the approved-log lock — shown as-is (the backend wording is already
// specific), but callers also use this to know the screen is stale and should refetch.
const APPROVED_CONFLICT_PATTERN = /approved/i;
export const isApprovedConflict = (err) =>
  err?.response?.status === 409 && APPROVED_CONFLICT_PATTERN.test(err?.response?.data?.message ?? '');

// Rows whose Service PO is locked for `day` (any line under the PO is approved). Every row of a
// locked PO is read-only and left out of a save payload.
export const lockedPoIdsForDay = (rows = [], day) => {
  const ids = new Set();
  rows.forEach((row) => {
    if (row.lockedByDay?.[day]) ids.add(String(row.servicePOId));
  });
  return ids;
};

// Hours already sitting under locked POs for `day` — they still count towards the daily cap even
// though a save never sends them. Only depth-0 rows are summed: a PO row's own `hours` is the
// PO-level figure the backend returns, and children are a breakdown inside it elsewhere in this
// app (see WorkLogEntryTable's groupTotal, which sums every node because a PO can carry its own
// hours on top of the breakdown) — so this sums every row of a locked PO, same as that total.
export const lockedHoursForDay = (rows = [], day) => {
  const locked = lockedPoIdsForDay(rows, day);
  return rows
    .filter((row) => locked.has(String(row.servicePOId)))
    .reduce((sum, row) => sum + Number(row.hoursByDay?.[day] ?? 0), 0);
};
