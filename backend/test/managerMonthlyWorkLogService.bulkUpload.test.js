'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const xlsx = require('xlsx');

const { Employee } = require('../src/models');
const employeeRepository = require('../src/repositories/employeeRepository');
const managerEmployeeMappingRepository = require('../src/repositories/managerEmployeeMappingRepository');
const employeeTimesheetService = require('../src/services/employeeTimesheetService');
const employeeMonthlyWorkLogService = require('../src/services/employeeMonthlyWorkLogService');
const managerMonthlyWorkLogService = require('../src/services/managerMonthlyWorkLogService');

const employeeServicePOMappingService = require('../src/services/employeeServicePOMappingService');
const employeeServicePOMappingRepository = require('../src/repositories/employeeServicePOMappingRepository');

const ORIGINAL = {
  getProjectManagerServicePOIds: employeeServicePOMappingService.getProjectManagerServicePOIds,
  findByServicePOs: employeeServicePOMappingRepository.findByServicePOs,
  findByCode: employeeRepository.findByCode,
  findById: employeeRepository.findById,
  findByManager: managerEmployeeMappingRepository.findByManager,
  employeeFindAll: Employee.findAll,
  loadMappedPOsWithHierarchy: employeeTimesheetService.loadMappedPOsWithHierarchy,
  submitMonthlyWorkLog: employeeMonthlyWorkLogService.submitMonthlyWorkLog,
};

function restore() {
  employeeServicePOMappingService.getProjectManagerServicePOIds = ORIGINAL.getProjectManagerServicePOIds;
  employeeServicePOMappingRepository.findByServicePOs = ORIGINAL.findByServicePOs;
  employeeRepository.findByCode = ORIGINAL.findByCode;
  employeeRepository.findById = ORIGINAL.findById;
  managerEmployeeMappingRepository.findByManager = ORIGINAL.findByManager;
  Employee.findAll = ORIGINAL.employeeFindAll;
  employeeTimesheetService.loadMappedPOsWithHierarchy = ORIGINAL.loadMappedPOsWithHierarchy;
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = ORIGINAL.submitMonthlyWorkLog;
}

test.after(() => restore());

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'worklog-upload-'));

function writeSheet(rows) {
  const filePath = path.join(TMP_DIR, `sheet-${Date.now()}-${Math.random()}.xlsx`);
  const header = ['Employee Code', 'Employee Name', 'Service PO Name', 'Hours', 'Description'];
  const data = [header, ...rows];
  const sheet = xlsx.utils.aoa_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  xlsx.writeFile(workbook, filePath);
  return filePath;
}

// A month solidly in the past, so dateHelper.isMonthlyLogEligible never blocks the submission.
const PERIOD = { month: 1, year: 2025 };

// Stubs the Manager-tier lookup path: findByManager returns PRIMARY mapping rows (deliberately
// including a Business Unit the caller/manager themself doesn't belong to, to prove the fix
// doesn't reintroduce the BU-scoping bug already fixed in getMyEmployees), and Employee.findAll
// resolves those mapped ids with no company/BU scoping at all.
function stubPrimaryTeam(managerUserId, employees) {
  // Not a Project Manager of any Service PO unless a test says otherwise (stubPmOnly).
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [];
  managerEmployeeMappingRepository.findByManager = async (calledManagerId) => {
    assert.equal(calledManagerId, managerUserId);
    return employees.map((e) => ({ employee_id: e.id, mapping_type: 'PRIMARY' }));
  };
  // The real query filters Employee.findAll by { id: { [Op.in]: mappedEmployeeIds }}, but every
  // test here maps `employees` 1:1 with what findByManager just returned, so returning the full
  // stubbed list is equivalent without having to unpack the Op.in symbol in a mock.
  Employee.findAll = async () => employees;
}

