import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getWeekRange, getCurrentWeekRange, getLastWeekRange, shiftWeekRange,
  formatWeekRange, isCalendarWeek,
} from './weekUtils';

describe('getWeekRange', () => {
  it('resolves the Monday start date for a date in the middle of the week', () => {
    // Wed 2026-09-16 -> week is Mon 2026-09-14 .. Sat 2026-09-19 (this app's 6-day business week).
    expect(getWeekRange('2026-09-16')).toEqual({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  it('resolves the Saturday end date correctly', () => {
    expect(getWeekRange('2026-09-16').endDate).toBe('2026-09-19');
  });

  it('is idempotent when given the Monday itself', () => {
    expect(getWeekRange('2026-09-14')).toEqual({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  it('is idempotent when given the Saturday itself', () => {
    expect(getWeekRange('2026-09-19')).toEqual({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  it('resolves a Sunday to the PRECEDING week (Sunday has no week of its own)', () => {
    expect(getWeekRange('2026-09-20')).toEqual({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  it('handles a week that crosses a month boundary', () => {
    // Tue 2026-09-29 -> week is Mon 2026-09-28 .. Sat 2026-10-03.
    expect(getWeekRange('2026-09-29')).toEqual({ startDate: '2026-09-28', endDate: '2026-10-03' });
  });

  it('handles a week that crosses a year boundary', () => {
    // Wed 2025-12-31 -> week is Mon 2025-12-29 .. Sat 2026-01-03.
    expect(getWeekRange('2025-12-31')).toEqual({ startDate: '2025-12-29', endDate: '2026-01-03' });
  });

  it('does not shift by one day the way a raw `new Date(isoString)` UTC parse would', () => {
    // A naive `new Date('2026-09-16')` parse is UTC midnight; anywhere west of Greenwich that
    // reads back as Sep 15 locally, which would silently resolve to the wrong Monday.
    const { startDate, endDate } = getWeekRange('2026-09-16');
    expect(startDate).toBe('2026-09-14');
    expect(endDate).toBe('2026-09-19');
  });
});

describe('getCurrentWeekRange / getLastWeekRange', () => {
  afterEach(() => vi.useRealTimers());

  it('computes the calendar week containing "today"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16)); // Wed 2026-09-16, local time
    expect(getCurrentWeekRange()).toEqual({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  it('computes the week immediately before the current one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    expect(getLastWeekRange()).toEqual({ startDate: '2026-09-07', endDate: '2026-09-12' });
  });

  it('keeps This Week and Last Week from ever overlapping across a month boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1)); // Thu 2026-10-01
    expect(getCurrentWeekRange()).toEqual({ startDate: '2026-09-28', endDate: '2026-10-03' });
    expect(getLastWeekRange()).toEqual({ startDate: '2026-09-21', endDate: '2026-09-26' });
  });
});

describe('shiftWeekRange', () => {
  it('steps back one week from an already-resolved week start', () => {
    expect(shiftWeekRange('2026-09-14', -1)).toEqual({ startDate: '2026-09-07', endDate: '2026-09-12' });
  });

  it('steps forward one week from an already-resolved week start', () => {
    expect(shiftWeekRange('2026-09-14', 1)).toEqual({ startDate: '2026-09-21', endDate: '2026-09-26' });
  });

  it('composes across repeated calls the same way clicking ▶ repeatedly would', () => {
    let range = { startDate: '2026-09-14', endDate: '2026-09-19' };
    range = shiftWeekRange(range.startDate, 1);
    range = shiftWeekRange(range.startDate, 1);
    expect(range).toEqual({ startDate: '2026-09-28', endDate: '2026-10-03' });
  });
});

describe('formatWeekRange', () => {
  it('formats a Mon-Sat week compactly', () => {
    expect(formatWeekRange('2026-09-14', '2026-09-19')).toBe('Sep 14 - Sep 19, 2026');
  });

  it('shows both years when the week crosses a year boundary', () => {
    expect(formatWeekRange('2025-12-29', '2026-01-03')).toBe('Dec 29, 2025 - Jan 3, 2026');
  });

  it('returns an empty string when either bound is missing', () => {
    expect(formatWeekRange(null, '2026-09-19')).toBe('');
    expect(formatWeekRange('2026-09-14', null)).toBe('');
  });
});

describe('isCalendarWeek', () => {
  it('is true for an exact Monday-Saturday span', () => {
    expect(isCalendarWeek('2026-09-14', '2026-09-19')).toBe(true);
  });

  it('is false for a range that is not a full calendar week', () => {
    expect(isCalendarWeek('2026-09-14', '2026-09-18')).toBe(false);
    expect(isCalendarWeek('2026-09-14', '2026-09-20')).toBe(false);
    expect(isCalendarWeek('2026-09-15', '2026-09-19')).toBe(false);
  });
});
