import * as React from 'react';
import { cn } from '@/utils/cn';
import { TimeInput } from '@/components/ui/time-input';

// Pairs two TimeInput popovers (Start/End) so a Work Log row's exact-time block still reads as
// one combined "range" control. Each opens by clicking anywhere in its field, but finishing a full
// Start pick (both hour and minute chosen) auto-closes Start and opens End, so entering a range is
// one continuous flow instead of two separate manual opens. End's picker also disables any
// hour/minute at or before the chosen Start, so an invalid range can't be picked in the first place.
// `minInclusive` (a 24-hour "HH:MM") is an earliest-allowed time applied to BOTH ends of the
// range — the Time Entry screen's 09:00 workday start. End keeps its own after-Start rule on top.
// `layout` only swaps the chrome around the two pickers — every behaviour above (auto-advance,
// minExclusive, minInclusive) is identical either way:
//   'inline'  — the original compact "start – end" pair, used inside dense rows.
//   'labeled' — two full-width columns under their own "Start time" / "End time" captions.
//   'bare'    — two full-width columns with no captions and no separator, for a table row whose
//               column headings already live above it.
export const TimeRangePicker = ({
  startValue, endValue, onChange, disabled, className, layout = 'inline', minInclusive,
}) => {
  const [openField, setOpenField] = React.useState(null); // 'start' | 'end' | null
  const fieldClass = layout === 'inline' ? 'h-7 flex-1' : 'h-9 w-full';

  const startField = (
    <TimeInput
      value={startValue}
      onChange={(v) => onChange(v, endValue)}
      disabled={disabled}
      label="start"
      className={fieldClass}
      open={openField === 'start'}
      onOpenChange={(o) => setOpenField((prev) => (o ? 'start' : (prev === 'start' ? null : prev)))}
      onComplete={() => setOpenField('end')}
      minInclusive={minInclusive}
    />
  );

  const endField = (
    <TimeInput
      value={endValue}
      onChange={(v) => onChange(startValue, v)}
      disabled={disabled}
      label="end"
      className={fieldClass}
      open={openField === 'end'}
      onOpenChange={(o) => setOpenField((prev) => (o ? 'end' : (prev === 'end' ? null : prev)))}
      minExclusive={startValue}
      minInclusive={minInclusive}
    />
  );

  if (layout === 'bare') {
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
        {startField}
        {endField}
      </div>
    );
  }

  if (layout === 'labeled') {
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">Start time</span>
          {startField}
        </div>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">End time</span>
          {endField}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {startField}
      <span className="shrink-0 text-muted-foreground">–</span>
      {endField}
    </div>
  );
};

export default TimeRangePicker;
