'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// GET /my-team/timesheets/approval-summary/all — the combined, server-
// paginated replacement for the frontend's one-request-per-Employee fan-out.
// Repository/model monkey-patch style, same as the other managerSelfService tests.
const { Employee } = require('../src/models');
const employeeWorkLogRepository = require('../src/repositories/employeeWorkLogRepository');
const managerEmployeeMappingRepository = require('../src/repositories/managerEmployeeMappingRepository');
const servicePORepository = require('../src/repositories/servicePORepository');
const employeeServicePOMappingService = require('../src/services/employeeServicePOMappingService');
const employeeServicePOMappingRepository = require('../src/repositories/employeeServicePOMappingRepository');
const companyAccessControlService = require('../src/services/companyAccessControlService');
const managerSelfServiceService = require('../src/services/managerSelfServiceService');

const ORIGINAL = {
  employeeFindAll: Employee.findAll,
  bucketsPage: employeeWorkLogRepository.findApprovalSummaryBucketsPage,
  byIds: employeeWorkLogRepository.findByIdsWithIncludes,
  findByManager: managerEmployeeMappingRepository.findByManager,
  pmPoIds: employeeServicePOMappingService.getProjectManagerServicePOIds,
  findByServicePOs: employeeServicePOMappingRepository.findByServicePOs,
  centralised: servicePORepository.getActiveCentralisedPOIds,
  tenant: companyAccessControlService.resolveCentralisedServicePOTenant,
};

function restore() {
  Employee.findAll = ORIGINAL.employeeFindAll;
  employeeWorkLogRepository.findApprovalSummaryBucketsPage = ORIGINAL.bucketsPage;
  employeeWorkLogRepository.findByIdsWithIncludes = ORIGINAL.byIds;
  managerEmployeeMappingRepository.findByManager = ORIGINAL.findByManager;
  employeeServicePOMappingService.getProjectManagerServicePOIds = ORIGINAL.pmPoIds;
  employeeServicePOMappingRepository.findByServicePOs = ORIGINAL.findByServicePOs;
  servicePORepository.getActiveCentralisedPOIds = ORIGINAL.centralised;
  companyAccessControlService.resolveCentralisedServicePOTenant = ORIGINAL.tenant;
}

const TEAM_LEAD_RANK = 7;
const PROJECT_MANAGER_RANK = 6;

function employee(id, name) {
  return { id, employee_code: `E${id}`, full_name: name, designation: null, status: 'active', businessUnits: [] };
}

function stubTeamLeadTeam(ids) {
  managerEmployeeMappingRepository.findByManager = async () => ids.map((id) => ({ employee_id: id, mapping_type: 'PRIMARY' }));
  Employee.findAll = async () => ids.map((id) => employee(id, `Emp ${id}`));
}

function captureBuckets(rows = [], total = rows.length) {
  const calls = [];
  employeeWorkLogRepository.findApprovalSummaryBucketsPage = async (params) => {
    calls.push(params);
    return { rows, total };
  };
  return calls;
}

test('team = my mapped Employees; filters, sort and pagination are passed to ONE bucket query', async () => {
  stubTeamLeadTeam([11, 12, 13]);
  const calls = captureBuckets([]);
  employeeWorkLogRepository.findByIdsWithIncludes = async () => [];
  try {
    await managerSelfServiceService.getApprovalSummaryAll(99, [1], TEAM_LEAD_RANK, null, [1], {
      log_type: 'monthly', startDate: '2026-08-01', endDate: '2026-08-31',
      status: 'pending', service_po_id: '401', search: 'Kotak', sortBy: 'hours', sortOrder: 'asc', page: '3', limit: '10',
    });
    assert.equal(calls.length, 1);
    const p = calls[0];
    assert.deepEqual(p.employeeIds, [11, 12, 13]);
    assert.equal(p.isMonthly, true);
    assert.equal(p.status, 'pending');
    assert.equal(p.servicePoId, 401);
    assert.equal(p.search, 'Kotak');
    assert.equal(p.sortBy, 'hours');
    assert.equal(p.sortOrder, 'asc');
    assert.equal(p.limit, 10);
    assert.equal(p.offset, 20); // page 3 -> real server-side offset
    assert.equal(p.poScope, null); // Team Lead: no Service-PO restriction
  } finally {
    restore();
  }
});

test('status=all is not a filter; employee_ids only NARROWS the team (never widens)', async () => {
  stubTeamLeadTeam([11, 12, 13]);
  const calls = captureBuckets([]);
  employeeWorkLogRepository.findByIdsWithIncludes = async () => [];
  try {
    await managerSelfServiceService.getApprovalSummaryAll(99, [1], TEAM_LEAD_RANK, null, [1], {
      status: 'all', employee_ids: '12,13,777',
    });
    assert.equal(calls[0].status, null);
    assert.deepEqual(calls[0].employeeIds, [12, 13]); // 777 is not on my team
  } finally {
    restore();
  }
});

