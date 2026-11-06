'use strict';

const logger = require('../utils/logger');

/**
 * Gate for editing system-wide settings (e.g. Monthly Cap Hours). Must run
 * after authenticate. Allows Admin (hierarchy_rank === 2) and Platform Admin
 * (rank 1, the system owner above Admin); every other role — Entity Admin,
 * BU Admin, Project Admin, Project Manager, Manager, Employee, HR — gets 403.
 * Rank-based, not a role-name check (see requireAdmin.js / requirePlatformAdmin.js).
 */
const requireSystemSettingsEditor = (req, res, next) => {
  if (!req.user || (req.hierarchyRank !== 1 && req.hierarchyRank !== 2)) {
    logger.warn('Non-Admin attempted to edit a system setting', {
      userId: req.userId,
      hierarchyRank: req.hierarchyRank,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({
      success: false,
      message: 'Access denied. System settings can only be changed by an Admin.',
      code: 'ADMIN_REQUIRED',
    });
  }
  next();
};

module.exports = requireSystemSettingsEditor;
