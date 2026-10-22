import { isOffDay } from '@/utils/weekOffPolicy';

// Single source of truth for how a calendar date is classified on the Employee Dashboard's
// Hours Trend chart and Work Log Status card, so the two widgets never disagree. A real work-log
// entry always outranks weekend/holiday: a date only renders as "weekend"/"holiday" when nothing
// was actually logged against it.
//
// `dayInfo` is the calendar aggregate entry for the date, if any (from GET
// /employee-timesheets/calendar -> { date, totalHours, hasEntries, futureDisabled }).
// `saturdayOffRule` is the caller's own `useSaturdayOffRule()` value — same BU-level policy
// (ALL/ALT_1_3/ALT_2_4/NONE) TimesheetCalendar/EmployeeTimesheet/EmployeeTimeEntry already gate
// off-day logging on via `isOffDay()`. This used to hardcode `date.day() === 0 || date.day() === 6`
// (every Saturday+Sunday), which was wrong for any BU whose policy isn't literally "every Saturday
// off" AND never picked up a policy change without a full logout/login — confirmed live: an Admin
// switching a BU's Saturday-off rule left this dashboard showing the stale classification
// indefinitely, because nothing here ever consulted the live policy at all. Delegating to the same
// `isOffDay()` + `useSaturdayOffRule()` pairing already used elsewhere fixes both: the classification
// now matches the BU's real policy, and it re-resolves on every remount/window-refocus the same way
// those other screens already do (see useSaturdayOffRule.js's own history comment).
// `isHoliday` is threaded through as an explicit option rather than derived here because the app
// has no holiday-calendar source yet. Once a holiday source exists, callers can resolve it per-date
// and pass it in without any change to the priority logic below.
export const classifyWorkDay = (date, dayInfo, { isHoliday = false, saturdayOffRule } = {}) => {
  const isWeekend = isOffDay(date, saturdayOffRule);
  const hasWorkLog = !!dayInfo?.hasEntries;
  const loggedHours = Number(dayInfo?.totalHours ?? 0);

  let status;
  if (hasWorkLog) {
    status = 'logged';
  } else if (isHoliday) {
    status = 'holiday';
  } else if (isWeekend) {
    status = 'weekend';
  } else {
    status = 'no-work-log';
  }

  return { isWeekend, isHoliday, hasWorkLog, loggedHours, status };
};

// A day counts toward "working days" (for average-per-working-day math and the weekend chart
// treatment) only while it's a non-working day AND nothing was logged against it — a logged
// Saturday is already `status: 'logged'` by then, so it naturally falls through to `false` here.
export const isNonWorkingDay = (status) => status === 'weekend' || status === 'holiday';
