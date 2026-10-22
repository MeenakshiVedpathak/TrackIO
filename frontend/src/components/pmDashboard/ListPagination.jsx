import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Same pagination + "Rows per page" footer DataTable.jsx renders for every real table on this
// dashboard (Project Overview, Team & Capacity, Work Log / Effort) — factored out here so the two
// PLAIN-LIST sections (Project Health, Action Required) that don't go through DataTable at all can
// still look and behave identically rather than growing their own slightly-different pager.
// `page`/`limit`/`total` describe the already-in-memory (client-paginated) list; `onPageChange`/
// `onPageSizeChange` just update the caller's own state, same contract DataTable's props use.
const ListPagination = ({ page, limit, total, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mt-3 flex flex-col gap-3 border-t pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} results
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">Rows per page</span>
          <Select value={String(limit)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-16 bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set([5, 10, 20, 50, limit])).sort((a, b) => a - b).map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ListPagination;
