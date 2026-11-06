-- Rollback for 20261013_audit_session_and_devices.sql
BEGIN;
DROP TABLE IF EXISTS user_devices;
DROP INDEX IF EXISTS idx_audit_logs_session;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS session_id;
COMMIT;
