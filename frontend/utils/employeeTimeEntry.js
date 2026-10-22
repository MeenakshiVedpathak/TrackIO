// Time Entry form — a single Module/Task + date + one-or-more { start_time, end_time } segments,
// kept entirely separate from the plain-hours "Work Log" form (see WorkLogEntryTable.jsx /
// EmployeeTimesheet.jsx, which never send time_entries anymore). Both forms write into the same
// day's lines via POST /employee-timesheets/entries, and that endpoint is a whole-day REPLACE —
// it deletes every entry for the date and reinserts exactly what's sent. So creating/editing a
// segmented line here must first read back the day's *other* lines (GET
// /employee-timesheets/daily) and resend them untouched, or saving here would wipe out whatever
// the Work Log form already saved for that date (and vice versa).
import { buildMonthlySummaryRows } from './employeeMonthlySummary';

const dayNumberOf = (dateStr) => Number(dateStr.slice(-2));

const rowsForDate = (dailyData, date) =>
  buildMonthlySummaryRows([{ date: dailyData?.date ?? date, service_pos: dailyData?.service_pos ?? [] }]);

const sameLine = (row, servicePOId, hierarchyNodeId) =>
  String(row.servicePOId) === String(servicePOId)
  && String(row.hierarchyId ?? '') === String(hierarchyNodeId || '');

// Looks for an already-saved line for this exact Module/Task on this date, so the caller can
// prefer a targeted PUT (only touches that one row) over a whole-day replace when the backend
// has exposed an id for it — GET /employee-timesheets/daily's aggregated tree doesn't expose
// entry ids in this app's current contract, so `id` is undefined more often than not; callers
// must fall back to the whole-day replace path (see buildOtherDayEntries) whenever it is.
export const findExistingLine = (dailyData, date, servicePOId, hierarchyNodeId) => {
  const day = dayNumberOf(dailyData?.date ?? date);
  const row = rowsForDate(dailyData, date).find((r) => sameLine(r, servicePOId, hierarchyNodeId));
  if (!row) return null;
  const hours = Number(row.hoursByDay?.[day] ?? 0);
  if (hours <= 0 && row.id == null) return null;
  return { id: row.id ?? null, hours };
};

// Every other line from that date's tree (i.e. not the Module/Task being saved here), resent as
// a plain-hours line so it survives the whole-day replace. This is the best fidelity achievable
// from GET /daily's aggregated `{ hours }` shape — it doesn't expose a line's original
// time_entries breakdown, so a previously-segmented line that isn't the one being edited is
// necessarily flattened to its current total hours rather than truly resent "unchanged"
// segment-for-segment. Total hours are always preserved exactly; only the segment-level detail
// of *other* lines can't be recovered this way without the backend also returning it.
export const buildOtherDayEntries = (dailyData, date, excludeServicePOId, excludeHierarchyNodeId) => {
  const day = dayNumberOf(dailyData?.date ?? date);
  return rowsForDate(dailyData, date)
    .filter((row) => !sameLine(row, excludeServicePOId, excludeHierarchyNodeId))
    .map((row) => ({ row, hours: Number(row.hoursByDay?.[day] ?? 0) }))
    .filter(({ hours }) => hours > 0)
    .map(({ row, hours }) => ({
      service_po_id: row.servicePOId,
      hierarchy_node_id: row.hierarchyId ?? null,
      hours,
      description: row.label ?? 'Logged via Work Log',
    }));
};

// Mirrors the two 400s the backend enforces on a line's time_entries (end <= start, overlapping
// segments), so the user sees the same wording without a round trip. `segments` here is always
// the fully-typed set the form is about to submit — blank/never-filled-in rows are filtered out
// by the caller before this runs. Returns the error string, or null if the set is valid.
export const validateSegments = (segments) => {
  if (segments.length === 0) {
    return 'Add at least one time segment.';
  }
  for (const segment of segments) {
    if (!segment.start_time || !segment.end_time) {
      return 'Both start and end time are required for every segment.';
    }
    if (segment.end_time <= segment.start_time) {
      return 'End time must be after start time.';
    }
  }
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        return `Time entries overlap: ${a.start_time}-${a.end_time} and ${b.start_time}-${b.end_time}.`;
      }
    }
  }
  return null;
};

const timeToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Client-side mirror of the server-computed `hours` (sum of every segment's duration), for
// display and for the 12-hours/day cap pre-check only — never sent to the backend, which always
// recomputes it from time_entries itself.
export const sumSegmentHours = (segments) =>
  Math.round(
    segments.reduce((sum, s) => {
      if (!s.start_time || !s.end_time) return sum;
      const diff = timeToMinutes(s.end_time) - timeToMinutes(s.start_time);
      return diff > 0 ? sum + diff / 60 : sum;
    }, 0) * 100
  ) / 100;
