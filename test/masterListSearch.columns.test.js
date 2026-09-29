'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Master-list search covers every visible text column, OR'd, case-insensitive
// contains — and never widens the caller's company scope. Each test captures
// the options the repository hands to Model.findAndCountAll (no real DB).
const { ServicePO, Project, Client, SubProject } = require('../src/models');
const servicePORepository = require('../src/repositories/servicePORepository');
const projectRepository = require('../src/repositories/projectRepository');
const clientRepository = require('../src/repositories/clientRepository');
const subProjectRepository = require('../src/repositories/subProjectRepository');

function capture(Model) {
  const original = Model.findAndCountAll;
  let captured;
  Model.findAndCountAll = async (options) => {
    captured = options;
    return { rows: [], count: 0 };
  };
  return { get: () => captured, restore: () => { Model.findAndCountAll = original; } };
}

// The search's own [Op.or] list, wherever the repository nests it in [Op.and].
function searchOrOf(where) {
  const entries = where[Op.and] || [];
  const found = entries.find((e) => e && e[Op.or] && e[Op.or].some((c) => c && (c.service_po_name || c.project_name || c.client_name || c.sub_project_name)));
  assert.ok(found, 'search [Op.or] clause not found inside [Op.and]');
  return found[Op.or];
}

function keysOf(orList) {
  return orList.flatMap((c) => Object.keys(c || {}));
}

test('GET /service-pos search: PO name/code (unchanged) + description, client, project, service type, and Project Manager name', async () => {
  const cap = capture(ServicePO);
  try {
    await servicePORepository.findAll({ search: ' Kotak ', companyId: 10 }, { limit: 10, offset: 0 }, {});
    const opts = cap.get();
    const orList = searchOrOf(opts.where);

    assert.deepEqual(
      keysOf(orList.filter((c) => !(c && c.val))).sort(), // literal (PM clause) checked separately below
      ['$client.client_name$', '$project.project_name$', '$serviceType.service_type_name$', 'service_description', 'service_po_code', 'service_po_name'].sort()
    );
    assert.deepEqual(orList.find((c) => c.service_po_name).service_po_name, { [Op.iLike]: '%Kotak%' });

    const pmLiteral = orList.find((c) => c && c.val && /employee_servicepo_mapping/.test(c.val));
    assert.ok(pmLiteral, 'Project Manager EXISTS clause missing');
    assert.match(pmLiteral.val, /is_project_manager = true/);
    assert.match(pmLiteral.val, /status = 'active'/);
    assert.match(pmLiteral.val, /ILIKE '%Kotak%'/); // escaped, not interpolated raw
    assert.equal(opts.subQuery, false); // joined $alias$ columns resolve in one SELECT
  } finally {
    cap.restore();
  }
});

test('GET /service-pos search: a quote in the term is escaped inside the PM clause (no SQL injection)', async () => {
  const cap = capture(ServicePO);
  try {
    await servicePORepository.findAll({ search: "O'Brien", companyId: 10 }, {}, {});
    const pmLiteral = searchOrOf(cap.get().where).find((c) => c && c.val && /employee_servicepo_mapping/.test(c.val));
    assert.match(pmLiteral.val, /ILIKE '%O''Brien%'/);
  } finally {
    cap.restore();
  }
});

test('GET /projects search: project name/code (unchanged) + client name', async () => {
  const cap = capture(Project);
  try {
    await projectRepository.findAll({ search: 'Kotak', companyId: 10 }, { limit: 10, offset: 0 }, {});
    const opts = cap.get();
    assert.deepEqual(keysOf(searchOrOf(opts.where)).sort(), ['$client.client_name$', 'project_code', 'project_name'].sort());
    assert.equal(opts.subQuery, false);
  } finally {
    cap.restore();
  }
});

test('GET /clients search: name/code (unchanged) + industry', async () => {
  const cap = capture(Client);
  try {
    await clientRepository.findAll({ search: 'Chemical', companyId: 10 }, { limit: 10, offset: 0 }, {});
    assert.deepEqual(keysOf(searchOrOf(cap.get().where)).sort(), ['client_code', 'client_name', 'industry'].sort());
  } finally {
    cap.restore();
  }
});

test('GET /clients search does NOT drop an Admin\'s [Op.or]-shaped company scope (cross-tenant leak regression)', async () => {
  const cap = capture(Client);
  try {
    await clientRepository.findAll(
      { search: 'a', companyId: { ownedCompanyIds: [40], createdBy: 3 } },
      { limit: 10, offset: 0 },
      {}
    );
    const where = cap.get().where;
    // The scope's own top-level [Op.or] survives untouched...
    assert.ok(Array.isArray(where[Op.or]));
    assert.deepEqual(where[Op.or][0], { company_id: { [Op.in]: [40] } });
    assert.deepEqual(where[Op.or][1], { company_id: null, created_by: 3 });
    // ...and the search is ANDed alongside it, not substituted for it.
    assert.ok(searchOrOf(where).some((c) => c.client_name));
  } finally {
    cap.restore();
  }
});

test('GET /sub-projects search: name/code/description (unchanged) + parent Service PO name', async () => {
  const cap = capture(SubProject);
  try {
    await subProjectRepository.findAll({ search: 'Portal', companyId: 10 }, { limit: 10, offset: 0 }, {});
    const opts = cap.get();
    assert.deepEqual(
      keysOf(searchOrOf(opts.where)).sort(),
      ['$servicePO.service_po_name$', 'description', 'sub_project_code', 'sub_project_name'].sort()
    );
    assert.equal(opts.where.company_id, 10); // scope still applied
    assert.equal(opts.subQuery, false);
  } finally {
    cap.restore();
  }
});

test('no search term: no search clause is added on any of the four lists', async () => {
  const caps = [capture(ServicePO), capture(Project), capture(Client), capture(SubProject)];
  try {
    await servicePORepository.findAll({ companyId: 10 }, {}, {});
    await projectRepository.findAll({ companyId: 10 }, {}, {});
    await clientRepository.findAll({ companyId: 10 }, {}, {});
    await subProjectRepository.findAll({ companyId: 10 }, {}, {});
    for (const cap of caps) {
      const entries = cap.get().where[Op.and] || [];
      assert.ok(!entries.some((e) => e && e[Op.or] && e[Op.or].some((c) => c && (c.service_po_name || c.project_name || c.client_name || c.sub_project_name))));
    }
  } finally {
    caps.forEach((c) => c.restore());
  }
});
