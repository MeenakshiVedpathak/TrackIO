import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeekPicker } from './week-picker';
import { getWeekRange } from '@/utils/weekUtils';

// The compact WeekPicker (◀ [range] ▶ [📅] stepper + a persistent This Week/Last Week pill row)
// puts its quick-pick buttons directly in the main render, not behind a Radix Popover — so unlike
// the calendar-icon's popover (still untestable here; see the note on that one test below), these
// are exercised with a plain click, no "open the popover first" step needed.
//
// No future week is selectable: every report this feeds is a report on what's already happened.
describe('WeekPicker', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the placeholder when no week is selected', () => {
    render(<WeekPicker value={null} onChange={() => {}} placeholder="Select week" />);
    expect(screen.getByText('Select week')).toBeInTheDocument();
  });

  it('shows the formatted range when a week is selected', () => {
    render(<WeekPicker value={{ startDate: '2026-09-14', endDate: '2026-09-19' }} onChange={() => {}} />);
    expect(screen.getByText('Sep 14 - Sep 19, 2026')).toBeInTheDocument();
  });

  it('there is no "Next Week" pill at all', () => {
    render(<WeekPicker value={null} onChange={() => {}} />);
    // Exact, case-sensitive match — the ▶ chevron's own aria-label is "Next week" (lowercase
    // "week"), which a case-insensitive query would also match and give a false pass/fail here.
    expect(screen.queryByRole('button', { name: 'Next Week' })).not.toBeInTheDocument();
  });

  it('"This Week" emits the Monday-Saturday range containing today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16)); // Wed 2026-09-16
    const onChange = vi.fn();
    render(<WeekPicker value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'This Week' }));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  it('"Last Week" emits the week immediately before the current one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    const onChange = vi.fn();
    render(<WeekPicker value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Last Week' }));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-07', endDate: '2026-09-12' });
  });

  it('highlights whichever pill matches the current value', () => {
    // Which pill (if any) is "active" depends on today's date, so the clock has to be pinned
    // before rendering: with "now" fixed to Wed 2026-09-16, the Mon 09-07..Sat 09-12 selection is
    // exactly last week's range.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    render(<WeekPicker value={{ startDate: '2026-09-07', endDate: '2026-09-12' }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Last Week' })).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: 'This Week' })).not.toHaveClass('bg-primary');
  });

  it('◀ steps back exactly one week from the current selection', () => {
    const onChange = vi.fn();
    render(<WeekPicker value={{ startDate: '2026-09-14', endDate: '2026-09-19' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-07', endDate: '2026-09-12' });
  });

  it('◀ from an empty selection falls back to Last Week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    const onChange = vi.fn();
    render(<WeekPicker value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-07', endDate: '2026-09-12' });
  });

  it('▶ steps forward exactly one week when the selection is behind This Week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16)); // "now" = Wed 2026-09-16, This Week = 09-14..09-19
    const onChange = vi.fn();
    render(<WeekPicker value={{ startDate: '2026-09-07', endDate: '2026-09-12' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });

  // No future week is selectable at all — every way to go further into the future disables
  // together once the selection reaches This Week.
  it('disables ▶ once the selection reaches This Week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    render(<WeekPicker value={{ startDate: '2026-09-14', endDate: '2026-09-19' }} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
  });

  it('▶ starts disabled with nothing selected yet (treated as already at This Week)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    render(<WeekPicker value={null} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
  });

  it('▶ stays enabled for any week strictly before This Week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16));
    render(<WeekPicker value={{ startDate: '2026-09-07', endDate: '2026-09-12' }} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();
  });

  // The calendar-icon's popover (arbitrary day-click -> snaps to that day's week, with days past
  // This Week's Saturday disabled) still can't be opened in this jsdom setup — every attempt
  // (userEvent and fireEvent, plus ResizeObserver/pointer-capture/scrollIntoView/
  // requestAnimationFrame polyfills in src/test/setup.js) reproducibly hangs 30s-370s+, a known
  // category of Radix Popover + jsdom incompatibility (floating-ui's positioning never stabilizes
  // against jsdom's zero-size layout). Covered instead by locking in the exact function it
  // delegates to (see week-picker.jsx's selectWeekContaining) plus manual verification in a real
  // browser; the future-day disable itself is a one-line comparison against thisWeek.endDate,
  // directly inspectable in week-picker.jsx.
  it('a day click would delegate to getWeekRange for that day', () => {
    expect(getWeekRange('2026-09-16')).toEqual({ startDate: '2026-09-14', endDate: '2026-09-19' });
  });
});
