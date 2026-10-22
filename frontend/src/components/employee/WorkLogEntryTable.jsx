import {
  useMemo, useState, useEffect, useLayoutEffect, useRef,
} from 'react';
import {
  ChevronUp, ChevronDown, Folder, Minus, Plus, UnfoldVertical, FoldVertical,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/common/EmptyState';
import { cn } from '@/utils/cn';
import { formatHoursMinutes, parseHourMinuteInput, formatHourMinuteValue, sumHours } from '@/utils/formatters';
import { DAILY_HOURS_CAP } from './WorkLogEntryModal';

const STEP = 0.5;
export const DESCRIPTION_MAX_LENGTH = 500;

const buildChildrenByParent = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const parentKey = row.ancestorKeys?.[row.ancestorKeys.length - 1];
    if (!parentKey) return;
    if (!map.has(parentKey)) map.set(parentKey, []);
    map.get(parentKey).push(row);
  });
  return map;
};

const flattenSubtree = (row, relDepth, childrenByParent) => {
  const kids = childrenByParent.get(row.rowKey) ?? [];
  return [{ ...row, relDepth }, ...kids.flatMap((k) => flattenSubtree(k, relDepth + 1, childrenByParent))];
};

const clampHours = (n, cap) => Math.min(cap, Math.max(0, n));

// Starts at a single line and grows only once typed content actually wraps to a next line,
// instead of always reserving a fixed multi-line block regardless of how short the text is.
// Exported for reuse by any other per-row description field in the app (see
// pages/myTeam/TeamLeadFillWorkLog.jsx) rather than re-implementing the same resize logic.
export const AutoResizeTextarea = ({ value, className, ...props }) => {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cn('overflow-hidden', className)}
      {...props}
    />
  );
};

