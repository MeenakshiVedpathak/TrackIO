-- =============================================================================
-- employee_work_logs — raise the DB-level hours cap to match the new rules.
--
-- Daily rows: 12h -> 24h per row (the per-day total is enforced in
-- employeeTimesheetService.DAILY_HOUR_CAP = 24).
-- Monthly rows: 176h -> 744h per row (31 days x 24h, the largest any month can
-- hold; the exact days-in-month x 24 cap is enforced in
-- employeeMonthlyWorkLogService.getMonthlyHourCap).
--
-- Without this, saving more than 12h on a day failed at INSERT with a
-- check-constraint violation (chk_employee_work_logs_hours_by_log_type).
-- hours is already NUMERIC(6,2), so no column change is needed. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE employee_work_logs DROP CONSTRAINT IF EXISTS chk_employee_work_logs_hours_by_log_type;

ALTER TABLE employee_work_logs
  ADD CONSTRAINT chk_employee_work_logs_hours_by_log_type CHECK (
    hours > 0 AND (
      (log_type = 'daily' AND hours <= 24) OR
      (log_type = 'monthly' AND hours <= 744)
    )
  );

COMMIT;