test('a row for an Employee outside the caller\'s team and PM Service POs is SKIPPED with a warning, not a whole-file rejection', async () => {
  stubPrimaryTeam(42, [{ id: 1, employee_code: 'E999', status: 'active', is_deleted: false }]); // file uses E001, not E999
  let submitCalled = false;
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async () => { submitCalled = true; };

  const filePath = writeSheet([['E001', 'Alice', 'PO Alpha', 10, 'work']]);
  const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1');

  assert.equal(result.employees_processed, 0);
  assert.equal(result.rows_skipped, 1);
  assert.equal(result.skipped[0].employee_code, 'E001');
  assert.equal(submitCalled, false);
});

// Project Manager route — no Team Lead / Primary Manager mapping at all, only
// is_project_manager = true on specific Service POs.
function stubPmOnly(pmPoIds, mappedEmployees) {
  managerEmployeeMappingRepository.findByManager = async () => []; // no PRIMARY mappings
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => pmPoIds;
  employeeServicePOMappingRepository.findByServicePOs = async () => mappedEmployees.map((e) => ({ employee_id: e.id }));
  Employee.findAll = async () => mappedEmployees;
}

test('Project Manager (no Team Lead mapping): rows on POs they manage import; rows on other POs are skipped as warnings', async () => {
  stubPmOnly([501], [{ id: 1, employee_code: 'E001', status: 'active', is_deleted: false }]);
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [
      { id: 501, service_po_name: 'PO Alpha' },
      { id: 502, service_po_name: 'PO Other' }, // employee is mapped here, but the caller is not its PM
    ],
    hierarchyRowsByPOId: new Map(),
  });
  const submitted = [];
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (employeeId, companyId, data, options) => {
    submitted.push({ employeeId, data, options });
    return {};
  };

  const filePath = writeSheet([
    ['E001', 'Alice', 'PO Alpha', 10, 'mine'],
    ['E001', 'Alice', 'PO Other', 20, 'not mine'],
  ]);
  const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1');

  assert.equal(result.employees_processed, 1);
  assert.equal(result.total_rows, 1);
  assert.equal(result.rows_skipped, 1);
  assert.match(result.skipped[0].reason, /not the Project Manager of Service PO "PO Other"/);
  assert.deepEqual(submitted[0].data.entries.map((e) => e.service_po_id), [501]);
  // Only the PM's own POs may be replaced — never the employee's other projects' hours.
  assert.deepEqual(submitted[0].options.scopeServicePOIds, [501]);
});

// Regression coverage for the bug this fixed: resolving a row's Employee Code must NEVER be
// scoped to the manager's own active Business Unit — a PRIMARY-mapped Employee can legitimately
// sit in a different Business Unit entirely (manager_employee_mappings is the access grant, not
// shared BU membership). companyId (10) here deliberately differs from the mapped Employee's own
// Business Unit membership, which this stub doesn't even model, to prove no BU filter is applied.
test('Gate 1 succeeds for a PRIMARY-mapped Employee regardless of the manager\'s own active Business Unit (companyId)', async () => {
  stubPrimaryTeam(42, [{ id: 1, employee_code: 'E001', status: 'active', is_deleted: false }]);
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [{ id: 501, service_po_name: 'PO Alpha' }],
    hierarchyRowsByPOId: new Map(),
  });
  const submittedCalls = [];
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (employeeId, companyId, data, options) => {
    submittedCalls.push({ employeeId, companyId });
    return { month: data.month, year: data.year };
  };

  const filePath = writeSheet([['E001', 'Alice', 'PO Alpha', 10, 'work']]);
  // companyId = 999, an arbitrary BU the stub never associates with the Employee at all.
  const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 999, filePath, PERIOD, 42, '127.0.0.1');

  assert.equal(result.employees_processed, 1);
  assert.equal(submittedCalls.length, 1);
  assert.equal(submittedCalls[0].employeeId, 1);
});

