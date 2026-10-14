'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repo = require('../src/repositories/utilisationReportRepository');
const service = require('../src/services/utilisationReportService');
const logger = require('../src/utils/logger');

const ORIGINAL = repo.getBuWiseUtilisation;
const ORIGINAL_LOG = logger.info;
test.before(() => { logger.info = () => {}; });
test.after(() => { repo.getBuWiseUtilisation = ORIGINAL; logger.info = ORIGINAL_LOG; });

const row = (over) => ({
  bu_id: 1, root_id: 1, bu_name: 'BU', sub_bu_name: null, total_employees: 0, expected_hours: '0',
  billable_hours: '0', non_billable_hours: '0', customer_non_billable_hours: '0', total_logged_hours: '0',
  original_billable_hours: '0', original_non_billable_hours: '0', original_customer_non_billable_hours: '0',
  original_total_logged_hours: '0', utilization_percentage: '0', original_utilization_percentage: '0', not_logged_hours: '0',
  ...over,
});

// BU 1 "Alpha" has Sub-BUs 11 "Zed" and 12 "Beta"; 2 employees (40h) are mapped to Alpha but to no Sub-BU
// (the repository's "BU level" node). BU 2 "Solo" has none. BU 3 "Quiet" has a Sub-BU 31, nobody at its own level.
const stubRepo = () => {
  const calls = [];
  repo.getBuWiseUtilisation = async (f) => {
    calls.push(f);
    if (f.groupBy === 'bu') {
      return {
        rows: [
          row({ bu_id: 1, root_id: 1, bu_name: 'Alpha', total_employees: 5, total_logged_hours: '100' }),
          row({ bu_id: 2, root_id: 2, bu_name: 'Solo', total_employees: 2, total_logged_hours: '10' }),
          row({ bu_id: 3, root_id: 3, bu_name: 'Quiet', total_employees: 1, total_logged_hours: '20' }),
        ],
        count: 3,
        totals: { bu_count: 3, sub_bu_count: 4, total_employees: 8, expected_hours: '1000', total_logged_hours: '130' },
      };
    }
    return {
      rows: [
        row({ bu_id: 1, root_id: 1, bu_name: 'Alpha', total_employees: 2, total_logged_hours: '40' }),
        row({ bu_id: 11, root_id: 1, bu_name: 'Alpha', sub_bu_name: 'Zed', total_logged_hours: '30' }),
        row({ bu_id: 12, root_id: 1, bu_name: 'Alpha', sub_bu_name: 'Beta', total_logged_hours: '30' }),
        row({ bu_id: 2, root_id: 2, bu_name: 'Solo', total_logged_hours: '10' }),
        row({ bu_id: 3, root_id: 3, bu_name: 'Quiet', total_logged_hours: '0' }),
        row({ bu_id: 31, root_id: 3, bu_name: 'Quiet', sub_bu_name: 'Only', total_logged_hours: '20' }),
      ],
      count: 6,
      totals: null,
    };
  };
  return calls;
};

const run = (query = {}) => service.getBuWiseUtilisationReport({ month: 9, year: 2026, groupBy: 'hierarchy', ...query }, [], { exportAll: true });

test('hierarchy: one row per BU, each carrying its Sub-BUs', async () => {
  stubRepo();
  const { data } = await run();
  assert.deepEqual(data.map((r) => r.buName), ['Alpha', 'Solo', 'Quiet']);
  assert.deepEqual(data.map((r) => r.hasSubBus), [true, false, true]);
  assert.deepEqual(data[1].subBus, []);
});

test('hierarchy: a BU with Sub-BUs is its Sub-BUs — no "BU level" row, children sorted by name', async () => {
  stubRepo();
  const { data } = await run();
  const [alpha, , quiet] = data;
  assert.deepEqual(alpha.subBus.map((c) => c.subBuName), ['Beta', 'Zed']);
  assert.ok(alpha.subBus.every((c) => !c.isDirect));
  assert.deepEqual(quiet.subBus.map((c) => c.subBuName), ['Only']);
});

test('hierarchy: employees/hours mapped to the BU but to no Sub-BU are reported, not silently added', async () => {
  stubRepo();
  const { data } = await run();
  const [alpha, solo, quiet] = data;
  assert.equal(alpha.unassignedEmployees, 2);
  assert.equal(alpha.unassignedLoggedHours, 40);
  assert.equal(quiet.unassignedEmployees, 0);
  assert.equal(solo.unassignedEmployees, undefined); // a BU without Sub-BUs has nothing to be unassigned from
});

test('hierarchy: the BU page is fetched rolled up (paged/sorted), the Sub-BUs afterwards for exactly those BUs', async () => {
  const calls = stubRepo();
  await run({ search: 'alp', sortBy: 'utilizationPercentage' });
  assert.equal(calls[0].groupBy, 'bu');
  assert.equal(calls[0].search, 'alp');
  assert.equal(calls[1].groupBy, 'partition');
  assert.deepEqual(calls[1].rootIds, [1, 2, 3]);
  assert.equal(calls[1].search, undefined);
  assert.equal(calls[1].limit, null);
});

test('hierarchy: summary comes from the rolled-up BU totals (nothing added up twice)', async () => {
  stubRepo();
  const { summary } = await run();
  assert.equal(summary.buCount, 3);
  assert.equal(summary.subBuCount, 4); // counted separately from the BUs
  assert.equal(summary.totalLoggedHours, 130);
});

test('without groupBy=hierarchy the rows carry no subBus (original flat layout)', async () => {
  stubRepo();
  const { data } = await run({ groupBy: undefined });
  assert.equal(data[0].subBus, undefined);
});
