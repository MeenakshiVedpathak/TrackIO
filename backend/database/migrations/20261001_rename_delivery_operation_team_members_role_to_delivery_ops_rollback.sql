-- Rollback for 20261001_rename_delivery_operation_team_members_role_to_delivery_ops.sql
-- Run manually if needed — the migration runner never picks this up
-- automatically (see migrationRunner.js's *_rollback.sql exclusion).
--
-- Restores both role_name AND is_system=true, matching this role's exact
-- pre-migration state.

BEGIN;

UPDATE roles
SET role_name = 'Delivery Operation Team Members',
    is_system = true,
    updated_at = NOW()
WHERE role_name = 'Delivery Ops';

COMMIT;
