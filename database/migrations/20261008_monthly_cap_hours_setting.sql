-- =============================================================================
-- Monthly Cap Hours — make the (previously hard-coded 176h) monthly cap an
-- admin-editable system setting, and remember which cap each timesheet import
-- was synced with.
--
-- 1. system_settings: generic key/value table. First key: monthly_cap_hours
--    (seeded 176, so behaviour is unchanged until an Admin edits it).
-- 2. timesheet_import_history.cap_hours: the cap that was in force when this
--    import (Excel upload or Employee Work Log sync) was adjusted. Reports read
--    it so months synced at an old cap keep that cap; a re-sync replaces the
--    import and therefore stamps the then-latest cap. Existing rows are
--    backfilled with 176 via the column default.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value TEXT         NOT NULL,
  description   TEXT,
  updated_by    INTEGER,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'monthly_cap_hours',
  '176',
  'Monthly cap hours: an employee''s monthly timesheet hours are scaled down to this total at sync/import time, and reports use it as monthly capacity.'
)
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE timesheet_import_history
  ADD COLUMN IF NOT EXISTS cap_hours NUMERIC(6,2) NOT NULL DEFAULT 176;

COMMIT;
