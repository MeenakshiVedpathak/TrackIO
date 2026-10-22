import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Props:
 *   value      – { month: 1-12, year: number } | null
 *   onChange   – (val: { month, year } | null) => void
 *   placeholder – string shown when no value selected (default "Select month")
 *   className  – extra classes for the trigger button
 *   clearable  – show X to clear (default true)
 */
export function MonthYearPicker({
  value,
  onChange,
  placeholder = 'Select month',
  className,
  clearable = true,
}) {
  const [open, setOpen] = useState(false);
  const [navYear, setNavYear] = useState(() => value?.year ?? new Date().getFullYear());

  const handleOpen = (isOpen) => {
    if (isOpen) setNavYear(value?.year ?? new Date().getFullYear());
    setOpen(isOpen);
  };

  const handleSelect = (month) => {
    onChange?.({ month, year: navYear });
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.(null);
  };

  const label = value
    ? `${MONTH_FULL[value.month - 1]} ${value.year}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 min-w-0 px-3 text-sm font-normal justify-between gap-1.5',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          {clearable && value && (
            <X
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-3" align="start">
        {/* Year navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setNavYear((y) => y - 1)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{navYear}</span>
          <button
            type="button"
            onClick={() => setNavYear((y) => y + 1)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((m, idx) => {
            const monthNum = idx + 1;
            const isSelected = value?.month === monthNum && value?.year === navYear;
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleSelect(monthNum)}
                className={cn(
                  'py-1.5 rounded text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {m}
              </button>
            );
          })}
        </div>

        {/* Clear */}
        {clearable && value && (
          <button
            type="button"
            onClick={() => { onChange?.(null); setOpen(false); }}
            className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
          >
            Clear selection
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
