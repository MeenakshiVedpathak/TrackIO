-- Rollback for 20261012_audit_logs_device_name.sql
BEGIN;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS device_name;
COMMIT;
