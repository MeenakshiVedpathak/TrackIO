import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

// This app is India-only throughout (INR currency, the Mon-Sat IST work week hard-coded in
// weekUtils.js) — timestamps are always shown in IST, not "whatever timezone the viewer's machine
// happens to be set to". Relying on the browser's own local timezone (dayjs's default) breaks the
// moment the viewing machine isn't itself set to IST (a UTC-configured VM/dev box, someone
// travelling) — the conversion becomes a silent no-op and raw UTC clock digits get shown as if
// already local.
const APP_TIMEZONE = 'Asia/Kolkata';

// The API's timestamp columns (created_at/updated_at/rejected_at etc.) serialize as UTC but
// without a 'Z' or +offset suffix, in a space-separated (non-ISO) form, e.g. "2026-09-16 04:47:23".
// Calling `dayjs.utc(...)` on a string like that is NOT enough to force UTC interpretation:
// dayjs's non-strict parser falls back to the native `Date` constructor to get the underlying
// instant first, and per the JS spec a marker-less, space-separated (or even 'T'-separated)
// date-time string is parsed as *local* wall-clock time — `.utc()` only changes how that
// already-wrong instant is later labelled/displayed, it can't undo the initial local-time
// misinterpretation. So the naive string is first normalized into an unambiguous ISO-8601 UTC
// string ("...T...Z") — a form every engine is spec-required to parse as a real UTC instant —
// before dayjs ever sees it. A proper ISO string (already carries 'Z'/offset, e.g. auth.api.js's
// `toISOString()`) is left as-is and parsed normally. Either way, display always converts to IST
// explicitly rather than the browser's local zone.
const HAS_TZ_MARKER = /(Z|[+-]\d{2}:?\d{2})$/i;
const parseServerDateTime = (date) => {
  if (!date) return null;
  const isTzAware = date instanceof Date || (typeof date === 'string' && HAS_TZ_MARKER.test(date.trim()));
  if (isTzAware) return dayjs(date).tz(APP_TIMEZONE);
  const isoUtc = typeof date === 'string' ? `${date.trim().replace(' ', 'T')}Z` : date;
  return dayjs.utc(isoUtc).tz(APP_TIMEZONE);
};

export const formatDate = (date, format = 'DD MMM YYYY') =>
  date ? dayjs(date).format(format) : '—';

export const formatDateTime = (date) => {
  const d = parseServerDateTime(date);
  return d ? d.format('DD MMM YYYY, hh:mm A') : '—';
};

export const formatRelativeTime = (date) => {
  const d = parseServerDateTime(date);
  return d ? d.fromNow() : '—';
};

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

// Sum decimal-hour values the way they are displayed: each value rounded to whole minutes first,
// so sub-minute rounding errors don't accumulate across many entries.
export const sumHours = (values) =>
  values.reduce((minutes, v) => minutes + Math.round((Number(v) || 0) * 60), 0) / 60;

export const formatPercentage = (value, decimals = 1) => {
  if (value == null) return '—';
  return `${Number(value).toFixed(decimals)}%`;
};

export const formatMonthYear = (month, year) => {
  if (!month || !year) return '—';
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM YYYY');
};

// POST /my-team/timesheets/approve's `approved[]` buckets distinguish two zero-row cases:
// `already_settled: true` means someone else (another Manager/PM/Team Lead, or an earlier call)
// approved/rejected that date/month before this call ran — not a failure, just informational.
// `already_settled: false` with rows_approved: 0 is the pre-existing normal no-op (nothing was
// pending that day) and isn't counted here. `responses` is one or more raw approve-endpoint
// payloads (one per Employee, when a selection spans several).
export const countAlreadySettled = (responses) =>
  responses.reduce((sum, r) => sum + (r?.approved ?? []).filter((b) => b.already_settled).length, 0);

// Secondary toast line for the count above — empty string when nothing was already settled, so
// callers can always append it unconditionally.
export const alreadySettledNote = (count) =>
  count > 0 ? ` ${count} ${count === 1 ? 'was' : 'were'} already approved by someone else.` : '';

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
