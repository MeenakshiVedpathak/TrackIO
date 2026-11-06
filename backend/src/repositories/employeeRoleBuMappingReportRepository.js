'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

/**
 * Employee Role & Organization Mapping Report — raw data access.
 *
 * One row per Employee: their active roles, and the Business Units / Sub-BUs
 * they're actively mapped to (employee_business_units -> companies, using the
 * existing hierarchy: parent_business_unit_id IS NULL = BU, NOT NULL =
 * Sub-BU). Fully data-driven — no Entity/BU/role name or code appears here.
 *
 * Scope: only mappings to a Business Unit inside the caller's reach
 * (companyIds, from resolveReportCompanyScope) are read or shown, so an
 * Employee appears only if they hold at least one such mapping, and another
 * tenant's BU names never leak into the BUs/Sub BUs columns.
 *
 * Org filters (entityIds/buIds/subBuIds) are all tested against the SAME
 * mapping row: "BU = Technology AND Sub BU = Development" matches only an
 * Employee actually mapped to Development under Technology, never one whose
 * Technology BU and Support Sub-BU belong to different branches.
 */

/**
 * @param {object} filters
 * @param {number[]} filters.companyIds - caller's BU reach (always non-empty from the middleware)
 * @param {number[]} [filters.entityIds]
 * @param {number[]} [filters.buIds] - a mapping matches when it IS one of these BUs or a Sub-BU under one
 * @param {number[]} [filters.subBuIds]
 * @param {number[]} [filters.roleIds] - Employee holds at least one of these active roles
 * @param {number} [filters.employeeId]
 * @param {string} [filters.search] - employee name or code (contains, case-insensitive)
 * @param {number|null} [filters.limit] - null = every row (export)
 * @param {number} [filters.offset]
 * @returns {Promise<{ rows: object[], total: number }>}
 */
async function getEmployeeRoleBuMapping(filters) {
  const {
    companyIds, entityIds, buIds, subBuIds, roleIds, employeeId, search, limit = null, offset = 0,
  } = filters;
  if (!companyIds || companyIds.length === 0) return { rows: [], total: 0 };

  const replacements = { companyIds };

  // Per-mapping-row org match (see the file doc comment).
  const orgConditions = [];
  if (entityIds && entityIds.length) {
    orgConditions.push('m.entity_id IN (:entityIds)');
    replacements.entityIds = entityIds;
  }
  if (subBuIds && subBuIds.length) {
    orgConditions.push('m.unit_id IN (:subBuIds) AND m.parent_id IS NOT NULL');
    replacements.subBuIds = subBuIds;
    if (buIds && buIds.length) {
      orgConditions.push('m.parent_id IN (:buIds)');
      replacements.buIds = buIds;
    }
  } else if (buIds && buIds.length) {
    orgConditions.push('(m.unit_id IN (:buIds) OR m.parent_id IN (:buIds))');
    replacements.buIds = buIds;
  }

  const employeeConditions = ['e.is_deleted = false', "e.status = 'active'"];
  if (orgConditions.length) {
    employeeConditions.push(`EXISTS (
      SELECT 1 FROM mappings m
      WHERE m.employee_id = e.id AND ${orgConditions.join(' AND ')}
    )`);
  }
  if (roleIds && roleIds.length) {
    employeeConditions.push(`EXISTS (
      SELECT 1 FROM employee_roles fer
      INNER JOIN roles fr ON fr.id = fer.role_id AND fr.status = 'active' AND fr.is_deleted = false
      WHERE fer.employee_id = e.id AND fer.status = 'active' AND fer.role_id IN (:roleIds)
    )`);
    replacements.roleIds = roleIds;
  }
  if (employeeId) {
    employeeConditions.push('e.id = :employeeId');
    replacements.employeeId = employeeId;
  }
  if (search && search.trim()) {
    employeeConditions.push('(e.full_name ILIKE :search OR e.employee_code ILIKE :search)');
    replacements.search = `%${search.trim()}%`;
  }

  const base = `
    WITH mappings AS (
      SELECT
        ebu.employee_id,
        comp.id                                      AS unit_id,
        comp.company_name                            AS unit_name,
        comp.parent_business_unit_id                 AS parent_id,
        parent.company_name                          AS parent_name,
        COALESCE(comp.entity_id, parent.entity_id)   AS entity_id
      FROM employee_business_units ebu
      INNER JOIN companies comp ON comp.id = ebu.business_unit_id AND comp.is_deleted = false
      LEFT JOIN companies parent ON parent.id = comp.parent_business_unit_id AND parent.is_deleted = false
      WHERE ebu.status = 'active'
        AND comp.id IN (:companyIds)
    ),
    role_names AS (
      SELECT er.employee_id,
             STRING_AGG(DISTINCT r.role_name, ', ' ORDER BY r.role_name) AS roles
      FROM employee_roles er
      INNER JOIN roles r ON r.id = er.role_id AND r.status = 'active' AND r.is_deleted = false
      WHERE er.status = 'active'
      GROUP BY er.employee_id
    )
    SELECT
      e.id              AS employee_id,
      e.employee_code,
      e.full_name       AS employee_name,
      rn.roles,
      -- BU column: every top-level BU the Employee belongs to — a Sub-BU
      -- mapping contributes its Parent, so the BU is never missing just
      -- because only the Sub-BU was mapped.
      STRING_AGG(DISTINCT COALESCE(m.parent_name, m.unit_name), ', '
                 ORDER BY COALESCE(m.parent_name, m.unit_name))                        AS business_units,
      STRING_AGG(DISTINCT CASE WHEN m.parent_id IS NOT NULL THEN m.unit_name END, ', '
                 ORDER BY CASE WHEN m.parent_id IS NOT NULL THEN m.unit_name END)      AS sub_business_units
    FROM employees e
    INNER JOIN mappings m ON m.employee_id = e.id
    LEFT JOIN role_names rn ON rn.employee_id = e.id
    WHERE ${employeeConditions.join(' AND ')}
    GROUP BY e.id, e.employee_code, e.full_name, rn.roles`;

  const pageClause = limit != null ? 'LIMIT :limit OFFSET :offset' : '';
  const [rows, [countRow]] = await Promise.all([
    sequelize.query(`${base} ORDER BY e.full_name ASC, e.id ASC ${pageClause}`, {
      replacements: limit != null ? { ...replacements, limit, offset } : replacements,
      type: QueryTypes.SELECT,
    }),
    sequelize.query(`SELECT COUNT(*)::int AS total FROM (${base}) counted`, {
      replacements,
      type: QueryTypes.SELECT,
    }),
  ]);

  return { rows, total: countRow ? countRow.total : 0 };
}

module.exports = { getEmployeeRoleBuMapping };
