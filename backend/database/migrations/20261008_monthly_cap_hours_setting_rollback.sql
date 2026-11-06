BEGIN;
ALTER TABLE timesheet_import_history DROP COLUMN IF EXISTS cap_hours;
DROP TABLE IF EXISTS system_settings;
DELETE FROM schema_migrations WHERE name = '20261008_monthly_cap_hours_setting.sql';
COMMIT;
