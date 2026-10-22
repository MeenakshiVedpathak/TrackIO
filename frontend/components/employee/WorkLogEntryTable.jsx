import { useMemo, useState, useEffect } from 'react';
import {
  ChevronUp, ChevronDown, Folder, Minus, Plus, UnfoldVertical, FoldVertical,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/common/EmptyState';
import { cn } from '@/utils/cn';
import { formatHoursMinutes, parseHourMinuteInput, formatHourMinuteValue } from '@/utils/formatters';
import { DAILY_HOURS_CAP } from './WorkLogEntryModal';

const STEP = 0.5;
const DESCRIPTION_MAX_LENGTH = 150;

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

// `hoursCap` defaults to the Daily 12-hr cap so existing Daily callers (which don't pass it)
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
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
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
// concept). Defaults collapsed so every mapped project's total hrs is visible in one glance
// as a single line; expand only the one(s) you want to edit.
const ProjectGroup = ({
  poRow, childrenByParent, day, edits, onCellChange, isPastOrToday, hoursCap, defaultOpen,
  descriptions, onDescriptionChange, collapsedKeys, onToggleRowCollapse,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const nodeRows = useMemo(() => flattenSubtree(poRow, 0, childrenByParent), [poRow, childrenByParent]);
  const visibleRows = useMemo(
    () => nodeRows.filter((row) => !row.ancestorKeys?.some((key) => collapsedKeys.has(key))),
    [nodeRows, collapsedKeys],
  );

  const cellValueOf = (r) => {
    const edited = edits?.[r.rowKey]?.[day];
    return edited !== undefined ? Number(edited || 0) : Number(r.hoursByDay?.[day] ?? 0);
  };
  const groupTotal = nodeRows.reduce((sum, r) => sum + cellValueOf(r), 0);

  const descriptionValueOf = (r) => {
    const edited = descriptions?.[r.rowKey]?.[day];
    return edited !== undefined ? edited : (r.description ?? '');
  };

  // Own hours plus every descendant's. The folder header above already shows this for the whole
  // Service PO; a COLLAPSED node inside it needs the same, or it reads 0 while the rows holding
  // its hours sit hidden underneath (a Parent/PO can carry its own hours *and* have a breakdown
  // at the same time, so its own figure is genuinely 0 in that case).
  const subtreeValueOf = (r) =>
    nodeRows
      .filter((n) => n.rowKey === r.rowKey || (n.ancestorKeys ?? []).includes(r.rowKey))
      .reduce((sum, n) => sum + cellValueOf(n), 0);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
          <Folder className="h-3 w-3" />
        </span>
        <span className="flex-1 truncate text-xs font-semibold">{poRow.label}</span>
        <span className="text-xs font-semibold text-primary">{formatHoursMinutes(groupTotal)}</span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {isOpen && (
        <div className="border-t bg-card">
          <div className="grid grid-cols-[1.75rem_1.3fr_7rem_1.1fr] gap-3 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                  'grid grid-cols-[1.75rem_1.3fr_7rem_1.1fr] items-start gap-3 px-3 py-2 transition-colors hover:bg-muted/30',
                  i > 0 && 'border-t border-border/60',
                )}
              >
                <span className="pt-1.5 text-[11px] text-muted-foreground">{i + 1}</span>
                <span
                  className={cn(
                    'flex items-center gap-1 truncate pt-1.5 text-xs',
                    row.relDepth === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                  style={{ paddingLeft: row.relDepth * 14 }}
                >
                  {row.relDepth > 0 && <span className="text-muted-foreground/50">{'└'}</span>}
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => onToggleRowCollapse(row.rowKey)}
                      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {isRowCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                    </button>
                  )}
                  <span className="truncate">{row.label}</span>
                  {isDirty && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Unsaved change" />}
                </span>
                <div className="flex justify-end pt-1">
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
                <div className="min-w-0">
                  {canEditRow ? (
                    <div className="flex flex-col gap-0.5">
                      <Textarea
                        value={descriptionValue}
                        onChange={(e) => onDescriptionChange(row.rowKey, day, e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                        maxLength={DESCRIPTION_MAX_LENGTH}
                        placeholder="Add description…"
                        rows={2}
                        className="min-h-0 w-full resize-none rounded-md px-2.5 py-1.5 text-xs shadow-sm"
                      />
                      <span className="self-end text-[10px] tabular-nums text-muted-foreground">
                        {descriptionValue.length} / {DESCRIPTION_MAX_LENGTH}
                      </span>
                    </div>
                  ) : (
                    <span
                      className={cn('block pt-1.5 text-xs', descriptionValue ? 'text-muted-foreground' : 'italic text-muted-foreground/40')}
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

  const toggleRowCollapse = (rowKey) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
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

  const hasCollapsibleRows = childrenByParent.size > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Work Log Entries</h3>
        {hasCollapsibleRows && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsedKeys(new Set())}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <UnfoldVertical className="h-3 w-3" />
              Expand All
            </button>
            <button
              type="button"
              onClick={() => setCollapsedKeys(new Set(childrenByParent.keys()))}
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
            defaultOpen={topLevelRows.length === 1}
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
