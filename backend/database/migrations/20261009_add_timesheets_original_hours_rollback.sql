BEGIN;
ALTER TABLE timesheets DROP COLUMN IF EXISTS original_hours;
DELETE FROM schema_migrations WHERE name = '20261009_add_timesheets_original_hours.sql';
COMMIT;
