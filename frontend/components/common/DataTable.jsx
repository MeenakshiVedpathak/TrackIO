import { useState, useRef, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from './EmptyState';
import MobilePagination from './MobilePagination';
import { cn } from '@/utils/cn';

const SortIcon = ({ column }) => {
  const sorted = column.getIsSorted();
  // shrink-0 keeps the icon at its full size next to a truncated label instead of
  // being squeezed out of the (fixed-width) header cell and over the next column.
  if (sorted === 'asc') return <ChevronUp className="h-3 w-3 shrink-0" />;
  if (sorted === 'desc') return <ChevronDown className="h-3 w-3 shrink-0" />;
  return <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />;
};

const DataTable = ({
  columns,
  data = [],
  isLoading = false,
  // Server-side pagination props
  pagination,
  onPageChange,
  onPageSizeChange,
  // Server-side sorting props
  sorting: externalSorting,
  onSortingChange: onExternalSortingChange,
  // Search
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  // Misc
  emptyState,
  toolbar,
  className,
  tableContainerClassName,
  rowClassName,
  onRowClick,
  // Arbitrary data/handlers exposed to every cell/header via `table.options.meta` — the
  // TanStack-recommended way to reach fast-changing state (e.g. inline-edit drafts) from a
  // column's `cell`/`header` without rebuilding the `columns` array on every keystroke, which
  // would give each cell a new function identity and remount it (losing input focus).
  meta,
  // Opt-in: below `md`, render a generic card per row (columns tagged `meta: { sticky: true }`
  // become the card's title block, everything else lists as label/value rows) plus a compact
  // pagination footer, instead of the horizontally-scrolling table every DataTable has always
  // rendered. Defaults to `false` so every existing consumer of this shared component (outside
  // the Reports module, which opts in) keeps its exact current behavior at every width — this
  // was built for the Reports module's mobile redesign specifically, not as a silent app-wide
  // behavior change.
  mobileCards = false,
  // Optional, only meaningful alongside `mobileCards`: `(rowData, row) => ReactNode` to fully
  // replace the generic label/value card for a table whose columns don't translate into that
  // shape well — e.g. a `select` checkbox column and an `actions` column, which would otherwise
  // render as the card's bold "title". The renderer owns its entire card markup (including any
  // checkbox/click handling) and is rendered unwrapped — no auto `onRowClick` button wrapper —
  // so it can safely nest its own interactive elements (a checkbox) without the nested-button
  // problem a generic clickable card wrapper would create.
  mobileCardRenderer,
}) => {
  const [internalSorting, setInternalSorting] = useState([]);

  // Sticky columns only need their distinguishing background when the table actually
  // scrolls horizontally — with nothing to hide underneath, treat every column the same.
  const scrollRef = useRef(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  // Edge fades below tell a narrow-viewport user there's more to scroll to — without them, a
  // table whose sticky columns alone already fill the screen (common on mobile) looks like it
  // simply ends, with no hint that Client Code/Status/etc. exist just off-screen.
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setHasOverflow(el.scrollWidth > el.clientWidth + 1);
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  });

  const isManualSort = !!onExternalSortingChange;
  const sorting = isManualSort ? (externalSorting ?? []) : internalSorting;

  const handleSortingChange = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (isManualSort) {
      onExternalSortingChange(next);
    } else {
      setInternalSorting(next);
    }
  };

  const table = useReactTable({
    data,
    columns,
    meta,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
  });

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;
  const currentPage = pagination ? pagination.page : 1;

  return (
    // `min-h-0` only does something when a page opts in by making ITS OWN root
    // `h-full flex flex-col min-h-0` (see the list pages that use this component) — that's what
    // lets this shrink to fit whatever bounded space the page hands it. Deliberately no
    // `flex-1` here: growing to fill unused space is what produced a big blank gap under a
    // short table, while a table taller than the available space still shrinks fine under the
    // page's default flex-shrink, so nothing is lost by leaving flex-grow at its default 0.
    // Nested anywhere else (a normal block ancestor, a dialog), `min-h-0` is inert and this
    // renders at its natural content height exactly as before.
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {/* Toolbar */}
      {(onSearchChange || toolbar) && (
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {onSearchChange && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          {toolbar && <div className="flex items-center gap-2 w-full">{toolbar}</div>}
        </div>
      )}

      {/* Table — `min-h-0` is what lets the container below (not the page around it) become the
          scroll owner when there's more data than the page has room for: it shrinks to whatever
          space is actually left in DataTable's column and, once bounded, its own `overflow-auto`
          (from ui/table.jsx) scrolls internally instead of growing and pushing pagination/footer
          down. No `flex-1` — a short table just sits at its natural height instead of stretching
          to fill whatever room the page happens to have. The sticky `<thead>` further down
          resolves against that same element, so the header stays pinned while only the body
          scrolls, whenever the table is actually tall enough to scroll.
          This wrapper must itself be `flex flex-col` (not a plain block div) — a plain div
          doesn't pass its own (possibly shrunk) height down to a block child, so the Table
          container's `min-h-0` would have nothing to shrink into and pagination could end up
          pushed below the fold instead of the table scrolling internally. */}
      <div className={cn('relative flex min-h-0 flex-col', mobileCards && 'hidden md:flex')}>
      <Table
        ref={scrollRef}
        className="data-table table-fixed"
        containerClassName={cn("bg-white border rounded-lg overflow-x-auto min-h-0", tableContainerClassName)}
      >
        <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_3px_0_rgb(0,0,0,0.1)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent border-b bg-slate-50">
              {headerGroup.headers.map((header) => {
                  const isSticky = header.column.columnDef.meta?.sticky && hasOverflow;
                  const left = header.column.columnDef.meta?.left || 0;
                  const align = header.column.columnDef.meta?.align;
                  // header.getSize() falls back to TanStack's own default (150) when a column
                  // doesn't declare `size` — comparing against that value can't tell "unset"
                  // apart from a column that explicitly asked for 150, so check the columnDef
                  // itself instead.
                  const w = (header.column.columnDef.size !== undefined || isSticky) ? header.getSize() : undefined;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn('overflow-hidden whitespace-nowrap', isSticky && 'sticky-col', align === 'right' && 'text-right')}
                      style={{
                        ...(w ? { width: w, minWidth: w, maxWidth: w } : {}),
                        ...(isSticky ? { left } : {})
                      }}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          title={typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : undefined}
                          className={cn(
                            'flex w-full min-w-0 items-center gap-1 hover:text-foreground transition-colors',
                            align === 'right' && 'justify-end'
                          )}
                        >
                          <span className="min-w-0 truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          <SortIcon column={header.column} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              {/* Filler column — absorbs any leftover width so real columns stay at their declared size
                  instead of the widest one stretching to fill the container (table-layout: fixed). */}
              <TableHead aria-hidden="true" />
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell aria-hidden="true" />
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="p-0">
                  {emptyState ?? <EmptyState title="No records found" description="Try adjusting your search or filters." />}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row, idx) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted',
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row.original)
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isSticky = cell.column.columnDef.meta?.sticky && hasOverflow;
                    const left = cell.column.columnDef.meta?.left || 0;
                    const align = cell.column.columnDef.meta?.align;
                    const w = (cell.column.columnDef.size !== undefined || isSticky) ? cell.column.getSize() : undefined;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(isSticky && 'sticky-col', align === 'right' && 'text-right')}
                        style={{
                          ...(w ? { width: w, minWidth: w, maxWidth: w } : {}),
                          ...(isSticky ? { left } : {})
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                  <TableCell aria-hidden="true" />
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
        {/* Scroll affordances — only ever visible once the table is actually horizontally
            scrollable (hasOverflow), and only on the edge(s) with more to reveal, so a fully
            scrolled-right table doesn't keep hinting at content that no longer exists there. */}
        {hasOverflow && canScrollLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent" />
        )}
        {hasOverflow && canScrollRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent" />
        )}
      </div>

      {/* Mobile (opt-in via `mobileCards`): a generic card per row, built from the same
          `columns`/`data` every consumer already passes — no per-report card design needed. Each
          column's existing `cell` renderer (badge, progress bar, currency format, whatever) is
          reused as-is via `flexRender`, and a report that already wired `onRowClick` (e.g. to
          open a detail Sheet/Dialog) gets that same tap behavior here instead of a new
          affordance. Columns a report has tagged `meta: { sticky: true }` (its primary identity
          columns, e.g. Code/Name) become the card's title block; everything else lists as
          label/value rows. */}
      {mobileCards && (
      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : table.getRowModel().rows.length === 0 ? (
          emptyState ?? <EmptyState title="No records found" description="Try adjusting your search or filters." />
        ) : mobileCardRenderer ? (
          table.getRowModel().rows.map((row) => (
            <div key={row.id}>{mobileCardRenderer(row.original, row)}</div>
          ))
        ) : (
          (() => {
            const headerGroup = table.getHeaderGroups()[0];
            const labelByColId = new Map();
            headerGroup?.headers.forEach((header) => {
              if (header.isPlaceholder) return;
              const def = header.column.columnDef.header;
              labelByColId.set(header.column.id, typeof def === 'string' ? def : flexRender(def, header.getContext()));
            });

            return table.getRowModel().rows.map((row) => {
              const cells = row.getVisibleCells();
              const stickyCells = cells.filter((c) => c.column.columnDef.meta?.sticky);
              const titleCells = stickyCells.length ? stickyCells : cells.slice(0, 1);
              const bodyCells = stickyCells.length ? cells.filter((c) => !c.column.columnDef.meta?.sticky) : cells.slice(1);
              const Card = onRowClick ? 'button' : 'div';

              return (
                <Card
                  key={row.id}
                  type={onRowClick ? 'button' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'block w-full rounded-lg border bg-white p-3.5 text-left',
                    onRowClick && 'active:bg-muted/40',
                    rowClassName?.(row.original)
                  )}
                >
                  {titleCells.map((cell) => (
                    <div key={cell.id} className="font-semibold">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                  {bodyCells.length > 0 && (
                    <div className="mt-2 space-y-1 text-sm">
                      {bodyCells.map((cell) => {
                        const label = labelByColId.get(cell.column.id);
                        if (!label) return null;
                        return (
                          <div key={cell.id} className="flex items-baseline justify-between gap-3">
                            <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
                            <span className="min-w-0 text-right">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            });
          })()
        )}
      </div>
      )}

      {/* Pagination (desktop): unchanged, except it collapses to `hidden md:flex` when a caller
          has opted into `mobileCards` (so the mobile pagination below takes over instead). */}
      {pagination && (
        <div className={cn('flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm', mobileCards && 'hidden md:flex')}>
          <p className="text-muted-foreground text-xs">
            Showing {((currentPage - 1) * pagination.limit) + 1}–{Math.min(currentPage * pagination.limit, pagination.total)} of {pagination.total} results
          </p>
          <div className="flex items-center gap-3">
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                <Select value={String(pagination.limit)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                  <SelectTrigger className="h-8 w-16 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([10, 20, 50, 100, Number(pagination.limit)])).sort((a,b) => a - b).map((size) => (
                      <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onPageChange?.(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onPageChange?.(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {mobileCards && pagination && (
        <MobilePagination
          className="shrink-0 md:hidden"
          page={currentPage}
          totalPages={totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPrev={() => onPageChange?.(currentPage - 1)}
          onNext={() => onPageChange?.(currentPage + 1)}
        />
      )}
    </div>
  );
};

export default DataTable;
