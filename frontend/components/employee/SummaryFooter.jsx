import { TableRow, TableCell } from '@/components/ui/table';
import { formatHourMinuteValue } from '@/utils/formatters';
import { FIRST_COL_WIDTH, DAY_COL_WIDTH, TOTAL_COL_WIDTH } from './summaryTableLayout';

// The bottom TOTAL row — per-day column totals, plus the grand total in the bottom-right
// corner. Rendered inside a <tfoot> by SummaryTable so it stays pinned via `sticky bottom-0`
// the same way the header is pinned via `sticky top-0`.
const SummaryFooter = ({ days, columnTotals, grandTotal }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell
      className="summary-table-foot summary-col-pinned sticky left-0 bottom-0 px-2 text-xs"
      style={{ width: FIRST_COL_WIDTH, minWidth: FIRST_COL_WIDTH, maxWidth: FIRST_COL_WIDTH }}
    >
      TOTAL
    </TableCell>

    {days.map((day) => (
      <TableCell
        key={day}
        className="summary-table-foot px-1 text-center text-xs tabular-nums"
        style={{ width: DAY_COL_WIDTH, minWidth: DAY_COL_WIDTH, maxWidth: DAY_COL_WIDTH }}
      >
        {formatHourMinuteValue(columnTotals?.[day])}
      </TableCell>
    ))}

    <TableCell
      className="summary-table-foot summary-col-pinned sticky right-0 bottom-0 text-center"
      style={{ width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH, maxWidth: TOTAL_COL_WIDTH }}
    >
      {formatHourMinuteValue(grandTotal)}
    </TableCell>
  </TableRow>
);

export default SummaryFooter;