test('Gate 2 rejects the whole file when a row\'s Service PO is not mapped to the Employee', async () => {
  stubPrimaryTeam(42, [{ id: 1, employee_code: 'E001', status: 'active', is_deleted: false }]);
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [{ id: 501, service_po_name: 'PO Alpha' }],
    hierarchyRowsByPOId: new Map(),
  });
  let submitCalled = false;
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async () => { submitCalled = true; };

  const filePath = writeSheet([['E001', 'Alice', 'PO Beta (not mapped)', 10, 'work']]);

  await assert.rejects(
    () => managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1'),
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.details.phase, 'service_po');
      assert.equal(err.details.error_rows.length, 1);
      return true;
    }
  );
  assert.equal(submitCalled, false);
});

test('happy path: both gates pass -> groups rows by employee and REPLACE-SAVEs each, auto-approved, Main-PO-only', async () => {
  stubPrimaryTeam(42, [
    { id: 1, employee_code: 'E001', status: 'active', is_deleted: false },
    { id: 2, employee_code: 'E002', status: 'active', is_deleted: false },
  ]);
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [
      { id: 501, service_po_name: 'PO Alpha' },
      { id: 502, service_po_name: 'PO Gamma' },
    ],
    hierarchyRowsByPOId: new Map(),
  });

  const submittedCalls = [];
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (employeeId, companyId, data, options) => {
    submittedCalls.push({ employeeId, companyId, data, options });
    return { month: data.month, year: data.year };
  };

  const filePath = writeSheet([
    ['E001', 'Alice', 'PO Alpha', 10, 'work A'],
    ['E001', 'Alice', 'PO Gamma', 5, ''],
    ['E002', 'Bob', 'PO Alpha', 8, 'work B'],
  ]);

  const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1');

  assert.equal(result.employees_processed, 2);
  assert.equal(result.total_rows, 3);
  assert.equal(submittedCalls.length, 2);

  const forEmp1 = submittedCalls.find((c) => c.employeeId === 1);
  assert.equal(forEmp1.data.entries.length, 2);
  assert.equal(forEmp1.options.forceApproved, true);
  assert.equal(forEmp1.options.allowHierarchyNode, false);
  assert.equal(forEmp1.options.creatorId, 42);

  const forEmp2 = submittedCalls.find((c) => c.employeeId === 2);
  assert.equal(forEmp2.data.entries.length, 1);
  assert.equal(forEmp2.data.entries[0].service_po_id, 501);
  assert.equal(forEmp2.data.entries[0].hours, 8);
});

// Description is optional (min-length/required was mistakenly copied from the Employee
// self-service schema at first) — a row with a genuinely blank Description must still succeed.
test('a row with a blank Description still passes both gates and saves with description: \'\'', async () => {
  stubPrimaryTeam(42, [{ id: 1, employee_code: 'E001', status: 'active', is_deleted: false }]);
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [{ id: 501, service_po_name: 'PO Alpha' }],
    hierarchyRowsByPOId: new Map(),
  });
  const submittedCalls = [];
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (employeeId, companyId, data) => {
    submittedCalls.push(data);
    return { month: data.month, year: data.year };
  };

  const filePath = writeSheet([['E001', 'Alice', 'PO Alpha', 10, '']]);
  await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1');

  assert.equal(submittedCalls[0].entries[0].description, '');
});

// Regression coverage for today's live incident: one employee's write-time
// conflict (e.g. "already synced elsewhere") must not abort the rest of an
// otherwise-valid file — every OTHER employee still gets processed, and the
// failing one is reported back by name/code instead of just crashing the
// whole request.
test('one employee failing at write time is skipped and reported; the rest of the file still succeeds', async () => {
  stubPrimaryTeam(42, [
    { id: 1, employee_code: 'E001', status: 'active', is_deleted: false },
    { id: 2, employee_code: 'E002', status: 'active', is_deleted: false },
    { id: 3, employee_code: 'E003', status: 'active', is_deleted: false },
  ]);
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [{ id: 501, service_po_name: 'PO Alpha' }],
    hierarchyRowsByPOId: new Map(),
  });

  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (employeeId) => {
    if (employeeId === 2) {
      const err = new Error('This month\'s work log has already been synced to the official Timesheet and can no longer be edited.');
      err.statusCode = 409;
      throw err;
    }
    return {};
  };

  const filePath = writeSheet([
    ['E001', 'Alice', 'PO Alpha', 10, 'work'],
    ['E002', 'Bob', 'PO Alpha', 8, 'work'],
    ['E003', 'Carol', 'PO Alpha', 6, 'work'],
  ]);

  const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1');

  assert.equal(result.employees_processed, 2);
  assert.equal(result.employees_failed, 1);
  assert.equal(result.results.length, 2);
  assert.deepEqual(result.results.map((r) => r.employee_code).sort(), ['E001', 'E003']);

  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].employee_code, 'E002');
  assert.equal(result.failures[0].employee_name, 'Bob');
  assert.match(result.failures[0].error, /already been synced/);
});

