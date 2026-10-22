// Single source of truth for how a calendar date is classified on the Employee Dashboard's
// Hours Trend chart and Work Log Status card, so the two widgets never disagree. A real work-log
// entry always outranks weekend/holiday: a date only renders as "weekend"/"holiday" when nothing
// was actually logged against it.
//
// `dayInfo` is the calendar aggregate entry for the date, if any (from GET
// /employee-timesheets/calendar -> { date, totalHours, hasEntries, futureDisabled }).
// `isHoliday` is threaded through as an explicit option rather than derived here because the app
// has no holiday-calendar source yet — weekend is the only non-working-day signal available today
// (matching TimesheetCalendar's `day.day() === 0 || day.day() === 6` check). Once a holiday source
// exists, callers can resolve it per-date and pass it in without any change to the priority logic
// below.
export const classifyWorkDay = (date, dayInfo, { isHoliday = false } = {}) => {
  const isWeekend = date.day() === 0 || date.day() === 6;
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
