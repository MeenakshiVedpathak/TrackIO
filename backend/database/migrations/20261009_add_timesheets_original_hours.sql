-- =============================================================================
-- timesheets.original_hours — the hours exactly as the employee logged them
-- (or as uploaded in Excel), BEFORE the monthly-cap adjustment.
--
-- Sync / import scales an employee's month down to the Monthly Cap Hours and
-- stores the scaled value in hours_logged (and modified_hours), so a month the
-- employee logged as 180h with a 168 cap showed 168 everywhere — the "original"
-- (hoursSource = 'O') figure was never the real original. original_hours keeps
-- the real figure; reports' "original" selectors now read
-- COALESCE(original_hours, hours_logged).
--
-- NULL = unknown (row synced before this column existed and not recoverable):
-- readers fall back to hours_logged, which is what they always did.
--
-- Backfill: rows created by "Sync Employee Work Logs" can be recovered exactly —
-- the source employee_work_logs rows stay linked to the import
-- (timesheet_import_id) and are read-only once synced, so the original is their
-- summed hours per employee + Service PO + date (the same key the sync merges
-- duplicates on). Excel-uploaded rows can't be recovered; re-upload to populate.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS original_hours NUMERIC(5,2);

UPDATE timesheets t
   SET original_hours = s.original_hours
  FROM (
    SELECT w.timesheet_import_id, w.employee_id, w.service_po_id, w.work_date,
           SUM(w.hours) AS original_hours
      FROM employee_work_logs w
     WHERE w.timesheet_import_id IS NOT NULL
       AND w.status = 'synced'
     GROUP BY w.timesheet_import_id, w.employee_id, w.service_po_id, w.work_date
  ) s
 WHERE t.original_hours IS NULL
   AND t.timesheet_import_id = s.timesheet_import_id
   AND t.employee_id         = s.employee_id
   AND t.service_po_id       = s.service_po_id
   AND t.timesheet_date      = s.work_date
   AND s.original_hours BETWEEN 0 AND 999.99;

COMMIT;
