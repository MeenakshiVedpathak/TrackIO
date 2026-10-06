'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Sub-BU sync scope — a Service PO created at the PARENT BU level stamps its work logs with the
// Parent's company_id, and the Parent can't be synced while it has Sub-BUs. A Sub-BU's sync must
// therefore also pull the Parent-stamped logs of the Employees assigned to THAT Sub-BU (each
// Employee to exactly one Sub-BU, the lowest id, so nothing is synced twice).
// Stubbed (no DB) — only the query shape is under test.
const { Company, EmployeeBusinessUnit, EmployeeWorkLog } = require('../src/models');
const employeeWorkLogRepository = require('../src/repositories/employeeWorkLogRepository');

const ORIGINAL = {
  companyFindOne: Company.findOne,
  companyFindAll: Company.findAll,
  ebuFindAll: EmployeeBusinessUnit.findAll,
  wlFindAll: EmployeeWorkLog.findAll,
};

test.afterEach(() => {
  Company.findOne = ORIGINAL.companyFindOne;
  Company.findAll = ORIGINAL.companyFindAll;
  EmployeeBusinessUnit.findAll = ORIGINAL.ebuFindAll;
  EmployeeWorkLog.findAll = ORIGINAL.wlFindAll;
});

function stubWorld({ companyRow, siblings = [], grants = [] }) {
  Company.findOne = async () => companyRow;
  Company.findAll = async () => siblings;
  EmployeeBusinessUnit.findAll = async () => grants;
  let captured = null;
  EmployeeWorkLog.findAll = async (opts) => { captured = opts.where; return []; };
  return () => captured;
}

test('a Sub-BU sync also pulls Parent-stamped logs of employees assigned to THIS Sub-BU only (lowest sibling id wins)', async () => {
  const getWhere = stubWorld({
    companyRow: { id: 52, parent_business_unit_id: 27 },
    siblings: [{ id: 51 }, { id: 52 }],
    grants: [
      { employee_id: 1, business_unit_id: 52 }, // only in 52 -> belongs to 52
      { employee_id: 2, business_unit_id: 51 }, // only in 51 -> belongs to 51
      { employee_id: 3, business_unit_id: 51 }, // in both 51 and 52 -> lowest (51) wins
      { employee_id: 3, business_unit_id: 52 },
    ],
  });
  await employeeWorkLogRepository.findForSync(52, 10, 2026);
  const or = getWhere()[Op.or];
  assert.deepEqual(or[0], { company_id: 52 });
  assert.equal(or[1].company_id, 27);
  assert.deepEqual(or[1].employee_id[Op.in], [1]);
});

test('a childless / top-level BU sync is unchanged: only its own company_id', async () => {
  const getWhere = stubWorld({ companyRow: { id: 40, parent_business_unit_id: null } });
  await employeeWorkLogRepository.findForSync(40, 10, 2026);
  assert.deepEqual(getWhere()[Op.or], [{ company_id: 40 }]);
});
