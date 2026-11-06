'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { countableEmployeeSql, NON_DELIVERY_ROLES } = require('../src/utils/countableEmployeeSql');

test('the skipped roles are exactly HR, Finance and Attender', () => {
  assert.deepEqual(NON_DELIVERY_ROLES, ['hr', 'finance', 'attender']);
});

test('the clause is built for the alias it is given and only looks at active role rows', () => {
  const sql = countableEmployeeSql('emp');
  assert.match(sql, /ndr\.employee_id = emp\.id/);
  assert.equal((sql.match(/status = 'active'/g) || []).length, 1);
  assert.doesNotMatch(sql, /\be\.id\b/);
});

test('default alias is e', () => {
  assert.match(countableEmployeeSql(), /ndr\.employee_id = e\.id/);
});

test('anyone holding one of the roles is skipped, whatever other roles they have', () => {
  const sql = countableEmployeeSql('e').replace(/\s+/g, ' ');
  assert.match(sql, /^NOT EXISTS \(.*LOWER\(ndr_r\.role_name\) IN \('hr', 'finance', 'attender'\) \)$/);
  assert.doesNotMatch(sql, /NOT IN/);
});
