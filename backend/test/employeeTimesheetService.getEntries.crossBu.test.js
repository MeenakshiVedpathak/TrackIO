'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const employeeWorkLogRepository = require('../src/repositories/employeeWorkLogRepository');
const employeeTimesheetService = require('../src/services/employeeTimesheetService');

/**
 * The Employee's own "Rejected Entries" list must not be narrowed to the active session BU: a
 * cross-BU-mapped Employee's entry on another BU's Service PO carries that PO's BU as its
 * company_id, so a session-BU filter made a rejected entry vanish from the list (while still
 * visible in reports) and the Employee could never fix and resubmit it.
 */

test("getEntries scopes to the Employee only — the caller's active BU is never passed as a filter", async () => {
  const original = employeeWorkLogRepository.findAll;
  let seenFilters = null;
  try {
    employeeWorkLogRepository.findAll = async (filters) => {
      seenFilters = filters;
      return { rows: [], count: 0 };
    };

    // employee 376's active session BU is 68; their rejected entry sits on a BU-69 Service PO.
    await employeeTimesheetService.getEntries(376, 68, { status: 'rejected', poId: '191', startDate: '2026-10-01', endDate: '2026-10-19' });

    assert.equal(seenFilters.employeeId, 376);
    assert.equal(seenFilters.companyId, undefined);
    assert.equal(seenFilters.status, 'rejected');
    assert.equal(seenFilters.poId, '191');
  } finally {
    employeeWorkLogRepository.findAll = original;
  }
});

test('getEntries returns an entry whose company_id is another BU (the PO\'s), with its rejection details', async () => {
  const original = employeeWorkLogRepository.findAll;
  try {
    employeeWorkLogRepository.findAll = async () => ({
      rows: [{
        toJSON: () => ({
          id: 6676, employee_id: 376, service_po_id: 191, company_id: 69, status: 'rejected', hours: '10.00',
          rejection_remark: 't', timeEntries: [], rejectedByEmployee: { full_name: 'MSDhoni' },
        }),
      }],
      count: 1,
    });

    const result = await employeeTimesheetService.getEntries(376, 68, { status: 'rejected' });

    assert.equal(result.meta.total, 1);
    assert.equal(result.data[0].id, 6676);
    assert.equal(result.data[0].rejected_by_name, 'MSDhoni');
    assert.equal(result.data[0].entry_type, 'HOURLY');
  } finally {
    employeeWorkLogRepository.findAll = original;
  }
});