test('Admin-tier caller bypasses the PRIMARY-manager ownership gate entirely', async () => {
  employeeRepository.findByCode = async () => ({ id: 1, status: 'active', is_deleted: false });
  let mappingLookupCalled = false;
  managerEmployeeMappingRepository.findByManager = async () => {
    mappingLookupCalled = true;
    return [];
  };
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [{ id: 501, service_po_name: 'PO Alpha' }],
    hierarchyRowsByPOId: new Map(),
  });
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async () => ({});

  const filePath = writeSheet([['E001', 'Alice', 'PO Alpha', 10, 'work']]);

  // hierarchyRank 2 = Admin tier (<= ADMIN_TIER_MAX_RANK)
  const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(7, 10, filePath, PERIOD, 7, '127.0.0.1', 2, []);

  assert.equal(result.employees_processed, 1);
  assert.equal(mappingLookupCalled, false);
});

// Manual single-employee form: a Project Manager may only log against POs they manage.
const managerSelfServiceService = require('../src/services/managerSelfServiceService');

test('manual submit: Project Manager logging against a PO they do not manage is rejected (403) and nothing is written', async () => {
  const origAssert = managerSelfServiceService.assertOwnEmployeeForApproval;
  managerSelfServiceService.assertOwnEmployeeForApproval = async () => [501]; // PM scope
  require('../src/services/companyAccessControlService').resolveCentralisedServicePOTenant = async () => ({});
  require('../src/repositories/servicePORepository').getActiveCentralisedPOIds = async () => [];
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [501];
  let submitCalled = false;
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async () => { submitCalled = true; };
  try {
    await assert.rejects(
      () => managerMonthlyWorkLogService.submitMonthlyWorkLogForEmployee(
        42, 1, 10, { month: 1, year: 2025, entries: [{ service_po_id: 502, hours: 5 }] }, 42, '127.0.0.1', 6
      ),
      (err) => err.statusCode === 403
    );
    assert.equal(submitCalled, false);
  } finally {
    managerSelfServiceService.assertOwnEmployeeForApproval = origAssert;
  }
});

test('manual submit: Project Manager on their own PO is allowed and only that PO is replaced', async () => {
  const origAssert = managerSelfServiceService.assertOwnEmployeeForApproval;
  managerSelfServiceService.assertOwnEmployeeForApproval = async () => [501];
  require('../src/services/companyAccessControlService').resolveCentralisedServicePOTenant = async () => ({});
  require('../src/repositories/servicePORepository').getActiveCentralisedPOIds = async () => [];
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [501];
  let opts;
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (e, c, d, o) => { opts = o; return {}; };
  try {
    await managerMonthlyWorkLogService.submitMonthlyWorkLogForEmployee(
      42, 1, 10, { month: 1, year: 2025, entries: [{ service_po_id: 501, hours: 5 }] }, 42, '127.0.0.1', 6
    );
    assert.deepEqual(opts.scopeServicePOIds, [501]);
  } finally {
    managerSelfServiceService.assertOwnEmployeeForApproval = origAssert;
  }
});

