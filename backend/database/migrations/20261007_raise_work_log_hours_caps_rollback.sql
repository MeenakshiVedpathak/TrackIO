-- Rollback for 20261007_raise_work_log_hours_caps.sql
-- NOT auto-run by the migration runner — apply manually if ever needed.
-- Fails if rows above 12h (daily) / 176h (monthly) already exist.

BEGIN;

ALTER TABLE employee_work_logs DROP CONSTRAINT IF EXISTS chk_employee_work_logs_hours_by_log_type;

ALTER TABLE employee_work_logs
  ADD CONSTRAINT chk_employee_work_logs_hours_by_log_type CHECK (
    hours > 0 AND (
      (log_type = 'daily' AND hours <= 12) OR
      (log_type = 'monthly' AND hours <= 176)
    )
  );

COMMIT;
