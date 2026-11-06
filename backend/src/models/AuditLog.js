'use strict';

const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
      });
    }
  }

  AuditLog.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: 'Action must be at most 50 characters.' },
        },
      },
      entity_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: 'Entity type must be at most 50 characters.' },
        },
      },
      entity_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      old_values: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      new_values: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      // The Business Unit the action belongs to and the role the actor acted in — see
      // database/migrations/20261009_audit_logs_bu_context.sql.
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      actor_role: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      // Random per-device id from the X-Device-Id header (see requestContext.getDeviceId) — stored
      // instead of the IP address; see database/migrations/20261010_audit_logs_device_id.sql.
      device_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      // Readable label of the device (X-Device-Name, else built from the User-Agent) — a label for
      // humans, not a hardware identifier. See database/migrations/20261012_audit_logs_device_name.sql.
      device_name: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      // The login session (employee_login_sessions.family_id) the action was done in — see
      // database/migrations/20261013_audit_session_and_devices.sql.
      session_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        validate: {
          len: { args: [0, 45], msg: 'IP address must be at most 45 characters.' },
        },
      },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return AuditLog;
};