test('the caller\'s own record is never part of the team; empty team -> empty page, no bucket query', async () => {
  stubTeamLeadTeam([99]); // only the manager themselves
  const calls = captureBuckets([]);
  try {
    const result = await managerSelfServiceService.getApprovalSummaryAll(99, [1], TEAM_LEAD_RANK, null, [1], { page: '1', limit: '20' });
    assert.deepEqual(result.data, []);
    assert.equal(result.meta.total, 0);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('Project Manager: poScope = own Service POs + this tenant\'s Centralised POs', async () => {
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [401, 402];
  employeeServicePOMappingRepository.findByServicePOs = async () => [{ employee_id: 21 }, { employee_id: 22 }];
  Employee.findAll = async () => [employee(21, 'A'), employee(22, 'B')];
  companyAccessControlService.resolveCentralisedServicePOTenant = async () => ({ companyIds: [40], ownerIds: [3] });
  servicePORepository.getActiveCentralisedPOIds = async () => [{ id: 52 }, { id: 56 }];
  const calls = captureBuckets([]);
  employeeWorkLogRepository.findByIdsWithIncludes = async () => [];
  try {
    await managerSelfServiceService.getApprovalSummaryAll(99, [40], PROJECT_MANAGER_RANK, null, [40], {});
    assert.deepEqual(calls[0].employeeIds, [21, 22]);
    assert.deepEqual(calls[0].poScope, { ownPoIds: [401, 402], centralisedPoIds: [52, 56] });
  } finally {
    restore();
  }
});

test('Project Manager with no Service PO of their own -> empty page (no bucket query)', async () => {
  employeeServicePOMappingService.getProjectManagerServicePOIds = async () => [];
  const calls = captureBuckets([]);
  try {
    const result = await managerSelfServiceService.getApprovalSummaryAll(99, [40], PROJECT_MANAGER_RANK, null, [40], {});
    assert.deepEqual(result.data, []);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('rows carry the owning Employee + same bucket shape as the single-employee endpoint; entries loaded once for the page', async () => {
  stubTeamLeadTeam([11, 12]);
  captureBuckets([
    { employee_id: 12, full_name: 'Priya', employee_code: 'E12', period_date: '2026-08-05', total_hours: '7.50', entry_count: 2, approval_status: 'pending', entry_ids: [502, 501] },
    { employee_id: 11, full_name: 'Ravi', employee_code: 'E11', period_date: '2026-08-04', total_hours: '8.00', entry_count: 1, approval_status: 'approved', entry_ids: [400] },
  ], 45);
  const idCalls = [];
  employeeWorkLogRepository.findByIdsWithIncludes = async (ids) => {
    idCalls.push(ids);
    return ids.map((id) => ({ id, toJSON: () => ({ id, status: 'x' }) }));
  };
  try {
    const { data, meta } = await managerSelfServiceService.getApprovalSummaryAll(99, [1], TEAM_LEAD_RANK, null, [1], { page: '2', limit: '20' });

    assert.equal(idCalls.length, 1); // no per-bucket/per-employee lookups
    assert.deepEqual(idCalls[0], [502, 501, 400]);
    assert.deepEqual(data[0], {
      employee_id: 12,
      employee_name: 'Priya',
      employee_code: 'E12',
      employee: { id: 12, full_name: 'Priya', employee_code: 'E12' },
      date: '2026-08-05',
      entries: [{ id: 502, status: 'x' }, { id: 501, status: 'x' }],
      total_hours: 7.5,
      entry_count: 2,
      approval_status: 'pending',
    });
    assert.deepEqual(meta, { total: 45, page: 2, limit: 20, totalPages: 3, hasNext: true, hasPrev: true });
  } finally {
    restore();
  }
});

test('monthly buckets expose month/year (not date), like the single-employee endpoint', async () => {
  stubTeamLeadTeam([11]);
  captureBuckets([
    { employee_id: 11, full_name: 'Ravi', employee_code: 'E11', period_date: '2026-08-01', total_hours: '160', entry_count: 20, approval_status: 'approved', entry_ids: [] },
  ]);
  employeeWorkLogRepository.findByIdsWithIncludes = async () => [];
  try {
    const { data } = await managerSelfServiceService.getApprovalSummaryAll(99, [1], TEAM_LEAD_RANK, null, [1], { log_type: 'monthly' });
    assert.equal(data[0].month, 8);
    assert.equal(data[0].year, 2026);
    assert.equal('date' in data[0], false);
  } finally {
    restore();
  }
});
