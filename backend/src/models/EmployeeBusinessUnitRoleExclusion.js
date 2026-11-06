'use strict';

const { Model, DataTypes } = require('sequelize');

/**
 * Role-wise Business Unit unmapping — "this role of this Employee must NOT see this BU", while the
 * Employee's employee_business_units row (and so their other roles' access) stays. See
 * database/migrations/20261002_create_employee_business_unit_role_exclusions.sql.
 */
module.exports = (sequelize) => {
  class EmployeeBusinessUnitRoleExclusion extends Model {}

  EmployeeBusinessUnitRoleExclusion.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      employee_id: { type: DataTypes.INTEGER, allowNull: false },
      business_unit_id: { type: DataTypes.INTEGER, allowNull: false },
      role_id: { type: DataTypes.INTEGER, allowNull: false },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      sequelize,
      modelName: 'EmployeeBusinessUnitRoleExclusion',
      tableName: 'employee_business_unit_role_exclusions',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return EmployeeBusinessUnitRoleExclusion;
};
