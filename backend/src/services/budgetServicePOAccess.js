'use strict';

const servicePORepository = require('../repositories/servicePORepository');
const servicePOService = require('./servicePOService');

const companyAccessControlService = require('./companyAccessControlService');
const { ServicePO } = require('../models');

/**
 * Service PO access for the Cost Budget / Resource Budget write paths.
 *
 * A Project Manager / Delivery Head works ONLY on Service POs individually
 * mapped to them (employee_servicepo_mapping, active row) - the same rule the
 * Service PO Master list/detail already applies (servicePOService.
 * resolveIndividuallyMappedServicePOIds). Two consequences, both fixed here:
 *   - a mapped PO that sits in a Business Unit other than the active
 *     X-Company-Id one is reachable (previously a false "Service PO not found");
 *   - a PO that is NOT mapped to them is not reachable, even inside their own
 *     BU (previously any PO in the BU could be budgeted).
 * Every other role keeps its existing company-scope behaviour unchanged.
 */

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ mappedServicePOIds: number[]|null, scope: number|number[] }>}
 *   mappedServicePOIds is null for every role except Project Manager/Delivery
 *   Head. scope is what budget-record lookups should use as their company scope.
 */
async function resolveBudgetAccess(req) {
  let mappedServicePOIds = req.employeeId
    ? await servicePOService.resolveIndividuallyMappedServicePOIds(req.employeeId, req.employeeRoleNames)
    : null;
  // Centralised POs (Leaves, On Bench, ...) are auto-mapped to every Employee,
  // so a mapping to one says nothing about managing it - never budgetable here.
  if (Array.isArray(mappedServicePOIds) && mappedServicePOIds.length > 0) {
    const centralised = new Set(await servicePORepository.findCentralisedIdsAmong(mappedServicePOIds));
    mappedServicePOIds = mappedServicePOIds.filter((id) => !centralised.has(id));
  }

  if (mappedServicePOIds === null) {
    const scope = await companyAccessControlService.resolveActorCompanyScope({
      companyId: req.companyId,
      hierarchyRank: req.hierarchyRank,
      employeeId: req.employeeId,
    });
    return { mappedServicePOIds: null, scope };
  }

  // Budget rows are stamped with their Service PO's own company, so a mapped
  // cross-BU PO's rows live outside the actor's own BU reach: widen the record
  // lookup scope to reach + the mapped POs' companies.
  const fullReach = await companyAccessControlService.resolveActorFullReach({
    hierarchyRank: req.hierarchyRank,
    employeeId: req.employeeId,
    employeeBusinessUnits: req.employeeBusinessUnits,
  });
  const reachIds = Array.isArray(fullReach) ? fullReach : [fullReach];
  let poCompanyIds = [];
  if (mappedServicePOIds.length > 0) {
    const rows = await ServicePO.findAll({
      where: { id: mappedServicePOIds },
      attributes: ['company_id'],
      raw: true,
    });
    poCompanyIds = rows.map((r) => r.company_id).filter((id) => id != null);
  }
  return { mappedServicePOIds, scope: [...new Set([...reachIds, ...poCompanyIds].filter((id) => id != null))] };
}

/**
 * Same 404 as a genuinely missing Service PO, so an unmapped PO's existence is
 * never disclosed.
 * @param {number} servicePOId
 * @param {import('express').Request} req
 * @param {{ mappedServicePOIds: number[]|null, scope: number|number[] }} access
 * @returns {Promise<ServicePO>}
 */
async function assertServicePOAccessible(servicePOId, req, access) {
  const po = await servicePORepository.findById(servicePOId, access.scope, req.employeeId, null, access.mappedServicePOIds);
  if (!po) {
    const err = new Error('Service PO not found.');
    err.statusCode = 404;
    throw err;
  }
  return po;
}

/**
 * For an existing budget record (update/deactivate): a Project Manager/Delivery
 * Head may only touch records of a Service PO mapped to them.
 * @param {number} servicePOId - the record's service_po_id
 * @param {{ mappedServicePOIds: number[]|null }} access
 * @param {string} notFoundMessage
 */
function assertRecordServicePOAccessible(servicePOId, access, notFoundMessage) {
  if (access.mappedServicePOIds === null) return;
  if (!access.mappedServicePOIds.includes(Number(servicePOId))) {
    const err = new Error(notFoundMessage);
    err.statusCode = 404;
    throw err;
  }
}

module.exports = { resolveBudgetAccess, assertServicePOAccessible, assertRecordServicePOAccessible };
