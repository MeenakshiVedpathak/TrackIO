'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Week Off Policy (saturday_off_rule): a Sub-BU ALWAYS follows its Parent
// (decided 2026-09-30). Parent changes cascade to its Sub-BUs in the same
// transaction; a Sub-BU's own value is read-only. Repository monkey-patch
// style, same as companyService.buHierarchy.test.js — no real DB writes.
const { sequelize } = require('../src/models');
const companyRepository = require('../src/repositories/companyRepository');
const companyService = require('../src/services/companyService');

const ORIGINAL = {
  findByIdForEntities: companyRepository.findByIdForEntities,
  findById: companyRepository.findById,
  hasChildren: companyRepository.hasChildren,
  update: companyRepository.update,
  updateSubBuSaturdayOffRule: companyRepository.updateSubBuSaturdayOffRule,
  transaction: sequelize.transaction,
};

function restore() {
  Object.assign(companyRepository, {
    findByIdForEntities: ORIGINAL.findByIdForEntities,
    findById: ORIGINAL.findById,
    hasChildren: ORIGINAL.hasChildren,
    update: ORIGINAL.update,
    updateSubBuSaturdayOffRule: ORIGINAL.updateSubBuSaturdayOffRule,
  });
  sequelize.transaction = ORIGINAL.transaction;
}

function company(fields) {
  return { status: 'active', entity_id: 3, ...fields, toJSON() { return { ...fields }; } };
}

// DATA + AI (27, Parent) with Sub-BUs DAS (51) and IBM (52); a second Parent JCB (60).
const ROWS = {
  27: company({ id: 27, company_name: 'DATA + AI', parent_business_unit_id: null, saturday_off_rule: 'ALL' }),
  51: company({ id: 51, company_name: 'DAS', parent_business_unit_id: 27, saturday_off_rule: 'ALL' }),
  60: company({ id: 60, company_name: 'JCB', parent_business_unit_id: null, saturday_off_rule: 'ALT_2_4' }),
  70: company({ id: 70, company_name: 'Standalone', parent_business_unit_id: null, saturday_off_rule: 'ALL' }),
};

function stub() {
  const calls = { updates: [], cascades: [], transactions: 0 };
  companyRepository.findByIdForEntities = async (id) => ROWS[id] || null;
  companyRepository.findById = async (id) => ROWS[id] || null;
  companyRepository.hasChildren = async (id) => id === 27;
  companyRepository.update = async (id, data, options) => {
    calls.updates.push({ id, data, options });
    return company({ ...ROWS[id].toJSON(), ...data });
  };
  companyRepository.updateSubBuSaturdayOffRule = async (parentId, rule, options) => {
    calls.cascades.push({ parentId, rule, options });
    return 2;
  };
  sequelize.transaction = async (fn) => {
    calls.transactions += 1;
    return fn({ fakeTransaction: true });
  };
  return calls;
}

test('Parent BU: changing saturday_off_rule cascades to its Sub-BUs in the SAME transaction', async () => {
  const calls = stub();
  try {
    await companyService.update(27, { saturday_off_rule: 'NONE' }, 1, null, [3]);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.updates[0].data.saturday_off_rule, 'NONE');
    assert.deepEqual(calls.cascades, [{ parentId: 27, rule: 'NONE', options: { transaction: { fakeTransaction: true } } }]);
    assert.deepEqual(calls.updates[0].options, { transaction: { fakeTransaction: true } });
  } finally {
    restore();
  }
});

test('Parent BU: other edits (or the same rule re-sent) do not touch Sub-BUs', async () => {
  const calls = stub();
  try {
    await companyService.update(27, { company_name: 'DATA & AI' }, 1, null, [3]);
    await companyService.update(27, { company_name: 'DATA & AI', saturday_off_rule: 'ALL' }, 1, null, [3]); // unchanged
    assert.equal(calls.cascades.length, 0);
  } finally {
    restore();
  }
});

test('Sub-BU: its own saturday_off_rule is read-only — always forced to the Parent\'s (no error)', async () => {
  const calls = stub();
  try {
    const updated = await companyService.update(51, { company_name: 'DAS', saturday_off_rule: 'NONE' }, 1, null, [3]);
    assert.equal(calls.updates[0].data.saturday_off_rule, 'ALL'); // parent 27's rule, not the sent NONE
    assert.equal(updated.saturday_off_rule, 'ALL');
    assert.equal(calls.cascades.length, 0);
  } finally {
    restore();
  }
});

test('Sub-BU edit without the field still re-aligns it to the Parent (heals any drift)', async () => {
  const calls = stub();
  try {
    await companyService.update(51, { company_name: 'DAS 2' }, 1, null, [3]);
    assert.equal(calls.updates[0].data.saturday_off_rule, 'ALL');
  } finally {
    restore();
  }
});

test('Moving a top-level BU under a new Parent adopts that Parent\'s rule', async () => {
  const calls = stub();
  try {
    await companyService.update(70, { parent_business_unit_id: 60, saturday_off_rule: 'ALL' }, 1, null, [3]);
    assert.equal(calls.updates[0].data.parent_business_unit_id, 60);
    assert.equal(calls.updates[0].data.saturday_off_rule, 'ALT_2_4'); // JCB's rule
    assert.equal(calls.cascades.length, 0);
  } finally {
    restore();
  }
});

test('Promoting a Sub-BU to a top-level BU makes its rule editable again (and cascades nothing — it has no Sub-BUs)', async () => {
  const calls = stub();
  try {
    await companyService.update(51, { parent_business_unit_id: null, saturday_off_rule: 'ALT_1_3' }, 1, null, [3]);
    assert.equal(calls.updates[0].data.saturday_off_rule, 'ALT_1_3');
    assert.equal(calls.cascades.length, 1); // harmless: updates 0 real rows for a BU without Sub-BUs
    assert.equal(calls.cascades[0].parentId, 51);
  } finally {
    restore();
  }
});
