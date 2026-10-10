-- Rollback for 20261011_security_attempts.sql
BEGIN;
DROP TABLE IF EXISTS security_attempts;
COMMIT;