test('Project Manager GET/submit response lists only their managed POs + Centralised POs', async () => {
  const cas = require('../src/services/companyAccessControlService');
  const spr = require('../src/repositories/servicePORepository');
  const orig = { assert: managerSelfServiceService.assertOwnEmployeeForApproval, tenant: cas.resolveCentralisedServicePOTenant, cent: spr.getActiveCentralisedPOIds, get: employeeMonthlyWorkLogService.getMonthlyWorkLog };
  managerSelfServiceService.assertOwnEmployeeForApproval = async () => [501];
  require('../src/services/companyAccessControlService').resolveCentralisedServicePOTenant = async () => ({});
  require('../src/repositories/servicePORepository').getActiveCentralisedPOIds = async () => [];
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [501];
  cas.resolveCentralisedServicePOTenant = async () => ({});
  spr.getActiveCentralisedPOIds = async () => [{ id: 56 }]; // Leaves
  employeeMonthlyWorkLogService.getMonthlyWorkLog = async () => ({
    month: 9, year: 2026,
    service_pos: [{ service_po_id: 501 }, { service_po_id: 186 }, { service_po_id: 56 }],
  });
  try {
    const dto = await managerMonthlyWorkLogService.getMonthlyWorkLogForEmployee(42, 1, 10, 9, 2026, 6);
    assert.deepEqual(dto.service_pos.map((p) => p.service_po_id), [501, 56]);
  } finally {
    managerSelfServiceService.assertOwnEmployeeForApproval = orig.assert;
    cas.resolveCentralisedServicePOTenant = orig.tenant;
    spr.getActiveCentralisedPOIds = orig.cent;
    employeeMonthlyWorkLogService.getMonthlyWorkLog = orig.get;
  }
});

test('BU Admin import: PO from another BU is skipped with a warning; centralised and BU-less (Admin) POs are allowed', async () => {
  const { Company, ServicePO } = require('../src/models');
  const orig = { cFind: Company.findAll, pFind: ServicePO.findAll, byCode: employeeRepository.findByCode, byId: employeeRepository.findById };
  Company.findAll = async () => []; // no Sub-BUs
  employeeRepository.findByCode = async () => ({ id: 1, employee_code: 'E001', status: 'active', is_deleted: false });
  employeeRepository.findById = async () => ({ id: 1 });
  employeeTimesheetService.loadMappedPOsWithHierarchy = async () => ({
    mappedPOs: [
      { id: 601, service_po_name: 'My BU PO' },
      { id: 602, service_po_name: 'Other BU PO' },
      { id: 603, service_po_name: 'Centralised PO' },
      { id: 604, service_po_name: 'Admin PO' },
    ],
    hierarchyRowsByPOId: new Map(),
  });
  ServicePO.findAll = async () => [
    { id: 601, company_id: 10, is_centralised: false },
    { id: 602, company_id: 99, is_centralised: false },
    { id: 603, company_id: 99, is_centralised: true },
    { id: 604, company_id: null, is_centralised: false },
  ];
  let submitted;
  employeeMonthlyWorkLogService.submitMonthlyWorkLog = async (e, c, d) => { submitted = d.entries.map((x) => x.service_po_id); return {}; };
  try {
    const filePath = writeSheet([
      ['E001', 'Alice', 'My BU PO', 1, ''], ['E001', 'Alice', 'Other BU PO', 2, ''],
      ['E001', 'Alice', 'Centralised PO', 3, ''], ['E001', 'Alice', 'Admin PO', 4, ''],
    ]);
    const result = await managerMonthlyWorkLogService.bulkUploadMonthlyWorkLog(42, 10, filePath, PERIOD, 42, '127.0.0.1', 4, [10]);
    assert.deepEqual(submitted.sort(), [601, 603, 604]);
    assert.equal(result.rows_skipped, 1);
    assert.match(result.skipped[0].reason, /"Other BU PO" is not from this Business Unit/);
  } finally {
    Company.findAll = orig.cFind; ServicePO.findAll = orig.pFind;
    employeeRepository.findByCode = orig.byCode; employeeRepository.findById = orig.byId;
  }
});
