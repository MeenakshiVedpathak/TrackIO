import dayjs from 'dayjs';

// Invoice Master (Service PO Monthly Budget) is writable for the current calendar month at any
// point during that month, plus a grace period on the previous month through the 7th day of the
// current month. NOTE: as of 2026-08-19 the backend still enforces the older, stricter rule
// (previous month only, thru the 7th — current month never writable) — this frontend gate is
// ahead of that pending a backend change, so a save can still 400 with INVOICE_MASTER_LOCK_MESSAGE
// until the backend catches up.
export const getInvoiceMasterWritablePeriods = (today = dayjs()) => {
  const periods = [{ month: today.month() + 1, year: today.year() }];
  if (today.date() <= 7) {
    const prev = today.subtract(1, 'month');
    periods.push({ month: prev.month() + 1, year: prev.year() });
  }
  return periods;
};

export const isInvoiceMasterPeriodWritable = (month, year, today = dayjs()) =>
  getInvoiceMasterWritablePeriods(today).some((p) => p.month === month && p.year === year);

// Exact text of the backend's 400 rejection for its still-stricter rule — kept verbatim so the
// entry sheet can detect that specific error and show it as a persistent banner instead of a toast.
export const INVOICE_MASTER_LOCK_MESSAGE =
  'Invoice Master can only be added or modified for the previous month until the 7th day of the current month.';

// Frontend-facing copy describing the wider client-side window above — deliberately a different
// string from INVOICE_MASTER_LOCK_MESSAGE so it's never mistaken for the backend's own message.
export const INVOICE_MASTER_WINDOW_MESSAGE =
  'Monthly PO Reporting is editable for the current month, plus the previous month through the 7th day of this month.';

// Live "time left to fill" for a given month/year. A month M's data is fillable continuously
// from day 1 of M through the 7th of the month right after M — that's the same window as
// getInvoiceMasterWritablePeriods above, just described from month M's own point of view instead
// of "today's". So the deadline for ANY writable month is always the 7th of its next month, end
// of day — whether M is the current calendar month (deadline still weeks away) or last month's
// grace period (deadline imminent). Anything outside that window comes back non-writable/"Locked".
export const getInvoiceMasterCountdown = (month, year, today = dayjs()) => {
  const isWritablePeriod = getInvoiceMasterWritablePeriods(today)
    .some((p) => p.month === month && p.year === year);

  if (!isWritablePeriod) {
    return { writable: false, label: 'Locked', severity: 'locked', deadline: null };
  }

  const nextMonth = dayjs(new Date(year, month - 1, 1)).add(1, 'month');
  const deadline = dayjs(new Date(nextMonth.year(), nextMonth.month(), 7, 23, 59, 59));

  const diffMs = deadline.diff(today);
  if (diffMs <= 0) {
    return { writable: false, label: 'Locked', severity: 'locked', deadline };
  }

  const diffHours = diffMs / (1000 * 60 * 60);
  let label;
  let severity;
  if (diffHours < 24) {
    const hoursLeft = Math.max(1, Math.round(diffHours));
    label = `${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'} left`;
    severity = 'critical';
  } else {
    const daysLeft = Math.ceil(diffHours / 24);
    label = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
    severity = daysLeft <= 3 ? 'warning' : 'normal';
  }

  return { writable: true, label, severity, deadline };
};
