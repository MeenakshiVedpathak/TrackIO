'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Employee Role & Organization Mapping Report — query construction (captured
// SQL, no DB) and service shaping. Same sequelize.query stub style as
// dashboardRepository.centralisedBuScope.test.js.
const { sequelize } = require('../src/models');
const repository = require('../src/repositories/employeeRoleBuMappingReportRepository');
const service = require('../src/services/employeeRoleBuMappingReportService');
const { employeeRoleBuMappingQuerySchema } = require('../src/validations/employeeRoleBuMappingReportValidation');

function captureQueries(rows = [], total = rows.length) {
  const original = sequelize.query;
  const calls = [];
  sequelize.query = async (sql, opts) => {
    calls.push({ sql: sql.replace(/\s+/g, ' '), replacements: opts.replacements });
    return /COUNT\(\*\)::int AS total/.test(sql) ? [{ total }] : rows;
  };
  return { calls, restore: () => { sequelize.query = original; } };
}

test('one row per employee: roles/BUs/Sub BUs aggregated with STRING_AGG(DISTINCT), grouped by employee', async () => {
  const cap = captureQueries();
  try {
    await repository.getEmployeeRoleBuMapping({ companyIds: [23], limit: 20, offset: 0 });
    const sql = cap.calls[0].sql;
    assert.match(sql, /STRING_AGG\(DISTINCT r\.role_name/);
    assert.match(sql, /STRING_AGG\(DISTINCT COALESCE\(m\.parent_name, m\.unit_name\)/); // BU (Sub-BU contributes its parent)
    assert.match(sql, /STRING_AGG\(DISTINCT CASE WHEN m\.parent_id IS NOT NULL THEN m\.unit_name END/); // Sub BU
    assert.match(sql, /GROUP BY e\.id, e\.employee_code, e\.full_name, rn\.roles/);
    assert.match(sql, /ebu\.status = 'active'/);
    assert.match(sql, /er\.status = 'active'/);
    assert.match(sql, /r\.status = 'active' AND r\.is_deleted = false/);
    assert.match(sql, /e\.is_deleted = false AND e\.status = 'active'/);
    assert.match(sql, /comp\.id IN \(:companyIds\)/); // only BUs in the caller's reach
    assert.match(sql, /LIMIT :limit OFFSET :offset/);
  } finally {
    cap.restore();
  }
});

test('Entity + BU + Sub BU are matched against the SAME mapping row (no cross-branch matches)', async () => {
  const cap = captureQueries();
  try {
    await repository.getEmployeeRoleBuMapping({
      companyIds: [23, 42], entityIds: [3], buIds: [23], subBuIds: [42], limit: 20, offset: 0,
    });
    const { sql, replacements } = cap.calls[0];
    // All three conditions inside ONE EXISTS over the same mapping row `m`.
    assert.ok(sql.includes(
      'EXISTS ( SELECT 1 FROM mappings m WHERE m.employee_id = e.id AND '
      + 'm.entity_id IN (:entityIds) AND m.unit_id IN (:subBuIds) AND m.parent_id IS NOT NULL AND m.parent_id IN (:buIds) )'
    ), 'single per-row EXISTS over mappings');
    assert.deepEqual(replacements.entityIds, [3]);
    assert.deepEqual(replacements.buIds, [23]);
    assert.deepEqual(replacements.subBuIds, [42]);
  } finally {
    cap.restore();
  }
});

test('BU alone also matches that BU\'s own Sub-BUs', async () => {
  const cap = captureQueries();
  try {
    await repository.getEmployeeRoleBuMapping({ companyIds: [23], buIds: [23, 24], limit: 20, offset: 0 });
    assert.match(cap.calls[0].sql, /\(m\.unit_id IN \(:buIds\) OR m\.parent_id IN \(:buIds\)\)/);
  } finally {
    cap.restore();
  }
});

test('role / employee / search filters; no org filter -> no mapping EXISTS clause', async () => {
  const cap = captureQueries();
  try {
    await repository.getEmployeeRoleBuMapping({
      companyIds: [23], roleIds: [2, 5], employeeId: 9, search: ' naja ', limit: 20, offset: 0,
    });
    const { sql, replacements } = cap.calls[0];
    assert.match(sql, /fer\.role_id IN \(:roleIds\)/);
    assert.match(sql, /e\.id = :employeeId/);
    assert.match(sql, /\(e\.full_name ILIKE :search OR e\.employee_code ILIKE :search\)/);
    assert.equal(replacements.search, '%naja%');
    assert.doesNotMatch(sql, /FROM mappings m WHERE m\.employee_id = e\.id/);
  } finally {
    cap.restore();
  }
});

test('export (limit null) reads every matching row; empty reach -> no query at all', async () => {
  const cap = captureQueries();
  try {
    await repository.getEmployeeRoleBuMapping({ companyIds: [23], limit: null });
    assert.doesNotMatch(cap.calls[0].sql, /LIMIT/);
    const before = cap.calls.length;
    const empty = await repository.getEmployeeRoleBuMapping({ companyIds: [], limit: 20, offset: 0 });
    assert.deepEqual(empty, { rows: [], total: 0 });
    assert.equal(cap.calls.length, before);
  } finally {
    cap.restore();
  }
});

test('service: parses comma lists, pages, and shapes nulls to empty strings', async () => {
  const cap = captureQueries([
    { employee_id: 1, employee_code: 'E1', employee_name: 'Asha', roles: 'Employee, Manager', business_units: 'Technology, Operations', sub_business_units: null },
  ], 41);
  try {
    const { data, meta } = await service.getReport({ entityIds: '1,2', roleIds: '3', page: '3', limit: '20' }, [23]);
    assert.deepEqual(cap.calls[0].replacements.entityIds, [1, 2]);
    assert.deepEqual(cap.calls[0].replacements.roleIds, [3]);
    assert.equal(cap.calls[0].replacements.offset, 40);
    assert.deepEqual(data[0], {
      employee_id: 1, employee_code: 'E1', employee_name: 'Asha',
      roles: 'Employee, Manager', business_units: 'Technology, Operations', sub_business_units: '',
    });
    assert.equal(meta.total, 41);
    assert.deepEqual(service.EXPORT_COLUMNS.map((c) => c.label), ['Employee Name', 'Roles', 'BUs', 'Sub BUs']);
  } finally {
    cap.restore();
  }
});

test('validation: ids must be numeric lists (an entity CODE like "CRG" is rejected), limit <= 100', () => {
  assert.ok(employeeRoleBuMappingQuerySchema.validate({ entityIds: 'CRG' }).error);
  assert.ok(employeeRoleBuMappingQuerySchema.validate({ limit: 500 }).error);
  assert.ok(employeeRoleBuMappingQuerySchema.validate({ format: 'pdf' }).error);
  assert.equal(employeeRoleBuMappingQuerySchema.validate({ entityIds: '2,3', subBuIds: '42' }).error, undefined);
});

test('nothing is hardcoded: no entity/BU/role literal in the report\'s source', () => {
  const files = [
    '../src/repositories/employeeRoleBuMappingReportRepository.js',
    '../src/services/employeeRoleBuMappingReportService.js',
  ].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
  for (const src of files) {
    assert.doesNotMatch(src, /entity_code\s*=|'CRG'|"CRG"/);
    assert.doesNotMatch(src, /role_name\s*=\s*'/);
    assert.doesNotMatch(src, /company_name\s*=\s*'/);
  }
});
