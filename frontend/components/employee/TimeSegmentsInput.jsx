import { useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TimeRangePicker } from '@/components/ui/time-range-picker';
import { Input } from '@/components/ui/input';
import { sumSegmentHours } from '@/utils/employeeTimeEntry';
import { formatHoursMinutes } from '@/utils/formatters';
import { cn } from '@/utils/cn';

export const BLANK_SEGMENT = { start_time: '', end_time: '', description: '' };

// Ceiling only — around six rows before the list scrolls, so a handful of blocks leaves no blank
// filler. `min-h-0` is the other half of the contract: the list must be free to shrink below this
// when the card is height-constrained, because it is the only section allowed to give up height
// (every other one is shrink-0). A floor here would push the footer actions off screen.
const ROWS_MAX_HEIGHT = 'max-h-[300px] min-h-0';

// Description's 150-char cap — shared by the `maxLength` on the input and the live counter under
// it, so the two can never drift apart.
const DESCRIPTION_MAX_LENGTH = 150;

// Shared between the header captions and every row so the two stay in lockstep — a column added
// here shifts both at once. Kept as one fixed 5-column row (not a responsive stack) — the page
// around this table handles narrow viewports via horizontal scroll with a minimum form width,
// not by rearranging this row's own columns.
// `items-start`, not `items-center`: every cell used to be the same h-9 height so it made no
// difference, but the Description cell is now taller (input + character counter beneath it), and
// top-aligning keeps Start/End/Hours/remove-button level with the description INPUT rather than
// centered against the counter's extra height.
const ROW_GRID =
  'grid items-start gap-2.5 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,72px)_minmax(0,1.6fr)_auto]';

// Exported so a caller can place the control somewhere other than under the rows — the Time Entry
// screen sits it beside its section heading. Styling lives here so both placements stay identical.
// `shrink-0 whitespace-nowrap` keep this from being squeezed by a flex/flex-wrap parent (e.g. the
// section heading row) — without them a tight row shrinks the button below its own text width and
// wraps "Add another time block" across lines instead of moving the button to the next flex line.
export const AddTimeBlockButton = ({ onClick, disabled, className, title }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border bg-card font-medium text-primary transition-colors',
      // No `pointer-events-none` when disabled: it would suppress the title tooltip that explains
      // why the button is unavailable, and a disabled button can't be clicked anyway.
      'hover:border-primary hover:bg-primary/5 disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-card',
      className || 'px-4 py-2.5 text-sm'
    )}
  >
    <Plus className="h-4 w-4 shrink-0" /> Add another time block
  </button>
);

