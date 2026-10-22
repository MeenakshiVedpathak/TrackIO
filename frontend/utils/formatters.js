import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

export const formatDate = (date, format = 'DD MMM YYYY') =>
  date ? dayjs(date).format(format) : '—';

export const formatDateTime = (date) =>
  date ? dayjs(date).format('DD MMM YYYY, hh:mm A') : '—';

export const formatRelativeTime = (date) =>
  date ? dayjs(date).fromNow() : '—';

export const formatCurrency = (value, currency = 'INR', decimals = 2) => {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatNumber = (value, decimals = 0) => {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
};

export const formatHours = (hours) => {
  if (hours == null) return '—';
  return `${Number(hours).toFixed(1)}h`;
};

// Decimal hours -> "Xh Ym", for the My Work Log page. A raw decimal (e.g. "6.69 hrs") reads
// as base-100 and also carries JS float noise from summing (6.6899999999999995) — converting
// to actual hours/minutes (base 60) fixes both. Kept compact (h/m, not "hrs"/"min") so it also
// fits the small month-tile grid, not just the stat tiles.
//
// Both units are always shown, including the zero ones: an empty day reads "0h 0m" and a whole
// day "8h 0m", not "0m"/"8h". Dropping the empty unit made the same tile change shape as hours
// were entered ("0m" -> "8h 20m"), which read as a different kind of value rather than the same
// one updating.
export const formatHoursMinutes = (hours) => {
  const totalMinutes = Math.round(Number(hours || 0) * 60);
  // Sign handled up front — Math.floor(-20/60)/-20%60 would otherwise render "-1h -20m".
  const sign = totalMinutes < 0 ? '-' : '';
  const abs = Math.abs(totalMinutes);
  return `${sign}${Math.floor(abs / 60)}h ${abs % 60}m`;
};

// Editable hour-cell text box parsing, shared by WorkLogEntryTable's HourStepper and
// SummaryRow's Day View grid cells (My Work Log / Monthly Summary). The box's text reads/writes
// "H.MM" — hours and minutes, base 60 — not a decimal fraction of an hour: the digits after the
// dot ARE the minutes. A single fractional digit is shorthand for tens of minutes (".6" = 60min,
// ".8" = 80min), so a value that overflows 60 minutes carries into the next hour (4.8 -> 5h20m,
// re-displayed as "5.2"); two digits are literal minutes (".24" = 24min). Only the box's own
// text uses this notation — parseHourMinuteInput returns real decimal hours, and callers keep
// storing/summing/capping that real value, so the rest of the app (sums, caps, the backend
// payload) is unaffected.
export const parseHourMinuteInput = (raw) => {
  const str = String(raw ?? '').trim();
  if (str === '') return NaN;
  const [wholeStr, fracStr = ''] = str.split('.');
  const wholeHours = wholeStr === '' || wholeStr === '-' ? 0 : Number(wholeStr);
  if (!Number.isFinite(wholeHours)) return NaN;
  const fracDigits = fracStr.replace(/\D/g, '');
  let minutes = 0;
  if (fracDigits.length === 1) minutes = Number(fracDigits) * 10;
  else if (fracDigits.length >= 2) minutes = Number(fracDigits.slice(0, 2));
  const carriedHours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return wholeHours + carriedHours + remainderMinutes / 60;
};

export const formatHourMinuteValue = (decimalHours) => {
  const totalMinutes = Math.max(0, Math.round(Number(decimalHours || 0) * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return String(h);
  return m % 10 === 0 ? `${h}.${m / 10}` : `${h}.${String(m).padStart(2, '0')}`;
};

export const formatPercentage = (value, decimals = 1) => {
  if (value == null) return '—';
  return `${Number(value).toFixed(decimals)}%`;
};

export const formatMonthYear = (month, year) => {
  if (!month || !year) return '—';
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM YYYY');
};

export const getInitials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
};

export const truncate = (str, maxLength = 40) => {
  if (!str) return '—';
  return str.length > maxLength ? `${str.substring(0, maxLength)}…` : str;
};

export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Seconds -> "MM:SS", for the Forgot Password OTP/resend countdowns.
export const formatCountdown = (totalSeconds) => {
  const s = Math.max(0, totalSeconds);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const getStatusColor = (status) => {
  const map = {
    active: 'success',
    inactive: 'destructive',
    closed: 'secondary',
    cancelled: 'destructive',
    completed: 'success',
    synced: 'success',
    pending: 'warning',
    failed: 'destructive',
    'in-progress': 'info',
    'on-hold': 'warning',
    pending_approval: 'warning',
    approved: 'success',
    rejected: 'destructive',
  };
  return map[status?.toLowerCase()] ?? 'secondary';
};
