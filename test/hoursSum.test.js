'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { toMinutes, sumHoursByMinute, sumHoursByMinuteSql } = require('../src/utils/hoursSum');
const servicePOHierarchyDTO = require('../src/dtos/servicePOHierarchyDTO');

// Hours are stored as 2-decimal values: 20 min = 0.33h, 25 min = 0.42h, 40 min = 0.67h.
const minutesOf = (hours) => Math.round(hours * 60);

test('six 20-min entries + two 3h entries add up to exactly 8h, not 7.98h (479 min)', () => {
  const day = [0.33, 0.33, 0.33, 0.33, 0.33, 0.33, 3, 3];
  assert.equal(day.reduce((a, b) => a + b, 0) * 60 | 0, 478); // the old way is short
  assert.equal(minutesOf(sumHoursByMinute(day)), 480);
  assert.equal(Math.round(sumHoursByMinute(day) * 100) / 100, 8);
});

test('five 25-min + 1h40 + 3h + 1h15 add up to exactly 8h, not 8.01h (481 min)', () => {
  const day = [0.42, 0.42, 0.42, 0.42, 0.42, 1.67, 3, 1.25];
  assert.equal(minutesOf(day.reduce((a, b) => a + b, 0)), 481); // the old way is long
  assert.equal(minutesOf(sumHoursByMinute(day)), 480);
});

test('every minute of an hour survives the 2-decimal storage round trip', () => {
  for (let m = 0; m <= 24 * 60; m += 1) {
    const stored = Math.round((m / 60) * 100) / 100;
    assert.equal(toMinutes(stored), m, `${m} min stored as ${stored}h`);
  }
});

test('a single value, empty input and bad values are safe', () => {
  assert.equal(sumHoursByMinute([0.33]), 20 / 60);
  assert.equal(sumHoursByMinute([]), 0);
  assert.equal(sumHoursByMinute([null, undefined, 'x', '1.5']), 1.5);
});

test('sumHierarchyHours adds the whole tree in whole minutes', () => {
  const tree = [
    { hours: 0.33, children: [{ hours: 0.33 }, { hours: 0.33, children: [{ hours: 0.33 }] }] },
    { hours: 0.33 },
    { hours: 0.33 },
  ];
  // six 20-min nodes = 120 min
  assert.equal(minutesOf(servicePOHierarchyDTO.sumHierarchyHours(tree)), 120);
});

test('sumHoursByMinuteSql wraps the column the same way the JS helper sums', () => {
  assert.equal(sumHoursByMinuteSql('"hours"'), 'ROUND(SUM(ROUND("hours" * 60)) / 60.0, 2)');
});
