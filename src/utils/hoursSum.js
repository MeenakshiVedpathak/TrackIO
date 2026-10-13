'use strict';

/**
 * Adding hours the way they are displayed.
 *
 * Hours are stored and sent as decimals rounded to 2 places (DECIMAL(x,2)), so 20 min is 0.33h and
 * 25 min is 0.42h. Every value maps back to the right whole minute (the 2-place resolution is
 * 0.6 min), but adding the raw decimals and rounding at the end drifts: six 20-min entries and two
 * 3h entries add up to 7.98h = 479 min, not the 480 min (8h) the employee entered.
 *
 * So each value is first turned into whole minutes, the minutes are summed, and only the total is
 * converted back to hours.
 */

/** Hours -> whole minutes (the same rounding the UI uses to display a value). */
const toMinutes = (hours) => Math.round((parseFloat(hours) || 0) * 60);

/** Sum decimal-hour values in whole minutes; returns hours (minutes / 60, not rounded to 2 places). */
const sumHoursByMinute = (values) => values.reduce((minutes, v) => minutes + toMinutes(v), 0) / 60;

/**
 * SQL for the same thing: SUM(hours) taken in whole minutes, returned as hours with 2 decimals.
 * @param {string} column - the (already quoted/qualified) hours column
 */
const sumHoursByMinuteSql = (column) => `ROUND(SUM(ROUND(${column} * 60)) / 60.0, 2)`;

module.exports = { toMinutes, sumHoursByMinute, sumHoursByMinuteSql };
