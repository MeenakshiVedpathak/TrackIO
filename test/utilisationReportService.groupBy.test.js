'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repo = require('../src/repositories/utilisationReportRepository');
const service = require('../src/services/utilisationReportService');

const ORIGINAL_BU = repo.getBuWiseUtilisation;
test.after(() => { repo.getBuWiseUtilisation = ORIGINAL_BU; });

const captureGroupBy = async (query) => {
  let seen;
  repo.getBuWiseUtilisation = async (f) => { seen = f.groupBy; return { rows: [], count: 0, totals: null }; };
  // companyIds [] short-circuits the BU/entity narrowing helpers (no DB needed)
  await service.getBuWiseUtilisationReport({ month: 9, year: 2026, ...query }, [], { exportAll: true });
  return seen;
};

test('groupBy=bu is passed to the repository (hierarchy is expanded by the service)', async () => {
  assert.equal(await captureGroupBy({ groupBy: 'bu' }), 'bu');
  assert.equal(await captureGroupBy({ groupBy: 'sub_bu' }), undefined); // retired value: falls back to the flat layout
});

test('a missing or unknown groupBy keeps the original layout (undefined)', async () => {
  assert.equal(await captureGroupBy({}), undefined);
  assert.equal(await captureGroupBy({ groupBy: 'department' }), undefined);
});
