'use strict';

/**
 * Light pastel fill per calendar month (index 0 = January), used to tint each
 * month's column block in the Consolidated Monthly Report export. The same
 * calendar month always gets the same colour, whatever range is selected, and
 * a range wider than 12 months simply repeats it. The frontend report page
 * (ResourceCostUtilizationReport.jsx) keeps an identical list so the screen and
 * the Excel file match.
 */
const MONTH_FILL_HEX = [
  'DBEAFE', // Jan - blue
  'FCE7F3', // Feb - pink
  'DCFCE7', // Mar - green
  'FEF3C7', // Apr - amber
  'EDE9FE', // May - violet
  'CFFAFE', // Jun - cyan
  'FFEDD5', // Jul - orange
  'ECFCCB', // Aug - lime
  'FFE4E6', // Sep - rose
  'E0E7FF', // Oct - indigo
  'CCFBF1', // Nov - teal
  'E2E8F0', // Dec - slate
];

/**
 * @param {number} month - 1..12
 * @returns {string} RGB hex without '#'
 */
function monthFillHex(month) {
  return MONTH_FILL_HEX[(((month - 1) % 12) + 12) % 12];
}

module.exports = { MONTH_FILL_HEX, monthFillHex };
