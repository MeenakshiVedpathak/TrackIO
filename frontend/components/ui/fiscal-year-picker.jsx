import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

const PAGE_SIZE = 6; // number of FY options shown per page

function fyLabel(fy) {
  return `FY ${fy}–${String(fy + 1).slice(-2)}`;
}

/**
 * Props:
 *   value    – number (FY start year, e.g. 2026 means Apr-2026 → Mar-2027)
 *   onChange – (year: number) => void
 *   className – extra classes for the trigger button
 */
export function FiscalYearPicker({ value, onChange, className }) {
  const [open, setOpen] = useState(false);
  // pageStart is the first FY shown in the current grid page
  const [pageStart, setPageStart] = useState(() => {
    const base = value ?? new Date().getFullYear();
    return base - 2;
  });

  const handleOpen = (isOpen) => {
    if (isOpen) {
      const base = value ?? new Date().getFullYear();
      setPageStart(base - 2);
    }
    setOpen(isOpen);
  };

  const years = Array.from({ length: PAGE_SIZE }, (_, i) => pageStart + i);

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 px-3 text-sm font-medium justify-start gap-1.5',
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          {value != null ? fyLabel(value) : 'Select FY'}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-3" align="end">
        {/* Navigation header */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setPageStart((s) => s - PAGE_SIZE)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
            Fiscal Year
          </span>
          <button
            type="button"
            onClick={() => setPageStart((s) => s + PAGE_SIZE)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Year grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {years.map((fy) => (
            <button
              key={fy}
              type="button"
              onClick={() => { onChange?.(fy); setOpen(false); }}
              className={cn(
                'py-2 px-1 rounded text-sm font-medium transition-colors text-center',
                fy === value
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground text-foreground'
              )}
            >
              {fyLabel(fy)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
