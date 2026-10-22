import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

// Standard collapsible filter panel paired with FilterToggleButton.
//
// Desktop/tablet (>= md): unchanged from before — the classic CSS `grid-template-rows: 0fr -> 1fr`
// accordion trick, not a caller-guessed `max-height`. `0fr`/`1fr` sizes the single grid row from
// actual content height instead, so any number of filter rows fits with no per-page tuning.
// `maxHeightClass` is intentionally no longer read (kept accepted-but-unused so every existing
// call site passing one keeps working unchanged).
//
// Mobile (< md): the same `children` (each caller's own filter fields, completely unchanged) are
// presented as a bottom sheet instead of an inline panel, matching the Reports module's mobile
// design — a cramped inline 1-column stack squeezed under the toolbar reads as "desktop UI
// shrunk", not a real mobile filter experience. Gated by `useIsMobile()` (an actual media query),
// not a `md:hidden` class, because a Radix Sheet's overlay/body-scroll-lock/focus-trap are real
// side effects a CSS class can hide visually but can't suppress — mounting the whole component
// only on mobile is what keeps desktop's `filtersOpen=true` state from locking body scroll behind
// an invisible sheet.
//
// `onClose`: optional. When a caller passes it (its own `() => setFiltersOpen(false)`), dismissing
// the mobile sheet (overlay tap, swipe, Escape, the Apply button) keeps the caller's own
// `filtersOpen` state and FilterToggleButton's badge/aria-expanded in sync. Callers that haven't
// been updated yet still get a fully working, self-contained sheet — `mobileOpen` mirrors `isOpen`
// on every change, so the next real "Filters" click re-opens it regardless.
//
// `onClear`/`showClear`: pages that track an `activeFilterCount` (the same count already shown
// as a badge on FilterToggleButton) pass `showClear={activeFilterCount > 0}` and an
// `onClear` that resets exactly those optional filters — required filters (e.g. a report's
// month/year) are left alone so the page never ends up in a blank/broken state.
const FilterPanel = ({ isOpen, gridClassName, onClear, showClear, onClose, children }) => {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(isOpen);
  useEffect(() => setMobileOpen(isOpen), [isOpen]);

  const closeMobile = () => {
    setMobileOpen(false);
    onClose?.();
  };

  return (
    <>
      <div
        className={cn(
          'hidden md:grid shrink-0 transition-all duration-500 ease-in-out',
          // `filter-panel-collapsed` (see styles/index.css) cancels the margin-top a caller's own
          // `space-y-*` wrapper puts on THIS element and on the sibling right after it — without it,
          // a closed panel still eats a full space-y gap on both sides even though it renders at
          // zero height, leaving a visible dead gap between the toolbar above and whatever's below.
          isOpen ? 'grid-rows-[1fr] opacity-100 mb-2' : 'filter-panel-collapsed grid-rows-[0fr] opacity-0 mb-0'
        )}
      >
        {/* The row-sizing trick can't shrink below 0, so this inner `overflow-hidden` is what
            actually hides the content while the track is animating down to `0fr` — the outer grid
            itself has nothing to clip. */}
        <div className="overflow-hidden">
          <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full rounded-lg border bg-muted/30 p-3', gridClassName)}>
            {children}
            {showClear && (
              <button
                type="button"
                onClick={onClear}
                className="col-span-full -mt-1 flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={(open) => (open ? setMobileOpen(true) : closeMobile())}>
          <SheetContent side="bottom" className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-4">{children}</div>
            </div>
            <SheetFooter className="shrink-0 flex-row gap-2 border-t p-3">
              {showClear && (
                <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClear}>
                  Reset
                </Button>
              )}
              <Button type="button" className="h-11 flex-1" onClick={closeMobile}>
                Apply
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
};

export default FilterPanel;
