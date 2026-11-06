'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// GET /my-team/timesheets/approval-summary/all/export — the Excel export of
// the combined Timesheet Approval Summary. Repository query construction
// (captured SQL, no DB) + validation here; team/poScope resolution and row
// shaping are covered alongside getApprovalSummaryAll's own tests in
// test/managerSelfServiceService.approvalSummaryAll.test.js since both share
// resolveApprovalSummaryTeamScope().
const { sequelize } = require('../src/models');
const employeeWorkLogRepository = require('../src/repositories/employeeWorkLogRepository');
const { approvalSummaryAllExportQuerySchema: schema } = require('../src/validations/managerSelfServiceValidation');

function capture(rows = []) {
  const original = sequelize.query;
  const calls = [];
  sequelize.query = async (sql, opts) => {
    calls.push({ sql: sql.replace(/\s+/g, ' '), replacements: opts.replacements });
    return rows;
  };
  return { calls, restore: () => { sequelize.query = original; } };
}

test('findApprovalSummaryBuckets: ONE query, no LIMIT/OFFSET/COUNT, same authorized scope as the paged endpoint', async () => {
  const cap = capture([]);
  try {
    await employeeWorkLogRepository.findApprovalSummaryBuckets({
      employeeIds: [11, 12], startDate: '2026-08-01', endDate: '2026-08-31', status: 'pending',
    });
    assert.equal(cap.calls.length, 1); // no separate COUNT(*) query, unlike findApprovalSummaryBucketsPage
    const { sql, replacements } = cap.calls[0];
    assert.match(sql, /wl\.employee_id IN \(:employeeIds\)/);
    assert.match(sql, /wl\.work_date >= :startDate/);
    assert.match(sql, /wl\.work_date <= :endDate/);
    assert.match(sql, /b\.approval_status = :status/);
    assert.doesNotMatch(sql, /LIMIT|OFFSET/);
    assert.doesNotMatch(sql, /COUNT\(\*\)::int AS total\b/); // the separate count-query alias findApprovalSummaryBucketsPage adds; entry_count's own COUNT(*) is fine
    assert.deepEqual(replacements.employeeIds, [11, 12]);
    assert.equal(replacements.status, 'pending');
  } finally {
    cap.restore();
  }
});

test('findApprovalSummaryBuckets: carries service_po_names (distinct PO names touched that bucket) for the export column', async () => {
  const cap = capture([]);
  try {
    await employeeWorkLogRepository.findApprovalSummaryBuckets({ employeeIds: [11] });
    assert.match(cap.calls[0].sql, /array_agg\(DISTINCT sp\.service_po_name\) FILTER \(WHERE sp\.service_po_name IS NOT NULL\) AS service_po_names/);
  } finally {
    cap.restore();
  }
});

test('findApprovalSummaryBuckets: default order is pending-first, newest period, then employee name (export ignores sortBy/sortOrder — there is none to pass)', async () => {
  const cap = capture([]);
  try {
    await employeeWorkLogRepository.findApprovalSummaryBuckets({ employeeIds: [11] });
    assert.match(cap.calls[0].sql, /ORDER BY CASE WHEN approval_status = 'pending' THEN 0 ELSE 1 END ASC, period_date DESC, full_name ASC, employee_id ASC$/);
  } finally {
    cap.restore();
  }
});

test('findApprovalSummaryBuckets: empty employeeIds, or a Project Manager with no own POs, short-circuits with no query', async () => {
  const cap = capture([]);
  try {
    assert.deepEqual(await employeeWorkLogRepository.findApprovalSummaryBuckets({ employeeIds: [] }), []);
    assert.deepEqual(
      await employeeWorkLogRepository.findApprovalSummaryBuckets({ employeeIds: [11], poScope: { ownPoIds: [] } }),
      []
    );
    assert.equal(cap.calls.length, 0);
  } finally {
    cap.restore();
  }
});

test('findApprovalSummaryBuckets: poScope composes the same own-PO / Centralised-PO predicate as the paged endpoint', async () => {
  const cap = capture([]);
  try {
    await employeeWorkLogRepository.findApprovalSummaryBuckets({
      employeeIds: [11], poScope: { ownPoIds: [401], centralisedPoIds: [52] },
    });
    const { sql, replacements } = cap.calls[0];
    assert.match(sql, /wl\.service_po_id IN \(:ownPoIds\) OR \(wl\.service_po_id IN \(:centralisedPoIds\)/);
    assert.deepEqual(replacements.ownPoIds, [401]);
    assert.deepEqual(replacements.centralisedPoIds, [52]);
  } finally {
    cap.restore();
  }
});

test('validation: same filters as the landing table; page/limit/sortBy/sortOrder are unknown keys (stripped, not applied); format defaults to excel', () => {
  const opts = { stripUnknown: true };
  assert.ok(schema.validate({ format: 'csv' }).error); // only excel is offered
  const { value, error } = schema.validate(
    { log_type: 'monthly', startDate: '2026-08-01', endDate: '2026-08-31', status: 'pending', service_po_id: 401, search: 'Kotak', employee_ids: '11,12', business_unit_id: 7, page: 3, limit: 200, sortBy: 'hours' },
    opts
  );
  assert.equal(error, undefined);
  assert.equal(value.format, 'excel');
  assert.equal(value.page, undefined);
  assert.equal(value.limit, undefined);
  assert.equal(value.sortBy, undefined);
  assert.equal(value.status, 'pending');
  assert.equal(value.employee_ids, '11,12');
});