// `hoursCap` defaults to the Daily 24-hr cap so existing Daily callers (which don't pass it)
// are unaffected; Monthly mode passes a much larger cap since a node's hours there is a
// whole month's total, not one day's.
const HourStepper = ({ value, onChange, disabled, hoursCap = DAILY_HOURS_CAP }) => {
  const num = Number(value || 0);
  const [inputValue, setInputValue] = useState(formatHourMinuteValue(num));

  useEffect(() => {
    setInputValue(formatHourMinuteValue(num));
  }, [num]);

  const commit = () => {
    const parsed = parseHourMinuteInput(inputValue);
    const next = Number.isFinite(parsed) ? clampHours(Math.round(parsed * 60) / 60, hoursCap) : num;
    setInputValue(formatHourMinuteValue(next));
    if (next !== num) onChange(next);
  };

  // Propagates to the parent (and so to whatever "unsaved change"/Save-button dirty-tracking it
  // drives) on every keystroke that parses to a real, in-range value — not just on blur/Enter via
  // commit() above. Typing a value and saving immediately without first clicking elsewhere used to
  // leave Save disabled since nothing had "committed" yet. Deliberately NOT clamping an
  // out-of-range in-progress value here (e.g. typing "15" toward a smaller in-range number) — that
  // would round-trip through the `value` prop and the [num] effect below, resetting `inputValue`
  // mid-keystroke; out-of-range values still only get clamped at commit() time.
  const handleInputChange = (e) => {
    const raw = e.target.value;
    setInputValue(raw);
    const parsed = parseHourMinuteInput(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= hoursCap && parsed !== num) {
      onChange(parsed);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(clampHours(num - STEP, hoursCap))}
        disabled={disabled}
        className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        step={STEP}
        min="0"
        max={hoursCap}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        // A focused number input treats page-scroll wheel events as +/- clicks by default —
        // scrolling to reach another module's row while this one still has focus silently
        // changed its value. Blurring on wheel hands the scroll back to the page and commits
        // whatever was already typed (onBlur, above), same as pressing Enter or tabbing away.
        onWheel={(e) => e.currentTarget.blur()}
        disabled={disabled}
        className="w-9 rounded border bg-transparent text-center text-xs font-medium tabular-nums [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clampHours(num + STEP, hoursCap))}
        disabled={disabled}
        className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
};

// One Service PO folder — its own row plus every hierarchy node beneath it (Parent/Child,
// indented, "Task / Feature" being the node's name since our data has no separate module
// concept). Open/closed is controlled by the parent (see collapsedGroupKeys) so Expand All /
// Collapse All can drive every folder at once; it defaults collapsed so every mapped project's
// total hrs is visible in one glance as a single line, expand only the one(s) you want to edit.
const ProjectGroup = ({
  poRow, childrenByParent, day, edits, onCellChange, isPastOrToday, hoursCap, isOpen, onToggleOpen,
  descriptions, onDescriptionChange, collapsedKeys, onToggleRowCollapse,
}) => {
  const nodeRows = useMemo(() => flattenSubtree(poRow, 0, childrenByParent), [poRow, childrenByParent]);
  const visibleRows = useMemo(
    () => nodeRows.filter((row) => !row.ancestorKeys?.some((key) => collapsedKeys.has(key))),
    [nodeRows, collapsedKeys],
  );

  const cellValueOf = (r) => {
    const edited = edits?.[r.rowKey]?.[day];
    return edited !== undefined ? Number(edited || 0) : Number(r.hoursByDay?.[day] ?? 0);
  };
  const groupTotal = sumHours(nodeRows.map(cellValueOf));

  const descriptionValueOf = (r) => {
    const edited = descriptions?.[r.rowKey]?.[day];
    return edited !== undefined ? edited : (r.descriptionByDay?.[day] ?? '');
  };

  // Own hours plus every descendant's. The folder header above already shows this for the whole
  // Service PO; a COLLAPSED node inside it needs the same, or it reads 0 while the rows holding
  // its hours sit hidden underneath (a Parent/PO can carry its own hours *and* have a breakdown
  // at the same time, so its own figure is genuinely 0 in that case).
  const subtreeValueOf = (r) =>
    sumHours(
      nodeRows
        .filter((n) => n.rowKey === r.rowKey || (n.ancestorKeys ?? []).includes(r.rowKey))
        .map(cellValueOf)
    );

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
          <Folder className="h-3 w-3" />
        </span>
        <span className="flex-1 truncate text-xs font-semibold" title={poRow.label}>{poRow.label}</span>
        <span className="text-xs font-semibold text-primary">{formatHoursMinutes(groupTotal)}</span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {isOpen && (
        <div className="border-t bg-card">
          {/* Column header only makes sense once there's an actual grid to label — below `sm`
              every row is a stacked card instead (see the row markup below), so this is hidden
              rather than squeezed into 4 columns that no longer exist there. */}
          <div className="hidden gap-3 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1.75rem_1.3fr_7rem_1.1fr]">
            <span>#</span>
            <span>Task / Activity</span>
            <span className="text-right">Hours</span>
            <span>Description</span>
          </div>
          {visibleRows.map((row, i) => {
            const isDirty = edits?.[row.rowKey]?.[day] !== undefined || descriptions?.[row.rowKey]?.[day] !== undefined;
            const hasChildren = (childrenByParent.get(row.rowKey)?.length ?? 0) > 0;
            const isRowCollapsed = collapsedKeys.has(row.rowKey);
            // A collapsed parent stands in for its subtree, shown read-only: the aggregate is not
            // one editable quantity, and typing into it would write the subtree's sum onto the
            // parent's own hours on top of the children already carrying them. Expand to edit.
            const isRolledUp = hasChildren && isRowCollapsed;
            const value = isRolledUp ? subtreeValueOf(row) : cellValueOf(row);
            const canEditRow = row.editable && isPastOrToday && !isRolledUp;
            const descriptionValue = descriptionValueOf(row);

            return (
              <div
                key={row.rowKey}
                className={cn(
                  // Below `sm`: a stacked card — name+hours on one line, description underneath —
                  // instead of forcing the same 4 fixed columns into a phone-width row, which is
                  // what used to squeeze the stepper and description down to nearly nothing.
                  // `sm:` restores the original grid exactly as it was.
                  'flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30',
                  'sm:grid sm:grid-cols-[1.75rem_1.3fr_7rem_1.1fr] sm:items-start sm:gap-3 sm:py-2',
                  i > 0 && 'border-t border-border/60',
                )}
              >
                {/* `sm:contents` on both wrapper levels unwraps them at desktop width, so the
                    index/name/hours elements fall back into being 3 independent cells of the
                    grid above, exactly as before — neither wrapper carries any color/font
                    utility of its own (only layout), so there's nothing for those cells to
                    inherit that didn't already exist on them individually. Below `sm` they're
                    real flex rows instead: name+chevron on the left, the hours stepper pinned to
                    the right on the same line. */}
                <div className="flex items-center justify-between gap-2 sm:contents">
                  <div className="flex min-w-0 items-center gap-1 sm:contents">
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline sm:pt-1.5">{i + 1}</span>
                    <span
                      className={cn(
                        'flex min-w-0 items-center gap-1 text-xs sm:pt-1.5',
                        row.relDepth === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                      style={{ paddingLeft: row.relDepth * 14 }}
                    >
                      {row.relDepth > 0 && <span className="shrink-0 text-muted-foreground/50">{'└'}</span>}
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => onToggleRowCollapse(row.rowKey)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:h-3.5 sm:w-3.5"
                        >
                          {isRowCollapsed ? <ChevronDown className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> : <ChevronUp className="h-3.5 w-3.5 sm:h-3 sm:w-3" />}
                        </button>
                      )}
                      <span className="truncate" title={row.label}>{row.label}</span>
                      {isDirty && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Unsaved change" />}
                    </span>
                  </div>
                  <div className="shrink-0 sm:flex sm:justify-end sm:pt-1">
                    {canEditRow ? (
                      <HourStepper value={value} onChange={(v) => onCellChange(row.rowKey, day, String(v))} hoursCap={hoursCap} />
                    ) : (
                      <span
                        className={cn('text-xs font-medium tabular-nums text-muted-foreground', isRolledUp && 'italic')}
                        title={isRolledUp ? 'Total of this task and everything under it — expand to edit' : undefined}
                      >
                        {formatHoursMinutes(value)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  {canEditRow ? (
                    <div className="flex flex-col gap-0.5">
                      <AutoResizeTextarea
                        value={descriptionValue}
                        onChange={(e) => onDescriptionChange(row.rowKey, day, e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                        maxLength={DESCRIPTION_MAX_LENGTH}
                        placeholder="Add description…"
                        rows={1}
                        className="min-h-0 w-full resize-none rounded-md px-2.5 py-1.5 text-xs shadow-sm"
                      />
                      <span className="self-end text-[10px] tabular-nums text-muted-foreground">
                        {descriptionValue.length} / {DESCRIPTION_MAX_LENGTH}
                      </span>
                    </div>
                  ) : (
                    <span
                      className={cn('block text-xs sm:pt-1.5', descriptionValue ? 'text-muted-foreground' : 'italic text-muted-foreground/40')}
                      title={descriptionValue || undefined}
                    >
                      {descriptionValue || 'No description'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

// The Service PO -> hierarchy tree for one date, folder-per-Service-PO with an inner task
// table, since /employee-timesheets/daily returns that same aggregated tree Monthly Summary
// gets (no individual entry ids anymore, so entries are edited by node rather than listed one
// at a time). `rows` is pre-flattened by the caller (buildMonthlySummaryRows) so the day-level
// totals used elsewhere on the page and this table stay in sync off one computation.
//
// Pure hours-entry only — exact start/end time logging is a separate screen entirely, see
// pages/employee/EmployeeTimeEntry.jsx.
const WorkLogEntryTable = ({
  rows, day, isLoading, isPastOrToday, edits, onCellChange, hoursCap = DAILY_HOURS_CAP,
  emptyMessage = 'No Service POs mapped.', descriptions, onDescriptionChange,
}) => {
  const childrenByParent = useMemo(() => buildChildrenByParent(rows), [rows]);
  const topLevelRows = useMemo(() => rows.filter((r) => (r.depth ?? 0) === 0), [rows]);

  // Shared across every Service PO's hierarchy tree at once — rowKeys are globally unique
  // (`po:<id>` / `h:<id>`), so one Set here is enough to drive per-node expand/collapse for
  // every folder, and Expand All / Collapse All simply clears it / fills it with every parent key.
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());

  // Which top-level Service PO folders are closed (rather than open) — lifted out of ProjectGroup
  // so Expand All / Collapse All can drive the folders themselves, not just the hierarchy rows
  // inside an already-open one. Default: auto-open when there's exactly one PO, else start closed.
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState(() => new Set());

  // `rows` loads asynchronously (React Query) and this component is never remounted when it
  // arrives, so seeding the default above at mount time (the old approach) ran while `rows` was
  // still empty — every real folder showed up later as a rowKey the Set had never heard of, and
  // "not in the Set" reads as open. Seed the default the first time each rowKey is actually seen
  // instead, so newly-arrived folders still start closed (unless there's only one PO total);
  // once a key has been seeded, the user's own expand/collapse clicks are left alone.
  const seenGroupKeysRef = useRef(new Set());
  useEffect(() => {
    const unseen = topLevelRows.map((r) => r.rowKey).filter((key) => !seenGroupKeysRef.current.has(key));
    if (unseen.length === 0) return;
    unseen.forEach((key) => seenGroupKeysRef.current.add(key));
    if (topLevelRows.length === 1) return;
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      unseen.forEach((key) => next.add(key));
      return next;
    });
  }, [topLevelRows]);

  const toggleRowCollapse = (rowKey) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleGroupOpen = (rowKey) => {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedGroupKeys(new Set());
    setCollapsedKeys(new Set());
  };

  const collapseAll = () => {
    setCollapsedGroupKeys(new Set(topLevelRows.map((r) => r.rowKey)));
    setCollapsedKeys(new Set(childrenByParent.keys()));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  const hasCollapsibleRows = topLevelRows.length > 1 || childrenByParent.size > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Work Log Entries</h3>
        {hasCollapsibleRows && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={expandAll}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <UnfoldVertical className="h-3 w-3" />
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <FoldVertical className="h-3 w-3" />
              Collapse All
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {topLevelRows.map((row) => (
          <ProjectGroup
            key={row.rowKey}
            poRow={row}
            childrenByParent={childrenByParent}
            day={day}
            edits={edits}
            onCellChange={onCellChange}
            isPastOrToday={isPastOrToday}
            hoursCap={hoursCap}
            isOpen={!collapsedGroupKeys.has(row.rowKey)}
            onToggleOpen={() => toggleGroupOpen(row.rowKey)}
            descriptions={descriptions}
            onDescriptionChange={onDescriptionChange}
            collapsedKeys={collapsedKeys}
            onToggleRowCollapse={toggleRowCollapse}
          />
        ))}
      </div>
    </div>
  );
};

export default WorkLogEntryTable;
