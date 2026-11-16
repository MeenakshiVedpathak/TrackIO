import { CheckCircle2, Clock3, RotateCcw, Trash2, Undo2, XCircle } from 'lucide-react';
import { entryHierarchyIdOf } from './approvedWorkLog';

// Approval state of a work-log day (calendar) or of one Service PO on a day (entry list), derived
// from the flat GET /employee-timesheets/entries rows:
//   status 'approved' | 'synced'          -> approved
//   status 'rejected'                     -> rejected
//   status 'pending' + revert_reason      -> reverted (an approver sent an approved log back)
//   status 'pending'                      -> pending
// A day with reverted lines next to still-approved ones is "partially reverted". Deleted lines
// aren't in that list by default; they show up only when it's asked with include_deleted (status
// 'deleted' / is_deleted / deleted_at), or via the calendar endpoint's `statusCounts` (summarizeDay).

export const APPROVAL_META = {
  rejected: { label: 'Rejected', icon: XCircle, badge: 'bg-rose-500 text-white', text: 'text-rose-600', dot: 'bg-rose-500' },
  partiallyReverted: { label: 'Partially reverted', icon: Undo2, badge: 'bg-orange-400 text-white', text: 'text-orange-400', dot: 'bg-orange-400' },
  reverted: { label: 'Reverted', icon: RotateCcw, badge: 'bg-orange-500 text-white', text: 'text-orange-600', dot: 'bg-orange-500' },
  pending: { label: 'Pending approval', icon: Clock3, badge: 'bg-amber-400 text-white', text: 'text-amber-600', dot: 'bg-amber-400' },
  approved: { label: 'Approved', icon: CheckCircle2, badge: 'bg-emerald-500 text-white', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  deleted: { label: 'Entry deleted', icon: Trash2, badge: 'bg-slate-500 text-white', text: 'text-slate-600', dot: 'bg-slate-500' },
};

// Order the legend lists them in, most urgent first.
export const APPROVAL_ORDER = ['rejected', 'reverted', 'partiallyReverted', 'pending', 'approved', 'deleted'];

const entryDate = (e) => String(e.timesheet_date ?? e.work_date ?? '').slice(0, 10);

const emptyCounts = () => ({ approved: 0, pending: 0, rejected: 0, reverted: 0, deleted: 0 });

export const isDeletedEntry = (e) => {
  const status = String(e?.status ?? e?.approval_status ?? '').toLowerCase();
  return status === 'deleted' || e?.is_deleted === true || !!e?.deleted_at;
};

// "Deleted" is only flagged when SOMEONE ELSE (approver / admin) removed the line. Lines the
// employee removed themselves (set to 0 / cleared — deleted_by is the employee, or unknown) and lines
// swapped out by a whole-day re-save (deleted_via 'replace' …) are skipped entirely.
const isSelfOrReplacedDelete = (e) => {
  if (!isDeletedEntry(e)) return false;
  if (/replace/i.test(String(e?.deleted_via ?? ''))) return true;
  if (e?.deleted_by == null) return true;
  return e?.employee_id != null && String(e.deleted_by) === String(e.employee_id);
};

const addEntry = (counts, e) => {
  const status = String(e.status ?? e.approval_status ?? '').toLowerCase();
  if (isSelfOrReplacedDelete(e)) return;
  if (isDeletedEntry(e)) counts.deleted += 1;
  else if (status === 'rejected') counts.rejected += 1;
  else if (status === 'approved' || status === 'synced' || e.is_approved === true) counts.approved += 1;
  else if (e.revert_reason) counts.reverted += 1;
  else counts.pending += 1;
};

// { 'YYYY-MM-DD': counts } for a flat list of entries.
export const countsByDate = (entries = []) => {
  const map = {};
  entries.forEach((e) => {
    const key = entryDate(e);
    if (!key) return;
    if (!map[key]) map[key] = emptyCounts();
    addEntry(map[key], e);
  });
  return map;
};

// { [service_po_id]: { counts, rejectionRemark, revertReason } } for one day's entries.
export const statusByServicePo = (entries = []) => {
  const map = {};
  entries.forEach((e) => {
    if (e.service_po_id == null) return;
    const id = String(e.service_po_id);
    if (!map[id]) map[id] = { counts: emptyCounts(), rejectionRemark: '', revertReason: '' };
    addEntry(map[id].counts, e);
    if (e.rejection_remark && !map[id].rejectionRemark) map[id].rejectionRemark = e.rejection_remark;
    if (e.revert_reason && !map[id].revertReason) map[id].revertReason = e.revert_reason;
  });
  return map;
};

// Same shape as statusByServicePo but per entry-list row, keyed like the WorkLogEntryTable rowKeys:
// `h:<hierarchy node id>` for a Parent/Child line, `po:<service_po_id>` for a line logged on the
// Service PO itself. Lets the list flag the exact row that was rejected / reverted.
const hierarchyIdOf = entryHierarchyIdOf;

export const statusByRow = (entries = []) => {
  const map = {};
  entries.forEach((e) => {
    const hid = hierarchyIdOf(e);
    if (hid == null && e.service_po_id == null) return;
    const key = hid != null ? `h:${hid}` : `po:${e.service_po_id}`;
    if (!map[key]) map[key] = { counts: emptyCounts(), rejectionRemark: '', revertReason: '', deletedAt: '' };
    addEntry(map[key].counts, e);
    if (isDeletedEntry(e) && !map[key].deletedAt) map[key].deletedAt = e.deleted_at ?? '';
    if (e.rejection_remark && !map[key].rejectionRemark) map[key].rejectionRemark = e.rejection_remark;
    if (e.revert_reason && !map[key].revertReason) map[key].revertReason = e.revert_reason;
  });
  return map;
};

// Backend counts win when the calendar endpoint sends them (they're the only source for
// `deleted`); otherwise the counts derived from the entries list are used.
export const summarizeDay = (dayInfo, derivedCounts) => {
  const backend = dayInfo?.statusCounts ?? dayInfo?.status_counts;
  return backend ? { ...emptyCounts(), ...backend } : (derivedCounts ?? emptyCounts());
};

// The one state a cell's corner badge shows, by priority. `deleted` only when nothing else is
// left on the day — otherwise it's mentioned in the tooltip and marked separately.
export const approvalStateOf = (counts) => {
  if (!counts) return null;
  if (counts.rejected > 0) return 'rejected';
  if (counts.reverted > 0) return counts.approved > 0 ? 'partiallyReverted' : 'reverted';
  if (counts.pending > 0) return 'pending';
  if (counts.approved > 0) return 'approved';
  if (counts.deleted > 0) return 'deleted';
  return null;
};

// "2 approved · 1 pending · 1 rejected" — for tooltips / aria labels.
export const describeCounts = (counts) => {
  if (!counts) return '';
  const parts = [
    counts.approved && `${counts.approved} approved`,
    counts.pending && `${counts.pending} pending`,
    counts.rejected && `${counts.rejected} rejected`,
    counts.reverted && `${counts.reverted} reverted`,
    counts.deleted && `${counts.deleted} deleted`,
  ].filter(Boolean);
  return parts.join(' · ');
};