// One or more { start_time, end_time, description } rows for the Time Entry form — "Add another
// time block" appends a blank row, each row past the first gets a remove control. Each row carries
// its own read-only Hours cell (immediate per-block feedback, not just the form's running total),
// always derived from the two times rather than typed — the backend computes the same sum
// server-side. A half-filled row (only one side picked) surfaces the same "both times required"
// message the backend would otherwise 400 on, without waiting for a submit attempt. `segments` is
// expected to always have at least one row (the parent seeds it with BLANK_SEGMENT); this
// component never drops the array down to empty on its own.
//
// `showDescription` switches between two shapes:
//   false (default) — stacked cards with captions above each field, as the Work Log modal uses.
//   true            — one captioned table, with a Description box per block (Time Entry screen).
// The prop exists so adding the Description column to Time Entry left the Work Log modal's
// segment editor untouched.
//
// Row order is presentational only — the backend sums the hours either way, and there's no
// reorder control.
//
// `showAddButton` drops the built-in control for callers that render AddTimeBlockButton themselves.
//
// `scrollRows` caps the row list at ROWS_MAX_HEIGHT and scrolls it internally, with the column
// captions pinned, so adding blocks can never grow the page. Everything around the list — section
// heading, add button, total, and the form's own actions — stays outside the scrolling box.
//
// `minTime` (24-hour "HH:MM") is the earliest time any block may start or end — the Time Entry
// screen's workday start. Hours/minutes before it are greyed out in both pickers rather than
// merely rejected on save. Left unset, every time of day stays selectable.
const TimeSegmentsInput = ({
  segments, onChange, disabled, showDescription = false, showAddButton = true, scrollRows = false,
  minTime,
}) => {
  const scrollRef = useRef(null);
  const prevCountRef = useRef(segments.length);

  // Bring a newly appended row into view inside the list — never by scrolling the page. Only a
  // +1 change counts as an "add": loading a saved entry replaces the whole set at once and should
  // stay at the top.
  useEffect(() => {
    const el = scrollRef.current;
    const added = segments.length === prevCountRef.current + 1;
    prevCountRef.current = segments.length;
    if (!el || !added) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [segments.length]);

  const updateSegment = (index, patch) => {
    onChange(segments.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const addSegment = () => onChange([...segments, BLANK_SEGMENT]);

  // Every row carries a remove control, the only row included — a one-block form still needs a way
  // to undo what was typed. Dropping that last row would break this component's own ≥1-row
  // contract (the parent seeds BLANK_SEGMENT once and nothing re-seeds it afterwards), so on the
  // only row this resets the fields rather than removing it; the button says which it will do.
  const isOnlySegment = segments.length === 1;
  const removeSegment = (index) => {
    if (isOnlySegment) {
      onChange([BLANK_SEGMENT]);
      return;
    }
    onChange(segments.filter((_, i) => i !== index));
  };
  const removeLabel = isOnlySegment ? 'Clear this time block' : 'Remove this time block';

  const addButton = showAddButton ? <AddTimeBlockButton onClick={addSegment} disabled={disabled} /> : null;

  if (showDescription) {
    const table = (
          <div className="space-y-1.5">
            <div
              className={cn(
                ROW_GRID,
                'px-1 text-xs font-medium text-muted-foreground',
                // Captions stay put while the rows scroll under them; bg-card matches the Card so
                // rows can't show through.
                scrollRows && 'sticky top-0 z-10 bg-card pb-2'
              )}
            >
              <span>Start Time</span>
              <span>End Time</span>
              <span>Hours</span>
              {/* Called out as optional so an empty box doesn't read as an unfinished field —
                  neither this component nor the Time Entry form validates it. */}
              <span>Description <span className="font-normal">(optional)</span></span>
              <span className="w-9" aria-hidden="true" />
            </div>

            {segments.map((segment, index) => {
              const isComplete = !!segment.start_time && !!segment.end_time;
              const isPartial = !segment.start_time !== !segment.end_time;
              const duration = isComplete ? sumSegmentHours([segment]) : 0;

              return (
                <div key={index}>
                  <div className={cn(ROW_GRID, 'px-1 py-1.5')}>
                    <TimeRangePicker
                      startValue={segment.start_time ?? ''}
                      endValue={segment.end_time ?? ''}
                      onChange={(start, end) => updateSegment(index, { start_time: start, end_time: end })}
                      disabled={disabled}
                      layout="bare"
                      className="col-span-2 grid-cols-2"
                      minInclusive={minTime}
                    />

                    <div
                      className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium tabular-nums text-muted-foreground"
                      title="Calculated from your start and end times"
                    >
                      {formatHoursMinutes(duration)}
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <Input
                        value={segment.description ?? ''}
                        onChange={(e) => updateSegment(index, { description: e.target.value.slice(0, DESCRIPTION_MAX_LENGTH) })}
                        disabled={disabled}
                        maxLength={DESCRIPTION_MAX_LENGTH}
                        placeholder="What did you work on?"
                        aria-label={`Description for time block ${index + 1}`}
                      />
                      <span className="self-end text-[10px] tabular-nums text-muted-foreground">
                        {(segment.description ?? '').length} / {DESCRIPTION_MAX_LENGTH}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeSegment(index)}
                      disabled={disabled}
                      title={removeLabel}
                      aria-label={`${isOnlySegment ? 'Clear' : 'Remove'} time block ${index + 1}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {isPartial && (
                    <p className="px-1 pb-1 text-[11px] font-medium text-destructive">
                      Both times required
                    </p>
                  )}
                </div>
              );
            })}
          </div>
    );

    if (scrollRows) {
      return (
        // flex + min-h-0, not a plain block: this wrapper sits between the section and the scroll
        // box, and a block's default `min-height: auto` stops the parent's shrink from reaching the
        // box — which left it at its full 300px while the card clipped the overflow, hiding both
        // the last rows and the scrollbar.
        <div className="flex min-h-0 flex-col gap-3">
          {/* The only scrolling region on the page: capped height, vertical scroll only. */}
          <div
            ref={scrollRef}
            className={cn('overflow-y-auto overflow-x-hidden pr-1', ROWS_MAX_HEIGHT)}
            style={{ scrollbarGutter: 'stable' }}
          >
            {table}
          </div>
          {addButton}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">{table}</div>
        {addButton}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {segments.map((segment, index) => {
        const isComplete = !!segment.start_time && !!segment.end_time;
        const isPartial = !segment.start_time !== !segment.end_time;
        const duration = isComplete ? sumSegmentHours([segment]) : 0;

        return (
          <div key={index} className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-end gap-3">
              <span className="mb-2 shrink-0 text-sm font-medium tabular-nums">{index + 1}</span>

              <TimeRangePicker
                startValue={segment.start_time ?? ''}
                endValue={segment.end_time ?? ''}
                onChange={(start, end) => updateSegment(index, { start_time: start, end_time: end })}
                disabled={disabled}
                layout="labeled"
                className="min-w-[220px] flex-1"
                minInclusive={minTime}
              />

              <div className="w-24 shrink-0 space-y-1.5 sm:border-l sm:pl-3">
                <span className="block text-xs font-medium text-muted-foreground">Hours</span>
                <div
                  className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium tabular-nums text-muted-foreground"
                  title="Calculated from your start and end times"
                >
                  {duration.toFixed(2)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeSegment(index)}
                disabled={disabled}
                title={removeLabel}
                aria-label={`${isOnlySegment ? 'Clear' : 'Remove'} time block ${index + 1}`}
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {isPartial && (
              <p className="mt-2 text-[11px] font-medium text-destructive">Both times required</p>
            )}
          </div>
        );
      })}

      {addButton}
    </div>
  );
};

export default TimeSegmentsInput;
