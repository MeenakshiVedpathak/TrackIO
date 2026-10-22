// Calendar-week helpers for the Reports suite's "Weekly" filter — Monday is the start of the week
// and SATURDAY is the end (a 6-day business week; Sunday is the off day and belongs to no week).
// This is the app's own stated convention, not the generic Mon-Sun default a calendar picker would
// normally assume — nothing else in the codebase defines a conflicting "reporting week" (the only
// other week concept is TimesheetCalendar.jsx's dayjs `.startOf('week')`, which is Sunday-based,
// but that's calendar-grid leading-day padding for a month view, not a business definition of a
// reporting period).
//
// Clicking a Sunday in WeekPicker's calendar resolves to the week whose Saturday was the day
// before it (the week Sunday is the "day off" from), not a week of its own — Sunday has no week
// under this scheme, so falling back to the preceding one is the least surprising choice.

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Local-midnight Date from a YYYY-MM-DD string — deliberately never `new Date(isoString)`, which
// parses a bare date as UTC and can land on the wrong calendar day west of Greenwich. Same pitfall
// date-picker.jsx and date-range-picker.jsx already avoid the same way.
const parseISODate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toISODate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Date.getDay(): 0=Sunday..6=Saturday. Days back to Monday: Sunday is 6 days after the preceding
// Monday; every other day is (getDay() - 1) days after it.
const mondayOffset = (date) => (date.getDay() === 0 ? 6 : date.getDay() - 1);

// The Monday-Saturday week containing `dateStr` (any ISO date within, or the Sunday right after,
// the week), as inclusive {startDate, endDate} — the same shape DateRangePicker already emits, so
// it's a drop-in value for any report's existing startDate/endDate param wiring.
export const getWeekRange = (dateStr) => {
  const date = parseISODate(dateStr);
  const start = new Date(date);
  start.setDate(date.getDate() - mondayOffset(date));
  const end = new Date(start);
  end.setDate(start.getDate() + 5);
  return { startDate: toISODate(start), endDate: toISODate(end) };
};

export const getCurrentWeekRange = () => getWeekRange(toISODate(new Date()));

export const getLastWeekRange = () => {
  const { startDate } = getCurrentWeekRange();
  const anchor = parseISODate(startDate);
  anchor.setDate(anchor.getDate() - 1);
  return getWeekRange(toISODate(anchor));
};

// Shifts an already-resolved week's start date by `deltaWeeks` whole weeks (negative steps back) —
// the compact picker's ◀ ▶ stepper calls this on the CURRENTLY SELECTED week rather than always
// re-anchoring off "today", so repeatedly clicking ▶ walks forward one real week at a time instead
// of getting stuck one step from "this week" forever.
export const shiftWeekRange = (startDate, deltaWeeks) => {
  const anchor = parseISODate(startDate);
  anchor.setDate(anchor.getDate() + deltaWeeks * 7);
  return getWeekRange(toISODate(anchor));
};

// "Sep 14 - Sep 19, 2026" — repeats the month abbreviation on both ends, and only doubles the year
// when the week actually crosses one (a Mon-Sat week almost never does, but a Dec 29 - Jan 3 week
// can).
export const formatWeekRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '';
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const startLabel = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`;
  const endLabel = `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}`;
  return start.getFullYear() !== end.getFullYear()
    ? `${startLabel}, ${start.getFullYear()} - ${endLabel}, ${end.getFullYear()}`
    : `${startLabel} - ${endLabel}, ${end.getFullYear()}`;
};

// True when {startDate,endDate} is exactly one Monday-Saturday calendar week. Not required by any
// current caller (WeekPicker always produces an exact week itself), but exported so a report that
// restores a persisted range can still label it "Weekly" rather than falling back to "Custom Range".
export const isCalendarWeek = (startDate, endDate) => {
  if (!startDate || !endDate) return false;
  const range = getWeekRange(startDate);
  return range.startDate === startDate && range.endDate === endDate;
};
