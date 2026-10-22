import * as React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const pad = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

// Selection/storage stays 24-hour "HH:MM" (what the backend/rest of the Work Log flow expects) —
// only the display box formats it as 12-hour + AM/PM, derived from whatever was picked.
const formatDisplay = (value) => {
  const [hh, mm] = (value || '').split(':');
  if (!hh || mm === undefined) return '--:-- --';
  const h24 = Number(hh);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${hour12}:${mm} ${period}`;
};

// One scrollable Hour or Minute column, styled to match the app (accent-highlighted selection,
// hover states, rounded) instead of the browser's own unstyled native spinner. Auto-scrolls the
// current value to the middle whenever the popover opens — or, with nothing picked yet, the first
// SELECTABLE item, so a column whose early entries are all disabled (e.g. hours before a 09:00
// workday start) opens on the first hour that can actually be chosen instead of on a wall of
// grayed-out ones. `isItemDisabled` grays out and blocks clicking items that would produce an
// invalid time (e.g. an End time at/before Start, or anything before the earliest allowed time).
const TimeColumn = ({ items, value, onSelect, label, open, isItemDisabled }) => {
  const selectedRef = React.useRef(null);
  const firstEnabled = items.find((item) => !(isItemDisabled?.(item) ?? false));
  const scrollTarget = value != null && items.includes(value) ? value : firstEnabled;

  React.useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'center' });
  }, [open]);

  return (
    <div className="flex flex-col items-center">
      <div className="pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="h-48 w-14 overflow-y-auto rounded-md border bg-muted/30">
        {items.map((item) => {
          const isSelected = item === value;
          const isDisabled = isItemDisabled?.(item) ?? false;
          return (
            <button
              key={item}
              type="button"
              ref={item === scrollTarget ? selectedRef : undefined}
              onClick={() => onSelect(item)}
              disabled={isDisabled}
              className={cn(
                'block w-full px-2 py-1 text-center text-sm tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground',
                isSelected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                isDisabled && 'pointer-events-none text-muted-foreground/40 hover:bg-transparent',
              )}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Displays "h:mm AM/PM" (or a placeholder) in a box that is itself the popover trigger — clicking
// anywhere in the field opens the picker (the clock is just a decorative affordance, not its own
// button). The popover itself is two custom 24-hour Hour(00-23)/Minute(00-59) columns (any minute,
// not a fixed-step list) rather than the OS's native time-input spinner; the value stored/emitted
// is always 24-hour "HH:MM".
//
// `open`/`onOpenChange` let a parent (TimeRangePicker) control this picker's visibility so it can
// auto-open the next field; omit both for standalone/uncontrolled use. `onComplete` fires once
// per open session, the moment the user has clicked both an hour AND a minute (not just whenever
// the value happens to look complete — picking only the hour leaves minute defaulted to "00",
// which would otherwise look "complete" without the user ever touching the minute column).
// `minExclusive` (a 24-hour "HH:MM", e.g. the paired Start time on an End picker) disables every
// hour before it and, within that same hour, every minute at or before it — "HH:MM" strings
// zero-padded to the same length compare correctly with plain `<`/`<=`, no need to parse minutes.
// `minInclusive` (also "HH:MM") is the same idea one notch looser — the earliest time that IS
// selectable, for a screen with a fixed opening time (Time Entry's 09:00 workday start). Both can
// apply at once on an End picker: no earlier than the workday start, and still after Start.
export const TimeInput = ({
  value, onChange, disabled, className, label, open: openProp, onOpenChange, onComplete,
  minExclusive, minInclusive,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const [hh, mm] = (value || '').split(':');
  const pickedRef = React.useRef({ hour: false, minute: false });

  React.useEffect(() => {
    if (open) pickedRef.current = { hour: false, minute: false };
  }, [open]);

  const checkComplete = () => {
    if (pickedRef.current.hour && pickedRef.current.minute) {
      setOpen(false);
      onComplete?.();
    }
  };

  const [minHH, minMM] = (minExclusive || '').split(':');
  const [floorHH, floorMM] = (minInclusive || '').split(':');

  // The lowest minute still selectable within a given hour, honouring both bounds at once: one
  // past minExclusive's minute inside its hour, at or after minInclusive's minute inside its own,
  // and unrestricted in every other hour. Deliberately not clamped to 59 — a start of 23:59 leaves
  // hour 23 with no selectable minute at all, and 60 is what says so.
  const earliestMinuteFor = (h) => {
    const afterStart = minHH !== undefined && h === minHH && minMM !== undefined ? Number(minMM) + 1 : 0;
    const afterFloor = floorHH !== undefined && h === floorHH && floorMM !== undefined ? Number(floorMM) : 0;
    return Math.max(afterStart, afterFloor);
  };

  // The default minute for a freshly-picked hour is normally "00", but in the bounded hour "00"
  // is itself a disabled minute — defaulting to it would show an invalid combination as the
  // "current" value. Default to the first valid minute instead.
  const defaultMinuteFor = (h) => pad(Math.min(59, earliestMinuteFor(h)));

  const setHour = (h) => {
    onChange(`${h}:${mm ?? defaultMinuteFor(h)}`);
    pickedRef.current = { ...pickedRef.current, hour: true };
    checkComplete();
  };
  const setMinute = (m) => {
    onChange(`${hh ?? '00'}:${m}`);
    pickedRef.current = { ...pickedRef.current, minute: true };
    checkComplete();
  };

  // An hour is out if it falls below either bound, or if the bounds leave it with no minute to
  // pick (start 23:59 -> hour 23 can only produce an end at or before the start).
  const isHourDisabled = (h) => (minHH !== undefined && h < minHH)
    || (floorHH !== undefined && h < floorHH)
    || earliestMinuteFor(h) > 59;
  const isMinuteDisabled = (m) => hh !== undefined && Number(m) < earliestMinuteFor(hh);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ? `Open ${label} time picker` : 'Open time picker'}
          disabled={disabled}
          className={cn(
            'flex h-9 items-center gap-1 rounded-md border bg-transparent pl-2 pr-1 text-left',
            'transition-colors hover:bg-muted/40',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
        >
          <span className={cn('flex-1 text-xs tabular-nums', !(hh && mm !== undefined) && 'text-muted-foreground')}>
            {formatDisplay(value)}
          </span>
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground"
          >
            <Clock className="h-3.5 w-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-2">
          <TimeColumn items={HOURS} value={hh} onSelect={setHour} label="HH" open={open} isItemDisabled={isHourDisabled} />
          <TimeColumn items={MINUTES} value={mm} onSelect={setMinute} label="MM" open={open} isItemDisabled={isMinuteDisabled} />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TimeInput;
