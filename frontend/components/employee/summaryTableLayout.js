// Shared column widths so the sticky header, body rows, and sticky footer all line up —
// a plain <table> can't rely on browser auto-sizing once columns are pinned with `sticky`.
export const FIRST_COL_WIDTH = 110;
// Wide enough for a 5-char "H.MM" total (e.g. "10.25") without overflowing into the next
// column — the old plain-decimal format rarely produced 2-digit minutes, so 34px was enough,
// but formatHourMinuteValue's literal-minutes form hits that width routinely.
export const DAY_COL_WIDTH = 44;
export const TOTAL_COL_WIDTH = 60;
