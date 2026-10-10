-- Rollback for 20261010_audit_logs_device_id.sql
BEGIN;
DROP INDEX IF EXISTS idx_audit_logs_device;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS device_id;
COMMIT;
