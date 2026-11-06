-- Rollback for 20261009_audit_logs_bu_context.sql (drops the added columns and indexes).
BEGIN;
DROP INDEX IF EXISTS idx_audit_logs_company_created;
DROP INDEX IF EXISTS idx_audit_logs_user_created;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS company_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS actor_role;
COMMIT;
