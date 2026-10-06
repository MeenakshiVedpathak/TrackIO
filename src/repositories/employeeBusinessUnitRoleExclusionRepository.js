'use strict';

const { Op } = require('sequelize');
const { EmployeeBusinessUnitRoleExclusion } = require('../models');
const logger = require('../utils/logger');

/**
 * Role-wise BU unmapping (see EmployeeBusinessUnitRoleExclusion). Reads are deliberately
 * fail-open: if the table is missing (migration not applied yet) every caller behaves as before —
 * no exclusions — instead of breaking login/lists.
 */

const safeRead = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    logger.warn('employee_business_unit_role_exclusions unavailable — treating as no exclusions', { error: err.message });
    return [];
  }
};

/** @returns {Promise<{employee_id:number,business_unit_id:number,role_id:number}[]>} */
const findByEmployeeIds = (employeeIds) =>
  safeRead(async () => {
    if (!employeeIds || employeeIds.length === 0) return [];
    const rows = await EmployeeBusinessUnitRoleExclusion.findAll({
      where: { employee_id: { [Op.in]: employeeIds } },
      attributes: ['employee_id', 'business_unit_id', 'role_id'],
      raw: true,
    });
    return rows;
  });

/** BU ids hidden from `roleIds` for one Employee. @returns {Promise<number[]>} */
const findExcludedBuIdsForRoles = async (employeeId, roleIds) => {
  if (!roleIds || roleIds.length === 0) return [];
  const rows = await safeRead(() =>
    EmployeeBusinessUnitRoleExclusion.findAll({
      where: { employee_id: employeeId, role_id: { [Op.in]: roleIds } },
      attributes: ['business_unit_id'],
      raw: true,
    })
  );
  return rows.map((row) => row.business_unit_id);
};

const addExclusions = async (employeeId, businessUnitIds, roleIds, actorId, transaction) => {
  const rows = businessUnitIds.flatMap((buId) =>
    roleIds.map((roleId) => ({ employee_id: employeeId, business_unit_id: buId, role_id: roleId, created_by: actorId }))
  );
  if (rows.length === 0) return;
  await EmployeeBusinessUnitRoleExclusion.bulkCreate(rows, { ignoreDuplicates: true, transaction });
};

const clearForBusinessUnits = async (employeeId, businessUnitIds, transaction) => {
  if (!businessUnitIds || businessUnitIds.length === 0) return;
  await EmployeeBusinessUnitRoleExclusion.destroy({
    where: { employee_id: employeeId, business_unit_id: { [Op.in]: businessUnitIds } },
    transaction,
  });
};

module.exports = { findByEmployeeIds, findExcludedBuIdsForRoles, addExclusions, clearForBusinessUnits };
