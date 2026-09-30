'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isOffDay, SATURDAY_OFF_RULES } = require('../src/utils/weekOffPolicy');

// September 2026: Saturdays fall on the 5th, 12th, 19th, 26th; Sundays on
// the 6th, 13th, 20th, 27th — a clean 4-Saturday month to exercise every
// occurrence (1st..4th).
const SATURDAYS = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'];
const SUNDAYS = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'];
const WEEKDAY = '2026-09-16'; // a Wednesday

test('isOffDay: Sunday is always off, regardless of the Saturday rule', () => {
  for (const rule of SATURDAY_OFF_RULES) {
    for (const sunday of SUNDAYS) {
      assert.equal(isOffDay(sunday, rule), true, `${sunday} under ${rule}`);
    }
  }
});

test('isOffDay: a plain weekday is never off, regardless of the Saturday rule', () => {
  for (const rule of SATURDAY_OFF_RULES) {
    assert.equal(isOffDay(WEEKDAY, rule), false, `weekday under ${rule}`);
  }
});

test('isOffDay: ALL marks every Saturday off', () => {
  for (const saturday of SATURDAYS) {
    assert.equal(isOffDay(saturday, 'ALL'), true, saturday);
  }
});

test('isOffDay: NONE marks no Saturday off', () => {
  for (const saturday of SATURDAYS) {
    assert.equal(isOffDay(saturday, 'NONE'), false, saturday);
  }
});

test('isOffDay: ALT_1_3 marks only the 1st and 3rd Saturday off', () => {
  const [first, second, third, fourth] = SATURDAYS;
  assert.equal(isOffDay(first, 'ALT_1_3'), true);
  assert.equal(isOffDay(second, 'ALT_1_3'), false);
  assert.equal(isOffDay(third, 'ALT_1_3'), true);
  assert.equal(isOffDay(fourth, 'ALT_1_3'), false);
});

test('isOffDay: ALT_2_4 marks only the 2nd and 4th Saturday off', () => {
  const [first, second, third, fourth] = SATURDAYS;
  assert.equal(isOffDay(first, 'ALT_2_4'), false);
  assert.equal(isOffDay(second, 'ALT_2_4'), true);
  assert.equal(isOffDay(third, 'ALT_2_4'), false);
  assert.equal(isOffDay(fourth, 'ALT_2_4'), true);
});

test('isOffDay: ALT_1_3_5 marks the 1st, 3rd and 5th Saturday off (5-Saturday month)', () => {
  // August 2026 has five Saturdays: 1st, 8th, 15th, 22nd, 29th.
  const aug = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'];
  assert.deepEqual(aug.map((d) => isOffDay(d, 'ALT_1_3_5')), [true, false, true, false, true]);
});

test('isOffDay: ALT_1_3_5 in a 4-Saturday month behaves like ALT_1_3 (there is no 5th Saturday)', () => {
  const [first, second, third, fourth] = SATURDAYS;
  assert.deepEqual([first, second, third, fourth].map((d) => isOffDay(d, 'ALT_1_3_5')), [true, false, true, false]);
  assert.equal(isOffDay(WEEKDAY, 'ALT_1_3_5'), false);
});

test('isOffDay: ALT_1_3_5 is a recognised rule (not the unknown-value fallback, not treated as ALT_2_4)', () => {
  assert.ok(SATURDAY_OFF_RULES.includes('ALT_1_3_5'));
  assert.equal(isOffDay('2026-08-08', 'ALT_1_3_5'), false); // fallback (ALL) would say true
  assert.equal(isOffDay('2026-08-01', 'ALT_1_3_5'), true);  // ALT_2_4 would say false
});

test('company validation accepts ALT_1_3_5 on create and update, still rejects unknown values', () => {
  const { createCompanySchema, updateCompanySchema } = require('../src/validations/companyValidation');
  assert.equal(updateCompanySchema.validate({ saturday_off_rule: 'ALT_1_3_5' }).error, undefined);
  assert.equal(createCompanySchema.validate({ saturday_off_rule: 'ALT_1_3_5' }).value.saturday_off_rule, 'ALT_1_3_5');
  assert.ok(updateCompanySchema.validate({ saturday_off_rule: 'ALT_5' }).error);
});

test('isOffDay: an unrecognized rule falls back to ALL rather than throwing', () => {
  assert.equal(isOffDay(SATURDAYS[0], 'BOGUS'), true);
  assert.equal(isOffDay(SATURDAYS[0], undefined), true);
});

test('isOffDay: an invalid date throws', () => {
  assert.throws(() => isOffDay('not-a-date', 'ALL'));
  assert.throws(() => isOffDay('2026-13-40', 'ALL'));
});
