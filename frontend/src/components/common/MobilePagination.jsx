import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Compact mobile pagination footer — pairs with each report's existing desktop footer (which gets
// wrapped in `hidden md:flex`, unchanged otherwise). Reads the exact same `page`/`limit`/`total`/
// `totalPages` values and `onPrev`/`onNext` handlers a report's own pagination controls already
// use — no new pagination state or logic, just a smaller presentation. "Rows per page" is
// deliberately absent here per the mobile design (spec item 10) — the desktop control for it is
// untouched.
const MobilePagination = ({ page, totalPages = 1, total, limit, onPrev, onNext, itemLabel = 'item', className }) => {
  const hasTotal = total != null;
  const start = hasTotal && total > 0 ? (page - 1) * limit + 1 : 0;
  const end = hasTotal ? Math.min(page * limit, total) : 0;

  return (
    <div className={className}>
      {hasTotal && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {start}–{end} of {total} {itemLabel}{total !== 1 ? 's' : ''}
        </p>
      )}
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            disabled={page <= 1}
            onClick={onPrev}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[64px] text-center text-sm font-medium tabular-nums">{page} / {totalPages}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            disabled={page >= totalPages}
            onClick={onNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default MobilePagination;
