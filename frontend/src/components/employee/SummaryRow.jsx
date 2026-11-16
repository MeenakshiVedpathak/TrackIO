import { memo, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { TableRow, TableCell } from '@/components/ui/table';
import { parseHourMinuteInput, formatHourMinuteValue } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { DAILY_HOURS_CAP } from './WorkLogEntryModal';
import { FIRST_COL_WIDTH, DAY_COL_WIDTH, TOTAL_COL_WIDTH } from './summaryTableLayout';

const clampHours = (n, cap) => Math.min(cap, Math.max(0, n));

// Buffers its own text so it can read/write "H.MM" (hours-and-minutes, base 60 — see
// parseHourMinuteInput) while typing, only converting to/from the real decimal hours the rest
// of the app uses once the cell is committed (blur), same interaction as WorkLogEntryTable's
// HourStepper.
const DayCellInput = ({ value, onCommit, disabled, cap, isDirty }) => {
  const num = Number(value || 0);
  const [inputValue, setInputValue] = useState(formatHourMinuteValue(num));

  useEffect(() => {
    setInputValue(formatHourMinuteValue(num));
  }, [num]);

  const commit = () => {
    const parsed = parseHourMinuteInput(inputValue);
    const next = Number.isFinite(parsed) ? clampHours(Math.round(parsed * 60) / 60, cap) : num;
    setInputValue(formatHourMinuteValue(next));
    if (next !== num) onCommit(next);
  };

  return (
    <input
      type="number"
      step="0.5"
      min="0"
      max={cap}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      disabled={disabled}
      // Spreadsheet-style cell: a light fill marks it editable without the heavy box that made
      // these rows taller than the read-only ones; the border only shows on hover / focus.
      className={cn(
        'h-6 w-full rounded-md border border-transparent bg-primary/[0.06] text-center text-xs font-medium tabular-nums text-foreground transition-colors',
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        'hover:border-input focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isDirty && 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
      )}
    />
  );
};

// One Service/Project (or nested hierarchy node) row in the Monthly Summary table. Memoized so
// scrolling/resizing the 100+ row table doesn't re-render every row on every parent update —
// only a row whose own label/hoursByDay/total/edits/expanded-state actually changed re-renders.
//
// Every row is editable for its own hours, even a node with a hierarchy breakdown underneath
// it (`hasChildren`) — a Service PO or Parent node can carry directly-logged hours *and* have
// children logging their own hours at the same time. `editableDays` caps editing at today,
// same as My Work Log's date picker.
// `isRolledUp` marks a COLLAPSED parent, whose `hoursByDay`/`total` the table has replaced with
// its whole subtree's hours (own + every descendant) so the row isn't showing a bare 0 while the
// rows holding those hours sit hidden beneath it. Such a row renders read-only — the figure is an
// aggregate, not one editable quantity, and typing into it would write the subtree's sum onto the
// parent's own hours on top of the children still carrying them. Expanding restores the row to
// its own editable hours. `subtreeCount` only feeds the explanatory tooltip.
const SummaryRow = ({
  label, depth = 0, hasChildren, isExpanded, onToggleExpand,
  days, hoursByDay, total, editable, isRolledUp, subtreeCount, cellEdits, editableDays, offDayBlockedDays, onCellChange,
}) => (
  // A table row can't literally become a Card, but shading nested rows and accenting an
  // expandable header's left edge gives the same "card accordion" grouping cue My Work Log
  // uses, without giving up the day-column grid this view needs.
  <TableRow className={cn('transition-colors hover:bg-muted/30', depth > 0 && 'bg-muted/10')}>
    <TableCell
      className={cn(
        'summary-col-pinned sticky left-0 pr-2 text-xs',
        depth > 0 ? 'font-normal text-muted-foreground' : 'font-medium',
        // Every top-level row keeps the same 2px left edge (coloured only when expandable) so a
        // Service PO without a hierarchy lines up with the ones that have one.
        depth === 0 && 'border-l-2',
        depth === 0 && (hasChildren ? 'border-l-primary/40' : 'border-l-transparent')
      )}
      style={{
        width: FIRST_COL_WIDTH, minWidth: FIRST_COL_WIDTH, maxWidth: FIRST_COL_WIDTH,
        paddingLeft: 8 + depth * 14,
      }}
      title={label}
    >
      <span className="flex min-w-0 items-center gap-1">
        {depth > 0 && <span className="shrink-0 text-muted-foreground">{'└'}</span>}
        {/* Fixed-width slot whether or not there's a chevron, so labels stay in one column. */}
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {hasChildren && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label}`}
              className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </span>
        {depth === 0 && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
            <Folder className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 truncate">{label}</span>
      </span>
    </TableCell>

    {days.map((day) => {
      const isDirty = cellEdits?.[day] !== undefined;
      const value = isDirty ? cellEdits[day] : (hoursByDay?.[day] ?? '');

      if (!editable || !editableDays?.has(day)) {
        const isOffDayBlocked = editable && offDayBlockedDays?.has(day);
        return (
          <TableCell
            key={day}
            className={cn(
              'px-1 text-center text-xs tabular-nums',
              // Muted so an aggregate never reads as a value you could have typed there.
              isRolledUp && 'italic text-muted-foreground',
              // Read-only cells of an editable row (future days, locked days) shouldn't look bolder
              // than its editable ones — muted, and a zero fainter still.
              !isRolledUp && 'text-muted-foreground',
              !isRolledUp && !Number(hoursByDay?.[day]) && 'text-muted-foreground/50',
              isOffDayBlocked && 'text-muted-foreground/40'
            )}
            style={{ width: DAY_COL_WIDTH, minWidth: DAY_COL_WIDTH, maxWidth: DAY_COL_WIDTH }}
            title={
              isRolledUp
                ? `Total of ${subtreeCount} sub-item${subtreeCount === 1 ? '' : 's'} — expand to edit`
                : isOffDayBlocked
                  ? 'Off day — request approval from My Work Log before logging hours here'
                  : undefined
            }
          >
            {formatHourMinuteValue(hoursByDay?.[day])}
          </TableCell>
        );
      }

      return (
        <TableCell
          key={day}
          className="p-1 text-center"
          style={{ width: DAY_COL_WIDTH, minWidth: DAY_COL_WIDTH, maxWidth: DAY_COL_WIDTH }}
        >
          <DayCellInput
            value={value}
            onCommit={(next) => onCellChange(day, String(next))}
            cap={DAILY_HOURS_CAP}
            isDirty={isDirty}
          />
        </TableCell>
      );
    })}

    <TableCell
      className="summary-col-pinned sticky right-0 text-center font-semibold tabular-nums"
      style={{ width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH, maxWidth: TOTAL_COL_WIDTH }}
      title={isRolledUp ? `Total of ${subtreeCount} sub-item${subtreeCount === 1 ? '' : 's'} — expand to edit` : undefined}
    >
      {formatHourMinuteValue(total)}
    </TableCell>
  </TableRow>
);

export default memo(SummaryRow);
